#!/usr/bin/env python3
"""Book Publisher Pro voice studio.

Activate a virtual environment, then start a dictation / read-back session:

  Windows:
    python -m venv .venv
    .\\.venv\\Scripts\\activate
    pip install -r requirements-voice.txt
    python run_voice.py

  macOS / Linux:
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements-voice.txt
    python run_voice.py

This cloud/Linux runner has no microphone. Typed input is the default.
If SpeechRecognition + a microphone are available locally, spoken lines
are transcribed automatically. pyttsx3 is used for read-back when installed.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import traceback
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"
DEFAULT_SAVE_DIR = Path("voice_sessions")
ENV_FILES = (".env.local", ".env")


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
            "google-genai is not installed. Run: pip install -r requirements-voice.txt"
        ) from exc

    client = genai.Client(api_key=key)
    last_error: Exception | None = None
    for model in (GEMINI_MODEL, GEMINI_FALLBACK_MODEL):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(system_instruction=system),
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
    if not force_text and sys.stdin.isatty():
        spoken = listen_once()
        if spoken:
            print(f"Heard: {spoken}")
            return spoken
    try:
        return input("voice> ").strip()
    except EOFError:
        return "/quit"


def save_session(book: BookSession, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".json":
        destination.write_text(json.dumps(book.to_json(), indent=2), encoding="utf-8")
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


def handle_command(book: BookSession, raw: str) -> str:
    line = raw.strip()
    if not line:
        return ""
    if not line.startswith("/"):
        chapter = book.ensure_chapter()
        chapter.body = (chapter.body + ("\n" if chapter.body else "") + line).strip()
        return f"Dictated {len(line.split())} words into {chapter.title}."

    parts = line[1:].split(maxsplit=1)
    command = parts[0].lower()
    argument = parts[1].strip() if len(parts) > 1 else ""

    if command in {"help", "h", "?"}:
        return (
            "Commands:\n"
            "  /help                 Show this list\n"
            "  /title <name>         Set book title\n"
            "  /author <name>        Set author\n"
            "  /chapter [title]      Start a new chapter\n"
            "  /use <n>              Switch to chapter number\n"
            "  /list                 List chapters\n"
            "  /status               Show session stats\n"
            "  /read                 Read the current chapter aloud\n"
            "  /outline              Generate an AI outline\n"
            "  /refine               Get AI editing notes\n"
            "  /save [path]          Save markdown or JSON\n"
            "  /export [path]        Export the full manuscript\n"
            "  /quit                 Exit\n"
            "Anything else is treated as dictated manuscript text."
        )

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

    if command == "status":
        chapter = book.ensure_chapter()
        return (
            f"{book.title} by {book.author} — "
            f"{len(book.chapters)} chapter(s), {book.word_count()} words. "
            f"Current: {chapter.title}."
        )

    if command == "read":
        chapter = book.ensure_chapter()
        payload = f"{chapter.title}. {chapter.body}".strip()
        return speak(payload)

    if command == "outline":
        chapter = book.ensure_chapter()
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
        written = save_session(book, path)
        return f"Wrote {written.resolve()}"

    if command in {"quit", "exit", "q"}:
        return "__QUIT__"

    return f"Unknown command /{command}. Try /help."


def run_repl(book: BookSession, force_text: bool, printer: Callable[[str], None] = print) -> int:
    printer("Book Publisher Pro — Voice Studio")
    printer("Type /help for commands. Dictation is anything that is not a slash command.")
    printer(handle_command(book, "/status"))
    while True:
        raw = prompt_line(force_text)
        try:
            result = handle_command(book, raw)
        except Exception as exc:  # noqa: BLE001
            printer(f"Error: {exc}")
            continue
        if result == "__QUIT__":
            printer("Goodbye.")
            return 0
        if result:
            printer(result)


def run_demo(book: BookSession, output_dir: Path) -> int:
    steps = [
        "/title Voice Studio Smoke Test",
        "/author Publisher Pro",
        "/chapter Opening Page",
        "The blank page is the most daunting part of the publishing journey.",
        "With Book Publisher Pro, the words seem to flow naturally.",
        "/list",
        "/status",
        "/read",
    ]
    for step in steps:
        print(f"> {step}")
        result = handle_command(book, step)
        if result:
            print(result)
    export_path = output_dir / "demo-manuscript.md"
    saved = handle_command(book, f"/export {export_path}")
    print(saved)
    markdown = export_path.read_text(encoding="utf-8")
    required = (
        "# Voice Studio Smoke Test",
        "*by Publisher Pro*",
        "## Opening Page",
        "blank page",
        "Book Publisher Pro",
    )
    missing = [item for item in required if item not in markdown]
    if missing:
        raise AssertionError(f"Demo export missing {missing}:\n{markdown}")
    if book.word_count() < 10:
        raise AssertionError(f"Expected dictated words, got {book.word_count()}")
    print("DEMO_OK")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Voice studio for Book Publisher Pro (dictation, read-back, Gemini assist)."
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
        help="Directory used for default exports (default: voice_sessions).",
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
    if args.demo:
        return run_demo(book, args.save_dir)
    if not sys.stdin.isatty():
        print("No TTY detected. Use --demo for a smoke test, or run from a terminal.")
        return 2
    return run_repl(book, force_text=args.text)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nGoodbye.")
        raise SystemExit(130)
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
