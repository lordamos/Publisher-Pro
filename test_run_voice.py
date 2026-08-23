"""Tests for Book Publisher Pro voice studio session commands."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import run_voice


class BookSessionTests(unittest.TestCase):
    def test_dictate_and_export_markdown(self) -> None:
        book = run_voice.BookSession(title="Test Book", author="Ada")
        self.assertIn("Dictated", run_voice.handle_command(book, "Once upon a time."))
        self.assertIn("Started", run_voice.handle_command(book, "/chapter Chapter 2"))
        self.assertIn("Dictated", run_voice.handle_command(book, "The journey continued."))
        listing = run_voice.handle_command(book, "/list")
        self.assertIn("Chapter 1", listing)
        self.assertIn("Chapter 2", listing)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.md"
            result = run_voice.handle_command(book, f"/export {path}")
            self.assertTrue(path.is_file(), result)
            text = path.read_text(encoding="utf-8")
        self.assertIn("# Test Book", text)
        self.assertIn("*by Ada*", text)
        self.assertIn("Once upon a time.", text)
        self.assertIn("The journey continued.", text)
        self.assertGreaterEqual(book.word_count(), 7)

    def test_unknown_command(self) -> None:
        book = run_voice.BookSession()
        self.assertIn("Unknown command", run_voice.handle_command(book, "/nope"))

    def test_quit_sentinel(self) -> None:
        book = run_voice.BookSession()
        self.assertEqual(run_voice.handle_command(book, "/quit"), "__QUIT__")

    def test_load_json_manuscript(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.json"
            path.write_text(
                '{"title":"Loaded","author":"Sam","current":0,'
                '"chapters":[{"title":"One","body":"Hello world"}]}',
                encoding="utf-8",
            )
            book = run_voice.load_manuscript(path)
        self.assertEqual(book.title, "Loaded")
        self.assertEqual(book.author, "Sam")
        self.assertEqual(book.chapters[0].body, "Hello world")


if __name__ == "__main__":
    unittest.main()
