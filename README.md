<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c637052f-7a73-458d-a899-7454e4e7db34

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Jarvis assistant

Start a terminal assistant that can take notes, dictate chapters, read them back, and (when `GEMINI_API_KEY` is set) answer questions or generate outlines.

**Windows**

```bat
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements-jarvis.txt
python jarvis.py
```

Or run `jarvis.bat`, which creates `.venv` and installs dependencies if needed.

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-jarvis.txt
python jarvis.py
```

Useful flags: `--text` (typed input only), `--demo` (non-interactive smoke test), `--manuscript path.md`.
Type `/help` inside the session, or speak naturally (`Jarvis, what time is it?`).
