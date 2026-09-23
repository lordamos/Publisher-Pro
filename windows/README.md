# Hermes Control Desk (Windows)

WPF desktop controller for the Hermes VPS. This is the canonical Windows app.

## Prerequisites

- Windows 10 or 11
- Windows PowerShell 5.1+ running in a **STA** (single-threaded apartment) — required for WPF
- **OpenSSH Client** (`ssh.exe`). Install it from *Settings → Apps → Optional features → OpenSSH Client*, or:

  ```powershell
  Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
  ```

- An SSH key already authorized on the VPS (password prompts will fail; the desk uses `BatchMode=yes`)

## Run

From this folder:

```powershell
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File .\HermesControlDesk.ps1
```

Or double-click `Run-HermesControlDesk.cmd`.

`powershell.exe` defaults to STA. Windows PowerShell 7 (`pwsh`) does not — always pass `-STA` there.

## Saved config

Host and user are stored at:

```
%APPDATA%\HermesControlDesk\config.json
```

Defaults if that file is missing:

```json
{ "Host": "100.118.230.116", "User": "root" }
```

The desk writes this file on refresh/action and again when the window closes.

## SSH and stack notes

- Every remote call is `ssh -o BatchMode=yes -o ConnectTimeout=8 user@host …`
- Stack path: `/opt/hermes-memory-os` with `docker-compose.prod.yml`
- GitHub runner unit: `actions.runner.lordamos-hermes-memory-os.vps-hermes.service`
- Qdrant is a **standalone** container named `qdrant`. Restart is `docker restart qdrant` only — never start another Compose Qdrant on port 6333
- Agent Zero web UI: `http://100.118.230.116:50080` (container `agent-zero`, sidecar `docker-compose.agent-zero-kali.yml`)
- Kali desktop (noVNC): `https://100.118.230.116:6901` (container `kali-novnc`, login `kasm_user` / `password`)

## Agent Zero and Kali (from this Windows host)

Cursor Cloud cannot reach the Tailscale VPS. Run these on the Windows/Tailscale machine:

```powershell
scp ..\deploy\docker-compose.agent-zero-kali.yml root@100.118.230.116:/opt/hermes-memory-os/docker-compose.agent-zero-kali.yml
ssh -o BatchMode=yes -o ConnectTimeout=8 root@100.118.230.116 "bash -s" < ..\deploy\start-agent-zero-kali.sh
```

Or click **START LABS** in the Control Desk after the compose file is on the VPS.

Then open:

- Agent Zero: `http://100.118.230.116:50080`
- Kali noVNC: `https://100.118.230.116:6901` (accept the Kasm self-signed cert; user `kasm_user`, password `password` — change `VNC_PW` in the compose file)

