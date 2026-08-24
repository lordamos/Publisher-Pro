#!/usr/bin/env python3
"""Jarvis workspace — voice-capable personal assistant for Book Publisher Pro.

Dependencies (see requirements.txt):
  sounddevice, numpy, requests, python-dotenv

Quick start:
  python3 -m venv .venv
  source .venv/bin/activate          # Windows: .\\.venv\\Scripts\\activate
  pip install -r requirements.txt
  cp .env.example .env               # then edit keys
  python jarvis.py                   # interactive (text if no mic)
  python jarvis.py --voice           # mic + speakers when available
  python jarvis.py --demo            # non-interactive smoke test
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import struct
import sys
import wave
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests
from dotenv import load_dotenv

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_FALLBACK_MODEL = "gemini-2.0-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)
DEFAULT_SAVE_DIR = Path("jarvis_sessions")
WAKE_PATTERNS = (
    r"^hey\s+jarvis[,\s:]+",
    r"^ok(?:ay)?\s+jarvis[,\s:]+",
    r"^jarvis[,\s:]+",
)
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
HELP_TEXT = (
    "Commands:\n"
    "  /help                 Show this list\n"
    "  /status               Session and manuscript stats\n"
    "  /time                 Current date and time\n"
    "  /ask <question>       Ask Jarvis (Gemini or OpenAI when configured)\n"
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
    "  /devices              List sounddevice input/output devices\n"
    "  /quit                 Exit\n"
    "You can also speak naturally: \"Jarvis, what time is it?\" "
    "or \"remember the deadline is Friday\"."
)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


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

    def to_json(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "author": self.author,
            "current": self.current,
            "chapters": [asdict(chapter) for chapter in self.chapters],
            "word_count": self.word_count(),
        }


@dataclass
class JarvisSession:
    book: BookSession = field(default_factory=BookSession)
    notes: list[str] = field(default_factory=list)
    history: list[tuple[str, str]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Config / env
# ---------------------------------------------------------------------------


def load_env(root: Path | None = None) -> None:
    """Load `.env` then `.env.local` from the project root (local wins)."""
    base = root or Path(__file__).resolve().parent
    load_dotenv(base / ".env", override=False)
    load_dotenv(base / ".env.local", override=True)


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _is_placeholder(value: str) -> bool:
    lowered = value.lower()
    return (
        not value
        or value.startswith("your_")
        or value.startswith("MY_")
        or "placeholder" in lowered
        or value in {"changeme", "xxx", "sk-..."}
    )


def gemini_api_key() -> str | None:
    key = _env("GEMINI_API_KEY")
    if _is_placeholder(key):
        return None
    return key


def openai_api_key() -> str | None:
    key = _env("OPENAI_API_KEY")
    if _is_placeholder(key):
        return None
    return key


def openai_base_url() -> str:
    return _env("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")


# ---------------------------------------------------------------------------
# Audio (sounddevice + numpy)
# ---------------------------------------------------------------------------


def audio_defaults() -> tuple[int, int, float]:
    rate = _env_int("JARVIS_SAMPLE_RATE", 16000)
    channels = _env_int("JARVIS_CHANNELS", 1)
    seconds = float(_env("JARVIS_RECORD_SECONDS") or "5")
    return rate, channels, seconds


def _device_arg(name: str) -> int | str | None:
    raw = _env(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return raw


def list_audio_devices() -> str:
    try:
        import sounddevice as sd
    except Exception as exc:  # noqa: BLE001
        return f"sounddevice unavailable: {exc}"
    lines = ["Audio devices (sounddevice):"]
    try:
        devices = sd.query_devices()
    except Exception as exc:  # noqa: BLE001
        return f"Could not query devices: {exc}"
    if not devices:
        lines.append("  (none found — text mode still works)")
    for index, device in enumerate(devices):
        kind = []
        if device.get("max_input_channels", 0) > 0:
            kind.append("in")
        if device.get("max_output_channels", 0) > 0:
            kind.append("out")
        lines.append(
            f"  [{index}] {device.get('name', '?')} "
            f"({'/'.join(kind) or 'n/a'}, {device.get('default_samplerate', '?')} Hz)"
        )
    return "\n".join(lines)


def record_audio(seconds: float | None = None) -> tuple[np.ndarray, int]:
    """Record mono float32 audio from the default (or configured) input device."""
    import sounddevice as sd

    rate, channels, default_seconds = audio_defaults()
    duration = float(seconds if seconds is not None else default_seconds)
    device = _device_arg("JARVIS_INPUT_DEVICE")
    frames = int(duration * rate)
    recording = sd.rec(
        frames,
        samplerate=rate,
        channels=channels,
        dtype="float32",
        device=device,
    )
    sd.wait()
    return np.asarray(recording, dtype=np.float32), rate


def float_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    """Encode float32 [-1, 1] audio as 16-bit PCM WAV bytes."""
    mono = audio
    if mono.ndim > 1:
        mono = mono.mean(axis=1)
    clipped = np.clip(mono, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return buffer.getvalue()


def play_audio(audio: np.ndarray, sample_rate: int) -> None:
    import sounddevice as sd

    device = _device_arg("JARVIS_OUTPUT_DEVICE")
    sd.play(audio, samplerate=sample_rate, device=device)
    sd.wait()


def play_wav_bytes(data: bytes) -> None:
    with wave.open(io.BytesIO(data), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())
    if sample_width == 2:
        fmt = f"<{len(frames) // 2}h"
        ints = struct.unpack(fmt, frames)
        audio = np.asarray(ints, dtype=np.float32) / 32768.0
    else:
        audio = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        audio = (audio - 128.0) / 128.0
    if channels > 1:
        audio = audio.reshape(-1, channels)
    play_audio(audio, rate)


# ---------------------------------------------------------------------------
# AI backends (requests)
# ---------------------------------------------------------------------------


def _gemini_generate(prompt: str, system: str) -> str:
    key = gemini_api_key()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to .env (see .env.example)."
        )
    last_error: Exception | None = None
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    }
    for model in (GEMINI_MODEL, GEMINI_FALLBACK_MODEL):
        url = GEMINI_URL.format(model=model)
        try:
            response = requests.post(
                url,
                params={"key": key},
                headers={"Content-Type": "application/json"},
                json=body,
                timeout=60,
            )
            if response.status_code >= 400:
                last_error = RuntimeError(
                    f"{model} HTTP {response.status_code}: {response.text[:300]}"
                )
                continue
            payload = response.json()
            parts = (
                payload.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            )
            text = "".join(part.get("text", "") for part in parts).strip()
            if text:
                return text
            last_error = RuntimeError(f"{model} returned empty text")
        except requests.RequestException as exc:
            last_error = exc
    raise RuntimeError(f"Gemini request failed: {last_error}") from last_error


def _openai_chat(prompt: str, system: str) -> str:
    key = openai_api_key()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    model = _env("OPENAI_CHAT_MODEL", "gpt-4o-mini")
    response = requests.post(
        f"{openai_base_url()}/chat/completions",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
        },
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI HTTP {response.status_code}: {response.text[:300]}")
    payload = response.json()
    return (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


def generate_reply(prompt: str, system: str) -> str:
    """Prefer Gemini when configured, otherwise OpenAI chat."""
    if gemini_api_key():
        return _gemini_generate(prompt, system)
    if openai_api_key():
        return _openai_chat(prompt, system)
    raise RuntimeError(
        "No AI key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env."
    )


def transcribe_wav(wav_bytes: bytes) -> str:
    key = openai_api_key()
    if not key:
        raise RuntimeError(
            "Voice transcription needs OPENAI_API_KEY for Whisper. "
            "Use typed input or --text mode instead."
        )
    model = _env("OPENAI_WHISPER_MODEL", "whisper-1")
    response = requests.post(
        f"{openai_base_url()}/audio/transcriptions",
        headers={"Authorization": f"Bearer {key}"},
        files={"file": ("speech.wav", wav_bytes, "audio/wav")},
        data={"model": model},
        timeout=90,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Whisper HTTP {response.status_code}: {response.text[:300]}"
        )
    return (response.json().get("text") or "").strip()


def synthesize_speech(text: str) -> bytes:
    key = openai_api_key()
    if not key:
        raise RuntimeError("TTS needs OPENAI_API_KEY.")
    model = _env("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
    voice = _env("OPENAI_TTS_VOICE", "alloy")
    response = requests.post(
        f"{openai_base_url()}/audio/speech",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "voice": voice,
            "input": text[:4000],
            "response_format": "wav",
        },
        timeout=90,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"TTS HTTP {response.status_code}: {response.text[:300]}")
    return response.content


# ---------------------------------------------------------------------------
# Speech helpers
# ---------------------------------------------------------------------------


def speak(text: str, *, voice: bool = False) -> str:
    cleaned = text.strip()
    if not cleaned:
        return "Nothing to read."
    print("\n[VOICE]\n" + cleaned + "\n")
    if not voice:
        return "Printed voice line (voice mode off)."
    try:
        wav = synthesize_speech(cleaned)
        play_wav_bytes(wav)
        return "Read aloud with OpenAI TTS + sounddevice."
    except Exception as exc:  # noqa: BLE001
        return f"Printed voice line (TTS unavailable: {exc})."


def listen_once(*, voice: bool, seconds: float | None = None) -> str | None:
    if not voice:
        return None
    try:
        print("Listening…")
        audio, rate = record_audio(seconds)
        rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
        if rms < 1e-4:
            print("No speech detected (silent mic).")
            return None
        wav_bytes = float_to_wav_bytes(audio, rate)
        text = transcribe_wav(wav_bytes)
        if text:
            print(f"Heard: {text}")
        return text or None
    except Exception as exc:  # noqa: BLE001
        print(f"Listen failed: {exc}")
        return None


def prompt_line(*, force_text: bool, voice: bool) -> str:
    isatty = getattr(sys.stdin, "isatty", None)
    if not force_text and voice and isatty and isatty():
        spoken = listen_once(voice=True)
        if spoken:
            return spoken
    try:
        return input("jarvis> ").strip()
    except EOFError:
        return "/quit"


# ---------------------------------------------------------------------------
# Manuscript I/O
# ---------------------------------------------------------------------------


def save_session(book: BookSession, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".json":
        destination.write_text(
            json.dumps(book.to_json(), indent=2), encoding="utf-8"
        )
    else:
        if destination.suffix.lower() not in {".md", ".markdown", ".txt"}:
            destination = destination.with_suffix(".md")
        destination.write_text(book.to_markdown(), encoding="utf-8")
    return destination


def default_export_path(book: BookSession, suffix: str = ".md") -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in book.title).strip(
        "-"
    )
    slug = slug or "manuscript"
    return DEFAULT_SAVE_DIR / f"{slug}-{stamp}{suffix}"


def load_manuscript(path: Path) -> BookSession:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        chapters = [
            Chapter(title=c.get("title", f"Chapter {i}"), body=c.get("body", ""))
            for i, c in enumerate(data.get("chapters", []), start=1)
        ]
        book = BookSession(
            title=data.get("title", "Untitled"),
            author=data.get("author", "Unknown"),
            chapters=chapters or [Chapter(title="Chapter 1")],
            current=int(data.get("current", 0)),
        )
        book.ensure_chapter()
        return book
    # Minimal markdown loader: first H1 = title, H2s = chapters
    title = "Untitled"
    author = "Unknown"
    chapters: list[Chapter] = []
    current: Chapter | None = None
    for line in text.splitlines():
        if line.startswith("# ") and title == "Untitled":
            title = line[2:].strip() or title
        elif line.startswith("*by ") and line.endswith("*"):
            author = line[4:-1].strip() or author
        elif line.startswith("## ") and line.strip() != "## Contents":
            if current is not None:
                chapters.append(current)
            current = Chapter(title=line[3:].strip() or f"Chapter {len(chapters)+1}")
        elif current is not None:
            current.body += line + "\n"
    if current is not None:
        chapters.append(current)
    book = BookSession(
        title=title,
        author=author,
        chapters=chapters or [Chapter(title="Chapter 1")],
    )
    book.ensure_chapter()
    return book


def now_display(moment: datetime | None = None) -> str:
    moment = moment or datetime.now(timezone.utc)
    return moment.strftime("%A, %B %d, %Y at %H:%M:%S UTC")


# ---------------------------------------------------------------------------
# Command handling
# ---------------------------------------------------------------------------


def strip_wake_word(text: str) -> str:
    cleaned = text.strip()
    for pattern in WAKE_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def status_text(session: JarvisSession) -> str:
    book = session.book
    book.ensure_chapter()
    chapter = book.chapters[book.current]
    return (
        f"Title: {book.title}\n"
        f"Author: {book.author}\n"
        f"Chapters: {len(book.chapters)} | Current: {book.current + 1}. {chapter.title}\n"
        f"Words: {book.word_count()} | Notes: {len(session.notes)}\n"
        f"AI: "
        + (
            "Gemini"
            if gemini_api_key()
            else ("OpenAI" if openai_api_key() else "not configured")
        )
    )


def handle_turn(session: JarvisSession, raw: str, *, voice: bool = False) -> str:
    text = raw.strip()
    if not text:
        return "Say something, or type /help."

    lowered = text.lower().strip()
    if lowered in QUIT_PHRASES or lowered in {"/quit", "/exit", "/q"}:
        return "__QUIT__"

    wake_only = bool(re.fullmatch(r"(hey\s+)?jarvis|ok(ay)?\s+jarvis", lowered))
    if wake_only:
        return "Yes? How may I help?"

    content = strip_wake_word(text)
    lowered_content = content.lower().strip()

    if lowered_content in {"help", "/help", "?"}:
        return HELP_TEXT
    if lowered_content in {"/status", "status"}:
        return status_text(session)
    if lowered_content in {"/time", "time", "what time is it", "what time is it?"}:
        return f"It is {now_display()}."
    if lowered_content in {"/devices", "devices"}:
        return list_audio_devices()
    if lowered_content in {"/notes", "notes"}:
        if not session.notes:
            return "No notes yet. Try: remember the deadline is Friday"
        return "Notes:\n" + "\n".join(f"- {note}" for note in session.notes)
    if lowered_content in {"/list", "list", "list chapters"}:
        session.book.ensure_chapter()
        lines = []
        for index, chapter in enumerate(session.book.chapters, start=1):
            marker = "*" if index - 1 == session.book.current else " "
            lines.append(f"{marker} {index}. {chapter.title}")
        return "Chapters:\n" + "\n".join(lines)

    if lowered_content.startswith("/note ") or lowered_content.startswith("remember "):
        note = content.split(" ", 1)[1].strip()
        if lowered_content.startswith("remember "):
            note = content[len("remember ") :].strip()
        if not note:
            return "What should I remember?"
        session.notes.append(note)
        return f"Noted: {note}"

    if lowered_content.startswith("/title "):
        session.book.title = content[7:].strip() or session.book.title
        return f"Title set to {session.book.title}."
    if lowered_content.startswith("/author "):
        session.book.author = content[8:].strip() or session.book.author
        return f"Author set to {session.book.author}."

    if lowered_content.startswith("/chapter"):
        rest = content[8:].strip()
        title = rest or f"Chapter {len(session.book.chapters) + 1}"
        session.book.chapters.append(Chapter(title=title))
        session.book.current = len(session.book.chapters) - 1
        return f"Started {title}."

    if lowered_content.startswith("/use "):
        try:
            number = int(content[5:].strip())
        except ValueError:
            return "Usage: /use <chapter-number>"
        if number < 1 or number > len(session.book.chapters):
            return f"Chapter {number} does not exist."
        session.book.current = number - 1
        return f"Switched to chapter {number}: {session.book.chapters[session.book.current].title}."

    if (
        lowered_content.startswith("/dictate ")
        or lowered_content.startswith("dictate:")
        or lowered_content.startswith("dictate ")
    ):
        if lowered_content.startswith("/dictate "):
            body = content[9:].strip()
        elif lowered_content.startswith("dictate:"):
            body = content.split(":", 1)[1].strip()
        else:
            body = content[8:].strip()
        chapter = session.book.ensure_chapter()
        if chapter.body and not chapter.body.endswith("\n"):
            chapter.body += "\n"
        chapter.body += body + "\n"
        return f"Dictated to {chapter.title}."

    if lowered_content in {"/read", "read", "read it back"}:
        chapter = session.book.ensure_chapter()
        body = chapter.body.strip() or "(empty chapter)"
        speak(f"{chapter.title}. {body}", voice=voice)
        return f"Read {chapter.title}."

    if lowered_content.startswith("/save") or lowered_content.startswith("/export"):
        parts = content.split(maxsplit=1)
        dest = Path(parts[1].strip()) if len(parts) > 1 else default_export_path(
            session.book
        )
        path = save_session(session.book, dest)
        return f"Saved manuscript to {path}"

    if lowered_content.startswith("/ask "):
        question = content[5:].strip()
        try:
            answer = generate_reply(
                question,
                "You are Jarvis, a concise publishing assistant. Be helpful and brief.",
            )
            speak(answer, voice=voice)
            return answer
        except Exception as exc:  # noqa: BLE001
            return f"I cannot answer conversationally yet ({exc}). Try /help."

    if lowered_content in {"/outline", "outline"}:
        book = session.book
        prompt = (
            f"Propose a clear chapter outline for a book titled {book.title!r} "
            f"by {book.author}. Keep it practical for a publisher."
        )
        try:
            answer = generate_reply(
                prompt,
                "You are Jarvis, an expert developmental editor. Return a numbered outline.",
            )
            speak(answer, voice=voice)
            return answer
        except Exception as exc:  # noqa: BLE001
            return f"Outline unavailable ({exc})."

    if lowered_content in {"/refine", "refine"}:
        chapter = session.book.ensure_chapter()
        prompt = (
            f"Provide concise editing notes for this chapter titled {chapter.title!r}:\n\n"
            f"{chapter.body or '(empty)'}"
        )
        try:
            answer = generate_reply(
                prompt,
                "You are Jarvis, a sharp line editor. Give actionable notes.",
            )
            speak(answer, voice=voice)
            return answer
        except Exception as exc:  # noqa: BLE001
            return f"Refine unavailable ({exc})."

    if content.startswith("/"):
        return f"Unknown command: {content.split()[0]}. Type /help."

    # Natural language fallbacks
    if "what time" in lowered_content:
        return f"It is {now_display()}."
    if lowered_content.startswith("remember "):
        note = content[9:].strip()
        session.notes.append(note)
        return f"Noted: {note}"

    try:
        answer = generate_reply(
            content,
            "You are Jarvis, a witty personal assistant for Book Publisher Pro. "
            "Keep replies short unless asked for detail.",
        )
        speak(answer, voice=voice)
        session.history.append((content, answer))
        return answer
    except Exception:
        return (
            "I cannot answer conversationally without an API key. "
            "Set GEMINI_API_KEY or OPENAI_API_KEY in .env, or type /help."
        )


# ---------------------------------------------------------------------------
# Demo / main
# ---------------------------------------------------------------------------


def run_demo(session: JarvisSession) -> int:
    script = [
        "Jarvis",
        "what time is it?",
        "/title Demo Manuscript",
        "/author Ada Lovelace",
        "/note Ship the demo by Friday",
        "dictate: Once upon a time, code learned to listen.",
        "/chapter Chapter 2",
        "/dictate The journey continued under silicon skies.",
        "/list",
        "/status",
        "/export",
        "stand down",
    ]
    export_path: Path | None = None
    for line in script:
        print(f"jarvis> {line}")
        reply = handle_turn(session, line, voice=False)
        if reply == "__QUIT__":
            print("Goodbye.")
            break
        print(reply)
        if reply.startswith("Saved manuscript to "):
            export_path = Path(reply.split("Saved manuscript to ", 1)[1].strip())
    if export_path and export_path.is_file():
        print(f"DEMO_OK {export_path}")
        return 0
    print("DEMO_FAIL")
    return 1


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Jarvis workspace assistant")
    parser.add_argument(
        "--text",
        action="store_true",
        help="Force typed input (no microphone).",
    )
    parser.add_argument(
        "--voice",
        action="store_true",
        help="Enable sounddevice mic capture + TTS playback when keys allow.",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run a non-interactive smoke test and export a manuscript.",
    )
    parser.add_argument(
        "--manuscript",
        type=Path,
        help="Load an existing markdown or JSON manuscript.",
    )
    args = parser.parse_args(argv)

    session = JarvisSession()
    if args.manuscript:
        session.book = load_manuscript(args.manuscript)
        print(f"Loaded manuscript from {args.manuscript}")

    if args.demo:
        return run_demo(session)

    voice = bool(args.voice) and not bool(args.text)
    print("Jarvis online. Type /help — or say \"Hey Jarvis\".")
    if voice:
        print("Voice mode enabled (sounddevice). Ctrl+C to stop.")
    else:
        print("Text mode (pass --voice for microphone).")

    while True:
        try:
            line = prompt_line(force_text=args.text or not voice, voice=voice)
        except KeyboardInterrupt:
            print("\nGoodbye.")
            return 0
        reply = handle_turn(session, line, voice=voice)
        if reply == "__QUIT__":
            print("Goodbye.")
            return 0
        print(reply)


if __name__ == "__main__":
    raise SystemExit(main())
