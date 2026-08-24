<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Book Publisher Pro + Jarvis workspace

This repo contains the AI Studio web app and a fully implemented **`jarvis-workspace`** Python assistant.

View the web app in AI Studio: https://ai.studio/apps/c637052f-7a73-458d-a899-7454e4e7db34

## Run the web app locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in [`.env.local`](.env.local) (or copy [`.env.example`](.env.example) to `.env`)
3. Run: `npm run dev`

## Jarvis workspace

Jarvis is a terminal assistant that can take notes, dictate chapters, read them back, list audio devices, and (when API keys are set) answer questions or generate outlines.

**Stack** (see [`requirements.txt`](requirements.txt)):

- `sounddevice` — microphone capture and playback
- `numpy` — audio buffers
- `requests` — Gemini / OpenAI HTTP APIs
- `python-dotenv` — loads `.env`

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit keys
```

Or on Windows run `jarvis.bat`, which creates `.venv` and installs dependencies if needed.

### Configure `.env`

| Variable | Purpose |
| -------- | ------- |
| `GEMINI_API_KEY` | Chat / outline / refine via Gemini REST |
| `OPENAI_API_KEY` | Optional Whisper STT + TTS for `--voice` |
| `JARVIS_SAMPLE_RATE` | Capture rate (default `16000`) |
| `JARVIS_RECORD_SECONDS` | Default listen window (default `5`) |
| `JARVIS_INPUT_DEVICE` | Optional mic index or name substring |

### Run

```bash
python jarvis.py              # interactive text mode
python jarvis.py --voice      # mic + speakers when OpenAI key + hardware allow
python jarvis.py --text       # force typed input
python jarvis.py --demo       # non-interactive smoke test
python jarvis.py --manuscript path.md
```

Inside a session type `/help`, or speak naturally (`Jarvis, what time is it?`, `remember the deadline is Friday`, `stand down`).

### Tests

```bash
python -m unittest test_jarvis.py
```
