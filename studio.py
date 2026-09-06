#!/usr/bin/env python3
"""Publisher Studio — Voice + Jarvis for Book Publisher Pro.

One app: frictionless dictation, spoken/typed commands, notes, and Gemini assist.

  Windows:
    python -m venv .venv
    .\\.venv\\Scripts\\activate
    pip install -r requirements.txt
    python studio.py

  macOS / Linux:
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    python studio.py

`python run_voice.py` and `python jarvis.py` launch this same studio.
This cloud/Linux runner has no microphone. Typed input is the default.
If SpeechRecognition + a microphone are available locally, spoken lines
are transcribed automatically. pyttsx3 is used for read-back when installed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import traceback
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"
DEFAULT_SAVE_DIR = Path("studio_sessions")
ENV_FILES = (".env.local", ".env")
WAKE_PATTERNS = (
    r"^hey\s+jarvis[,\s:]+",
    r"^ok(?:ay)?\s+jarvis[,\s:]+",
    r"^jarvis[,\s:]+",
    r"^hey\s+studio[,\s:]+",
    r"^studio[,\s:]+",
)
WAKE_ONLY = {
    "jarvis",
    "hey jarvis",
    "ok jarvis",
    "okay jarvis",
    "studio",
    "hey studio",
}
QUIT_PHRASES = {
    "quit",
    "exit",
    "q",
    "goodbye",
    "good bye",
    "bye",
    "stand down",
    "power down",
    "that's all",
    "thats all",
    "go offline",
    "sleep",
    "dismissed",
}
QUESTION_START = re.compile(
    r"^(what|what's|whats|why|how|when|where|who|whom|which|can|could|"
    r"should|would|is|are|am|do|does|did|will|may|might)\b",
    re.IGNORECASE,
)
HELP_TEXT = (
    "Publisher Studio — Voice dictation + Jarvis assistant\n"
    "Commands:\n"
    "  /help                 Show this list\n"
    "  /status               Session and manuscript stats\n"
    "  /time                 Current date and time\n"
    "  /ask <question>       Ask Jarvis (uses Gemini when configured)\n"
    "  /note <text>          Store a reminder\n"
    "  /notes                List reminders\n"
    "  /title <name>         Set book title\n"
    "  /author <name>        Set author\n"
    "  /chapter [title]      Start a new chapter\n"
    "  /use <n>              Switch to chapter number\n"
    "  /list                 List chapters\n"
    "  /dictate <text>       Append text to the current chapter\n"
    "  /read                 Read the current chapter aloud\n"
    "  /outline              Generate an AI outline\n"
    "  /refine               Get AI editing notes\n"
    "  /save [path]          Save markdown or JSON\n"
    "  /export [path]        Export the full manuscript\n"
    "  /quit                 Exit\n"
    "Plain lines are dictated into the manuscript (Voice Studio).\n"
    "Questions and phrases like \"remember …\" or \"Jarvis, what time is it?\" "
    "go to the assistant."
)


@dataclass
class Chapter:
    title: str
    body: str = ""


@dataclass
class BookSession:
    title: str = "The Art of Publishing"
    author: str = "Jane Doe"
    chapters: list[Chapter] = field(default_factory=list)
    current: int = 0

    def ensure_chapter(self) -> Chapter:
        if not self.chapters:
            self.chapters.append(Chapter(title="Chapter 1"))
            self.current = 0
        self.current = max(0, min(self.current, len(self.chapters) - 1))
        return self.chapters[self.current]

    def word_count(self) -> int:
        words = 0
        for chapter in self.chapters:
            text = chapter.body.strip()
            if text:
                words += len(text.split())
        return words

    def to_markdown(self) -> str:
        lines = [
            f"# {self.title}",
            "",
            f"*by {self.author}*",
            "",
            "## Contents",
            "",
        ]
        for index, chapter in enumerate(self.chapters, start=1):
            lines.append(f"{index}. {chapter.title}")
        lines.append("")
        for chapter in self.chapters:
            lines.extend(["", f"## {chapter.title}", "", chapter.body.rstrip(), ""])
        return "\n".join(lines).rstrip() + "\n"

    def to_json(self) -> dict:
        return {
            "title": self.title,
            "author": self.author,
            "current": self.current,
            "chapters": [asdict(chapter) for chapter in self.chapters],
            "word_count": self.word_count(),
        }


@dataclass
class StudioSession:
    book: BookSession = field(default_factory=BookSession)
    notes: list[str] = field(default_factory=list)
    history: list[tuple[str, str]] = field(default_factory=list)


JarvisSession = StudioSession


def load_env_files(root: Path | None = None) -> None:
    base = root or Path.cwd()
    for name in ENV_FILES:
        path = base / name
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def gemini_api_key() -> str | None:
    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key or key in {"MY_GEMINI_API_KEY", "your_api_key_here"}:
        return None
    return key


def generate_with_gemini(prompt: str, system: str) -> str:
    key = gemini_api_key()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env.local and add your key."
        )
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise RuntimeError(
            "google-genai is not installed. Run: pip install -r requirements.txt"
        ) from exc

    client = genai.Client(api_key=key)
    last_error: Exception | None = None
    afc = None
    if hasattr(types, "AutomaticFunctionCallingConfig"):
        afc = types.AutomaticFunctionCallingConfig(disable=True)
    config_kwargs: dict = {"system_instruction": system}
    if afc is not None:
        config_kwargs["automatic_function_calling"] = afc
    for model in (GEMINI_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            text = (getattr(response, "text", None) or "").strip()
            if text:
                return text
        except Exception as exc:  # noqa: BLE001 - surface Gemini/transport errors
            last_error = exc
    raise RuntimeError(f"Gemini request failed: {last_error}") from last_error


def speak(text: str) -> str:
    """Read text aloud when a TTS engine is available; always echo to stdout."""
    cleaned = text.strip()
    if not cleaned:
        return "Nothing to read."
    print("\n[VOICE]\n" + cleaned + "\n")
    try:
        import pyttsx3

        engine = pyttsx3.init()
        engine.say(cleaned)
        engine.runAndWait()
        return "Read aloud with pyttsx3."
    except Exception:
        if sys.platform == "win32":
            try:
                import subprocess

                escaped = cleaned.replace("'", "''")
                subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        (
                            "Add-Type -AssemblyName System.Speech; "
                            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                            f"$s.Speak('{escaped[:4000]}')"
                        ),
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                return "Read aloud with Windows SAPI."
            except Exception:
                pass
        if shutil.which("espeak-ng") or shutil.which("espeak"):
            binary = shutil.which("espeak-ng") or shutil.which("espeak")
            try:
                import subprocess

                subprocess.run([binary, cleaned[:4000]], check=False)
                return f"Read aloud with {Path(binary).name}."
            except Exception:
                pass
    return "Printed voice line (no TTS engine installed)."


def listen_once(timeout: float = 6.0) -> str | None:
    """Capture one spoken line when a microphone stack is installed."""
    try:
        import speech_recognition as sr
    except ImportError:
        return None
    recognizer = sr.Recognizer()
    try:
        with sr.Microphone() as source:
            print("Listening…")
            recognizer.adjust_for_ambient_noise(source, duration=0.4)
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=12)
        return recognizer.recognize_google(audio)
    except Exception:
        return None


def prompt_line(force_text: bool) -> str:
    isatty = getattr(sys.stdin, "isatty", None)
    if not force_text and isatty and isatty():
        spoken = listen_once()
        if spoken:
            print(f"Heard: {spoken}")
            return spoken
    try:
        return input("studio> ").strip()
    except EOFError:
        return "/quit"


def save_session(book: BookSession, destination: Path, notes: list[str] | None = None) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".json":
        payload = book.to_json()
        if notes is not None:
            payload["notes"] = notes
        destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    else:
        if destination.suffix.lower() not in {".md", ".markdown", ".txt"}:
            destination = destination.with_suffix(".md")
        destination.write_text(book.to_markdown(), encoding="utf-8")
    return destination


def default_export_path(book: BookSession, suffix: str = ".md") -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in book.title).strip("-")
    slug = slug or "manuscript"
    return DEFAULT_SAVE_DIR / f"{slug}-{stamp}{suffix}"


def now_display(moment: datetime | None = None) -> str:
    stamp = moment or datetime.now(timezone.utc)
    return stamp.strftime("%A, %B %d, %Y — %H:%M UTC")


def strip_wake_word(raw: str) -> str:
    text = raw.strip()
    lowered = text.lower()
    if lowered in WAKE_ONLY:
        return ""
    for pattern in WAKE_PATTERNS:
        updated = re.sub(pattern, "", text, count=1, flags=re.IGNORECASE)
        if updated != text:
            return updated.strip()
    return text


def status_line(session: StudioSession) -> str:
    book = session.book
    chapter = book.ensure_chapter()
    notes = f"{len(session.notes)} note(s)"
    return (
        f"{book.title} by {book.author} — "
        f"{len(book.chapters)} chapter(s), {book.word_count()} words. "
        f"Current: {chapter.title}. {notes}."
    )


def handle_slash(session: StudioSession, command: str, argument: str) -> str:
    book = session.book

    if command in {"help", "h", "?"}:
        return HELP_TEXT

    if command == "status":
        return status_line(session)

    if command in {"time", "date"}:
        return f"It is {now_display()}."

    if command in {"note", "remember"}:
        if not argument:
            return "Usage: /note <text>"
        session.notes.append(argument)
        return f"Noted ({len(session.notes)} stored)."

    if command == "notes":
        if not session.notes:
            return "No notes yet. Say \"remember …\" or use /note."
        return "\n".join(f"{index}. {note}" for index, note in enumerate(session.notes, start=1))

    if command == "ask":
        if not argument:
            return "Usage: /ask <question>"
        return ask_jarvis(session, argument)

    if command == "title":
        if not argument:
            return f"Title is currently: {book.title}"
        book.title = argument
        return f"Title set to {book.title}."

    if command == "author":
        if not argument:
            return f"Author is currently: {book.author}"
        book.author = argument
        return f"Author set to {book.author}."

    if command == "chapter":
        title = argument or f"Chapter {len(book.chapters) + 1}"
        book.chapters.append(Chapter(title=title))
        book.current = len(book.chapters) - 1
        return f"Started {title}."

    if command == "use":
        if not argument.isdigit():
            return "Usage: /use <chapter-number>"
        index = int(argument) - 1
        if index < 0 or index >= len(book.chapters):
            return "That chapter does not exist. Use /list."
        book.current = index
        return f"Now editing {book.chapters[index].title}."

    if command == "list":
        if not book.chapters:
            return "No chapters yet. Dictate text or use /chapter."
        rows = []
        for index, chapter in enumerate(book.chapters, start=1):
            marker = "*" if index - 1 == book.current else " "
            count = len(chapter.body.split()) if chapter.body.strip() else 0
            rows.append(f"{marker} {index}. {chapter.title} ({count} words)")
        return "\n".join(rows)

    if command in {"dictate", "write"}:
        if not argument:
            return "Usage: /dictate <text>"
        chapter = book.ensure_chapter()
        chapter.body = (chapter.body + ("\n" if chapter.body else "") + argument).strip()
        return f"Dictated {len(argument.split())} words into {chapter.title}."

    if command == "read":
        chapter = book.ensure_chapter()
        payload = f"{chapter.title}. {chapter.body}".strip()
        return speak(payload)

    if command == "outline":
        book.ensure_chapter()
        outline = generate_with_gemini(
            (
                f'Generate a professional book outline for "{book.title}" by {book.author}. '
                "Provide chapters with brief descriptions."
            ),
            "You are a professional book editor and strategist. "
            "Create clear, compelling, and structured book outlines.",
        )
        book.chapters.append(Chapter(title="Book Outline", body=outline))
        book.current = len(book.chapters) - 1
        return f"Added Book Outline ({len(outline.split())} words)."

    if command == "refine":
        chapter = book.ensure_chapter()
        if not chapter.body.strip():
            return "Dictate some text first, then run /refine."
        notes = generate_with_gemini(
            (
                "Proofread and provide editing suggestions. Focus on grammar, flow, and tone. "
                f"Keep the notes concise.\n\nManuscript:\n{chapter.body}"
            ),
            "You are an expert book editor. Provide constructive, professional feedback.",
        )
        return "AI suggestions:\n" + notes

    if command in {"save", "export"}:
        path = Path(argument) if argument else default_export_path(book)
        written = save_session(book, path, notes=session.notes)
        return f"Wrote {written.resolve()}"

    if command in {"quit", "exit", "q"}:
        return "__QUIT__"

    return f"Unknown command /{command}. Try /help."


def ask_jarvis(session: StudioSession, question: str) -> str:
    book = session.book
    notes = "; ".join(session.notes) if session.notes else "none"
    try:
        return generate_with_gemini(
            question,
            (
                "You are Jarvis, a concise personal assistant inside Publisher Studio "
                "for Book Publisher Pro. Answer clearly in a few sentences. "
                f"Current manuscript: {book.title} by {book.author}, "
                f"{book.word_count()} words. Notes: {notes}."
            ),
        )
    except RuntimeError as exc:
        return (
            f"I heard you, but I cannot answer conversationally yet: {exc} "
            "I can still take notes, dictate, and manage the manuscript. Try /help."
        )


def looks_like_question(text: str) -> bool:
    stripped = text.strip()
    if stripped.endswith("?"):
        return True
    return bool(QUESTION_START.match(stripped))


def handle_natural(session: StudioSession, text: str) -> str:
    lowered = re.sub(r"[?!.,]+$", "", text.lower()).strip()

    if lowered in QUIT_PHRASES:
        return "__QUIT__"

    if lowered in {"help", "what can you do", "commands", "list commands"}:
        return handle_slash(session, "help", "")

    if re.search(r"\b(time|date|day)\b", lowered) and re.search(
        r"\b(what|what'?s|tell|current|now)\b", lowered
    ):
        return handle_slash(session, "time", "")
    if lowered in {"time", "date", "what time is it", "what's the time", "whats the time"}:
        return handle_slash(session, "time", "")

    if lowered in {"status", "how are we doing", "session"}:
        return handle_slash(session, "status", "")

    if lowered in {"notes", "show notes", "list notes"}:
        return handle_slash(session, "notes", "")

    note_match = re.match(
        r"^(?:remember(?:\s+that)?|note(?:\s+that)?|make a note(?:\s+that)?)\s+(.+)$",
        text,
        flags=re.IGNORECASE,
    )
    if note_match:
        return handle_slash(session, "note", note_match.group(1).strip())

    dictate_match = re.match(
        r"^(?:dictate|write(?:\s+this)?|take this down)[:\s]+(.+)$",
        text,
        flags=re.IGNORECASE,
    )
    if dictate_match:
        return handle_slash(session, "dictate", dictate_match.group(1).strip())

    if re.search(r"\b(read(?:\s+it)?|read(?:\s+the)?\s+chapter|speak(?:\s+it)?)\b", lowered):
        return handle_slash(session, "read", "")

    if re.search(r"\boutline\b", lowered):
        return handle_slash(session, "outline", "")

    if re.search(r"\b(refine|proofread|edit(?:ing)? notes)\b", lowered):
        return handle_slash(session, "refine", "")

    if re.search(r"\b(export|save(?:\s+the)?\s+manuscript|save(?:\s+it)?)\b", lowered):
        return handle_slash(session, "export", "")

    if looks_like_question(text):
        return ask_jarvis(session, text)

    return handle_slash(session, "dictate", text)


def handle_turn(session: StudioSession, raw: str) -> str:
    line = strip_wake_word(raw)
    if raw.strip() and not line:
        return "Yes? How may I help?"
    if not line:
        return ""
    if line.startswith("/"):
        parts = line[1:].split(maxsplit=1)
        command = parts[0].lower()
        argument = parts[1].strip() if len(parts) > 1 else ""
        return handle_slash(session, command, argument)
    return handle_natural(session, line)


def handle_command(book: BookSession, raw: str) -> str:
    """Voice Studio contract: slash commands, otherwise dictate the line."""
    session = StudioSession(book=book)
    line = raw.strip()
    if not line:
        return ""
    if not line.startswith("/"):
        return handle_slash(session, "dictate", line)
    return handle_turn(session, line)


def run_repl(session: StudioSession, force_text: bool, printer: Callable[[str], None] = print) -> int:
    printer("Publisher Studio — Voice dictation + Jarvis assistant")
    printer("Type /help for commands. Plain lines are dictated. Ask questions or say Jarvis …")
    printer(handle_turn(session, "/status"))
    while True:
        raw = prompt_line(force_text)
        try:
            result = handle_turn(session, raw)
        except Exception as exc:  # noqa: BLE001
            printer(f"Error: {exc}")
            continue
        if result == "__QUIT__":
            printer("Standing down. Goodbye.")
            return 0
        if result:
            printer(result)
            session.history.append((raw, result))


def run_batch(session: StudioSession, printer: Callable[[str], None] = print) -> int:
    printer("Publisher Studio (piped input)")
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        printer(f"> {line}")
        try:
            result = handle_turn(session, line)
        except Exception as exc:  # noqa: BLE001
            printer(f"Error: {exc}")
            continue
        if result == "__QUIT__":
            printer("Standing down. Goodbye.")
            return 0
        if result:
            printer(result)
            session.history.append((line, result))
    return 0


def run_demo(session: StudioSession, output_dir: Path) -> int:
    steps = [
        "Jarvis",
        "what time is it?",
        "/help",
        "remember the working title is Midnight Typesetter",
        "/title Voice Studio Smoke Test",
        "/author Publisher Pro",
        "/chapter Opening Page",
        "The blank page is the most daunting part of the publishing journey.",
        "With Book Publisher Pro, the words seem to flow naturally.",
        "dictate: With Jarvis at the desk, the words seem to flow naturally.",
        "/list",
        "/status",
        "/notes",
        "/read",
    ]
    for step in steps:
        print(f"> {step}")
        result = handle_turn(session, step)
        if result == "__QUIT__":
            raise AssertionError("Demo should not quit early")
        if result:
            print(result)
    export_path = output_dir / "demo-manuscript.md"
    saved = handle_turn(session, f"/export {export_path}")
    print(saved)
    markdown = export_path.read_text(encoding="utf-8")
    required = (
        "# Voice Studio Smoke Test",
        "*by Publisher Pro*",
        "## Opening Page",
        "blank page",
        "Book Publisher Pro",
        "Jarvis at the desk",
    )
    missing = [item for item in required if item not in markdown]
    if missing:
        raise AssertionError(f"Demo export missing {missing}:\n{markdown}")
    if session.book.word_count() < 10:
        raise AssertionError(f"Expected dictated words, got {session.book.word_count()}")
    if not any("Midnight Typesetter" in note for note in session.notes):
        raise AssertionError(f"Expected working-title note, got {session.notes}")
    print("DEMO_OK")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Publisher Studio for Book Publisher Pro (dictation, Jarvis, Gemini)."
    )
    parser.add_argument(
        "--text",
        action="store_true",
        help="Force typed input even if a microphone is available.",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run a non-interactive smoke test and exit.",
    )
    parser.add_argument(
        "--manuscript",
        type=Path,
        help="Load an existing markdown or JSON manuscript first.",
    )
    parser.add_argument(
        "--save-dir",
        type=Path,
        default=DEFAULT_SAVE_DIR,
        help="Directory used for default exports (default: studio_sessions).",
    )
    return parser


def load_manuscript(path: Path) -> BookSession:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        book = BookSession(
            title=data.get("title", "Untitled Manuscript"),
            author=data.get("author", "Unknown Author"),
            current=int(data.get("current") or 0),
        )
        for item in data.get("chapters") or []:
            book.chapters.append(
                Chapter(title=item.get("title", "Chapter"), body=item.get("body", ""))
            )
        book.ensure_chapter()
        return book
    book = BookSession(title=path.stem.replace("-", " ").title(), author="Unknown Author")
    book.chapters.append(Chapter(title="Imported", body=text))
    return book


def main(argv: list[str] | None = None) -> int:
    load_env_files()
    args = build_parser().parse_args(argv)
    global DEFAULT_SAVE_DIR
    DEFAULT_SAVE_DIR = args.save_dir
    book = load_manuscript(args.manuscript) if args.manuscript else BookSession()
    session = StudioSession(book=book)
    if args.manuscript and args.manuscript.suffix.lower() == ".json":
        data = json.loads(args.manuscript.read_text(encoding="utf-8"))
        session.notes = list(data.get("notes") or [])
    if args.demo:
        return run_demo(session, args.save_dir)
    isatty = getattr(sys.stdin, "isatty", None)
    if not (isatty and isatty()):
        return run_batch(session)
    return run_repl(session, force_text=args.text)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStanding down. Goodbye.")
        raise SystemExit(130)
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
