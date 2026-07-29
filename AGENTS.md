# AGENTS.md

## Cursor Cloud specific instructions

### What this is
A single frontend-only React 19 + Vite + TypeScript SPA ("Book Publisher Pro", a Google AI Studio app). There is no backend service; Gemini API calls are made directly from the browser via `@google/genai`. All source lives in `src/` (`App.tsx` is the whole app).

### Commands (see `package.json` scripts)
- Dev: `npm run dev` — Vite dev server on port `3000`, host `0.0.0.0`.
- Lint / typecheck: `npm run lint` — this is `tsc --noEmit` (there is no ESLint).
- Build: `npm run build`; preview a build with `npm run preview`.

### Gemini API key (non-obvious)
- The app reads `process.env.GEMINI_API_KEY`, which Vite injects at build/serve time via `define` in `vite.config.ts`. `loadEnv(mode, '.', '')` uses an empty prefix, so it picks up `GEMINI_API_KEY` from the process environment (the injected secret) — you do NOT need a `.env.local` file when the secret is set. If the key is missing, the two AI buttons ("Generate Outline", "Refine Manuscript") fail silently (errors go to the browser console, `catch` swallows them).
- The model name is hardcoded to `gemini-3-flash-preview` in `App.tsx`. A `GEMINI_MODEL` env var may exist in the environment but is not used by the app.

### Other notes
- `vite.config.ts` contains a custom transform that strips `fetch`/`Headers`/etc. reassignments in `node_modules`, plus aliases mapping fetch/formdata polyfills to no-op shims in `src/`. This is intentional (AI Studio sandbox compatibility) — do not remove.
- HMR is gated by the `DISABLE_HMR` env var (`server.hmr` in `vite.config.ts`).
