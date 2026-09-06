#!/usr/bin/env python3
"""Compatibility launcher for Publisher Studio (Voice Studio entrypoint)."""

from studio import (  # noqa: F401
    BookSession,
    handle_command,
    load_manuscript,
    main,
)

if __name__ == "__main__":
    raise SystemExit(main())
