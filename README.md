# Hermes Control Desk

Web and Windows controller for the Hermes Memory OS VPS.

Default target: `root@100.118.230.116`. Stack path: `/opt/hermes-memory-os` with `docker-compose.prod.yml`. Qdrant is a standalone container named `qdrant` — restart is `docker restart qdrant` only.

If the VPS is unreachable (no Tailscale path, no SSH keys, restricted egress), the desk still loads and shows **OFFLINE** / SSH error output. It does not wait for connectivity.

## Windows desktop app

Requires the **OpenSSH Client** and PowerShell in a **STA** apartment (WPF). Saved config lives at `%APPDATA%\HermesControlDesk\config.json`.

```powershell
cd windows
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File .\HermesControlDesk.ps1
```

Or run `windows\Run-HermesControlDesk.cmd`. Full notes: [`windows/README.md`](windows/README.md).

## Web Control Desk

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The UI is on port 3000; the SSH backend is on port 8787 (`/api` is proxied). Host and user are stored in the browser (`localStorage`).

SSH matches the Windows app: `ssh -o BatchMode=yes -o ConnectTimeout=8 user@host …`.

## Agent Zero and Kali

Not present in the Hermes prod compose. Access is a sidecar stack (`deploy/docker-compose.agent-zero-kali.yml`) that does **not** touch Qdrant/`6333`.

| App | URL | Container | Port |
| --- | --- | --- | --- |
| Agent Zero web UI | `http://100.118.230.116:50080` | `agent-zero` | `50080→80` |
| Kali desktop (noVNC) | `https://100.118.230.116:6901` | `kali-novnc` | `6901` |

Kali login: `kasm_user` / `password` (change `VNC_PW`). This Cloud Agent cannot SSH to the Tailscale VPS; start the stack from a Windows/Tailscale host:

```bash
scp deploy/docker-compose.agent-zero-kali.yml root@100.118.230.116:/opt/hermes-memory-os/docker-compose.agent-zero-kali.yml
ssh -o BatchMode=yes -o ConnectTimeout=8 root@100.118.230.116 'bash -s' < deploy/start-agent-zero-kali.sh
```

Control Desk **START LABS** runs the same `docker compose … up -d` once that file is on the VPS. Open buttons: **AGENT ZERO** and **KALI DESKTOP**.

Useful scripts:

- `npm run server` — API only (`0.0.0.0:8787`)
- `npm test` — command-map and SSH-flag checks (no live VPS calls)
- `npm run lint` — TypeScript
