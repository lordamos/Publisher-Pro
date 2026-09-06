"""Tests for the merged Publisher Studio (Voice + Jarvis)."""

from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import jarvis
import run_voice
import studio


class StudioRoutingTests(unittest.TestCase):
    def test_plain_line_is_dictation(self) -> None:
        session = studio.StudioSession()
        result = studio.handle_turn(session, "Once upon a quiet morning.")
        self.assertIn("Dictated", result)
        self.assertIn("quiet morning", session.book.chapters[0].body)

    def test_question_does_not_get_dictated(self) -> None:
        session = studio.StudioSession()
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=False):
            reply = studio.handle_turn(session, "What is a good subtitle for this book?")
        self.assertIn("cannot answer conversationally", reply)
        self.assertEqual(session.book.word_count(), 0)

    def test_voice_alias_still_dictates(self) -> None:
        book = run_voice.BookSession(title="Test Book", author="Ada")
        self.assertIn("Dictated", run_voice.handle_command(book, "Hello from voice."))
        self.assertIn("Hello from voice.", book.chapters[0].body)

    def test_jarvis_alias_still_notes(self) -> None:
        session = jarvis.JarvisSession()
        self.assertIn("Noted", jarvis.handle_turn(session, "remember pack the galleys"))
        self.assertIn("pack the galleys", jarvis.handle_turn(session, "/notes"))

    def test_json_export_includes_notes(self) -> None:
        session = studio.StudioSession()
        studio.handle_turn(session, "/note Deadline Friday")
        studio.handle_turn(session, "Opening sentence.")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.json"
            studio.handle_turn(session, f"/save {path}")
            data = path.read_text(encoding="utf-8")
        self.assertIn("Deadline Friday", data)
        self.assertIn("Opening sentence.", data)

    def test_piped_studio_exits_cleanly(self) -> None:
        script = "Jarvis\nHello from a pipe.\n/status\n/quit\n"
        with patch("sys.stdin", io.StringIO(script)):
            code = studio.main([])
        self.assertEqual(code, 0)
