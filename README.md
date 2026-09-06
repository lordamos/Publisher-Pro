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

## Publisher Studio (Voice + Jarvis)

One terminal app: Voice Studio dictation plus the Jarvis assistant. Plain lines go into the manuscript. Questions, notes, and “Jarvis, …” phrases go to the assistant. `/outline` and `/refine` use Gemini when `GEMINI_API_KEY` is set.

**Windows**

```bat
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python studio.py
```

`python run_voice.py` and `python jarvis.py` launch the same studio. Or run `studio.bat`.

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python studio.py
```

Useful flags: `--text` (typed input only), `--demo` (non-interactive smoke test), `--manuscript path.md`.
Type `/help` inside the session, dictate freely, or speak naturally (`Jarvis, what time is it?`).
