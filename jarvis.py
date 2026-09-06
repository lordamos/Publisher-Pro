#!/usr/bin/env python3
"""Compatibility launcher for Publisher Studio (Jarvis entrypoint)."""

from studio import (  # noqa: F401
    JarvisSession,
    handle_turn,
    load_manuscript,
    main,
)

if __name__ == "__main__":
    raise SystemExit(main())
