"""Tests for the jarvis-workspace assistant."""

from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import jarvis


class JarvisTurnTests(unittest.TestCase):
    def test_wake_word_only(self) -> None:
        session = jarvis.JarvisSession()
        self.assertEqual(jarvis.handle_turn(session, "Jarvis"), "Yes? How may I help?")
        self.assertEqual(jarvis.handle_turn(session, "hey jarvis"), "Yes? How may I help?")

    def test_natural_time_and_help(self) -> None:
        session = jarvis.JarvisSession()
        time_reply = jarvis.handle_turn(session, "Jarvis, what time is it?")
        self.assertIn("It is ", time_reply)
        self.assertIn("UTC", time_reply)
        help_reply = jarvis.handle_turn(session, "help")
        self.assertIn("/dictate", help_reply)
        self.assertIn("/quit", help_reply)
        self.assertIn("/devices", help_reply)

    def test_remember_and_notes(self) -> None:
        session = jarvis.JarvisSession()
        noted = jarvis.handle_turn(session, "remember the deadline is Friday")
        self.assertIn("Noted", noted)
        listing = jarvis.handle_turn(session, "/notes")
        self.assertIn("deadline is Friday", listing)

    def test_dictate_and_export_markdown(self) -> None:
        session = jarvis.JarvisSession()
        session.book.title = "Test Book"
        session.book.author = "Ada"
        self.assertIn("Dictated", jarvis.handle_turn(session, "dictate: Once upon a time."))
        self.assertIn("Started", jarvis.handle_turn(session, "/chapter Chapter 2"))
        self.assertIn("Dictated", jarvis.handle_turn(session, "/dictate The journey continued."))
        listing = jarvis.handle_turn(session, "/list")
        self.assertIn("Chapter 1", listing)
        self.assertIn("Chapter 2", listing)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.md"
            result = jarvis.handle_turn(session, f"/export {path}")
            self.assertTrue(path.is_file(), result)
            text = path.read_text(encoding="utf-8")
        self.assertIn("# Test Book", text)
        self.assertIn("*by Ada*", text)
        self.assertIn("Once upon a time.", text)
        self.assertIn("The journey continued.", text)
        self.assertGreaterEqual(session.book.word_count(), 7)

    def test_unknown_command(self) -> None:
        session = jarvis.JarvisSession()
        self.assertIn("Unknown command", jarvis.handle_turn(session, "/nope"))

    def test_quit_natural_and_slash(self) -> None:
        session = jarvis.JarvisSession()
        self.assertEqual(jarvis.handle_turn(session, "/quit"), "__QUIT__")
        self.assertEqual(jarvis.handle_turn(session, "stand down"), "__QUIT__")
        self.assertEqual(jarvis.handle_turn(session, "goodbye"), "__QUIT__")

    def test_load_json_manuscript(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.json"
            path.write_text(
                '{"title":"Loaded","author":"Sam","current":0,'
                '"chapters":[{"title":"One","body":"Hello world"}]}',
                encoding="utf-8",
            )
            book = jarvis.load_manuscript(path)
        self.assertEqual(book.title, "Loaded")
        self.assertEqual(book.author, "Sam")
        self.assertEqual(book.chapters[0].body, "Hello world")

    def test_ask_without_api_key_does_not_crash(self) -> None:
        session = jarvis.JarvisSession()
        with patch.dict(
            "os.environ",
            {"GEMINI_API_KEY": "", "OPENAI_API_KEY": ""},
            clear=False,
        ):
            reply = jarvis.handle_turn(
                session, "What is a good subtitle for this book?"
            )
        self.assertIn("cannot answer conversationally", reply)
        self.assertIn("/help", reply)

    def test_float_to_wav_roundtrip_shape(self) -> None:
        import numpy as np

        audio = np.zeros(1600, dtype=np.float32)
        audio[100:200] = 0.25
        wav = jarvis.float_to_wav_bytes(audio, 16000)
        self.assertGreater(len(wav), 44)
        self.assertTrue(wav.startswith(b"RIFF"))

    def test_piped_session_exits_cleanly(self) -> None:
        script = "Jarvis\nwhat time is it?\n/status\nstand down\n"
        with patch("sys.stdin", io.StringIO(script)):
            code = jarvis.main(["--text"])
        self.assertEqual(code, 0)

    def test_demo_mode(self) -> None:
        code = jarvis.main(["--demo"])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
