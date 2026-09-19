import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  fetchConfig,
  fetchStatus,
  loadSavedTarget,
  runAction,
  saveTarget,
  UNKNOWN,
  type ActionResult,
  type ServiceStatus,
} from "./api.ts";
import "./control-desk.css";

type TabId = "control" | "console" | "logs";

function stamp(text: string): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}] ${text}`;
}

function toneClass(status: ServiceStatus): string {
  if (status.label === "UNKNOWN") return "unknown";
  return status.online ? "online" : "offline";
}

function StatusCard({
  label,
  status,
  detail,
}: {
  label: string;
  status: ServiceStatus;
  detail: string;
}) {
  return (
    <div className="hcd-card">
      <div className="hcd-card-label">{label}</div>
      <div className={`hcd-card-value ${toneClass(status)}`}>{status.label}</div>
      <div className="hcd-card-port">{detail}</div>
    </div>
  );
}

export default function App() {
  const saved = useMemo(() => loadSavedTarget(), []);
  const [user, setUser] = useState(saved.user || "root");
  const [host, setHost] = useState(saved.host || "100.118.230.116");
  const [tab, setTab] = useState<TabId>("control");
  const [busy, setBusy] = useState(false);
  const [rawCommand, setRawCommand] = useState(
    "cd /opt/hermes-memory-os && docker ps",
  );
  const [output, setOutput] = useState("");
  const [api, setApi] = useState<ServiceStatus>(UNKNOWN);
  const [dashboard, setDashboard] = useState<ServiceStatus>(UNKNOWN);
  const [qdrant, setQdrant] = useState<ServiceStatus>(UNKNOWN);
  const [runner, setRunner] = useState<ServiceStatus>(UNKNOWN);
  const [cli, setCli] = useState<ServiceStatus>(UNKNOWN);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  const addLine = useCallback((text: string) => {
    setOutput((prev) => `${prev}${stamp(text)}\n`);
  }, []);

  useEffect(() => {
    const box = outputRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [output]);

  const persist = useCallback(() => {
    saveTarget(user.trim(), host.trim());
    return {user: user.trim(), host: host.trim()};
  }, [host, user]);

  const applyStatus = useCallback(
    (status: Awaited<ReturnType<typeof fetchStatus>>) => {
      setApi(status.api);
      setDashboard(status.dashboard);
      setQdrant(status.qdrant);
      setRunner(status.runner);
      setCli(status.cli);
      if (status.sshUnreachable && status.sshError) {
        addLine(`SSH unreachable: ${status.sshError.split("\n")[0]}`);
      }
    },
    [addLine],
  );

  const markOffline = useCallback((reason: string) => {
    const offline = {online: false, label: "OFFLINE"};
    setApi(offline);
    setDashboard(offline);
    setQdrant(offline);
    setRunner({online: false, label: "DOWN"});
    setCli({online: false, label: "MISSING"});
    addLine(`ERROR: ${reason}`);
  }, [addLine]);

  const refresh = useCallback(async () => {
    const target = persist();
    addLine("Refreshing status...");
    try {
      const status = await fetchStatus(target.user, target.host);
      applyStatus(status);
      addLine("Refresh complete.");
    } catch (err) {
      markOffline(err instanceof Error ? err.message : String(err));
      addLine("Refresh complete.");
    }
  }, [addLine, applyStatus, markOffline, persist]);

  const run = useCallback(
    async (id: string, command = "") => {
      const target = persist();
      setBusy(true);
      try {
        const result: ActionResult = await runAction(
          id,
          target.user,
          target.host,
          command,
        );
        addLine(`━━ ${result.title} ━━`);
        if (result.kind === "raw") {
          addLine(command);
        } else if (!result.interactive) {
          addLine(`SSH → ${result.target}`);
          addLine(`> ${result.command}`);
        }
        if (result.output) addLine(result.output);
        if (!result.interactive) {
          addLine(`Exit code: ${result.exitCode}`);
        }
        if (result.refresh) {
          await refresh();
        }
      } catch (err) {
        addLine(`━━ ${id} ━━`);
        addLine(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
        markOffline(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [addLine, markOffline, persist, refresh],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      let composePath = "/opt/hermes-memory-os/docker-compose.prod.yml";
      let qdrantName = "qdrant";
      let nextUser = saved.user || "root";
      let nextHost = saved.host || "100.118.230.116";
      try {
        const cfg = await fetchConfig();
        nextUser = saved.user || cfg.user;
        nextHost = saved.host || cfg.host;
        composePath = cfg.composePath;
        qdrantName = cfg.qdrantContainer;
        setUser(nextUser);
        setHost(nextHost);
      } catch (err) {
        addLine(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
      addLine("Hermes Control Desk initialized.");
      addLine(`Production compose: ${composePath}`);
      addLine(`Standalone Qdrant container: ${qdrantName}`);
      addLine("Refreshing status...");
      try {
        saveTarget(nextUser, nextHost);
        applyStatus(await fetchStatus(nextUser, nextHost));
      } catch (err) {
        markOffline(err instanceof Error ? err.message : String(err));
      }
      addLine("Refresh complete.");
    })();
  }, [addLine, applyStatus, markOffline, saved.host, saved.user]);

  const openWeb = (path: string) => {
    window.open(`http://${host.trim()}${path}`, "_blank", "noopener,noreferrer");
  };

  const executeRaw = () => {
    if (!rawCommand.trim()) return;
    void run("raw-command", rawCommand);
  };

  return (
    <div className={`hcd${busy ? " is-busy" : ""}`}>
      <header className="hcd-header">
        <div>
          <h1 className="hcd-title">HERMES CONTROL DESK</h1>
          <p className="hcd-subtitle">
            Memory OS • Root Console • Infrastructure Control
          </p>
        </div>
        <div className="hcd-target">
          <input
            className="hcd-input user"
            aria-label="SSH user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
          <span className="hcd-at">@</span>
          <input
            className="hcd-input host"
            aria-label="SSH host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
          <button
            type="button"
            className="hcd-btn"
            disabled={busy}
            onClick={() => void refresh()}
          >
            ↻ REFRESH
          </button>
        </div>
      </header>

      <section className="hcd-status" aria-label="Service status">
        <StatusCard label="HERMES API" status={api} detail="8000" />
        <StatusCard label="DASHBOARD" status={dashboard} detail="3001" />
        <StatusCard label="QDRANT" status={qdrant} detail="6333" />
        <StatusCard label="GITHUB RUNNER" status={runner} detail="SYSTEMD" />
        <StatusCard label="HERMES CLI" status={cli} detail="SSH" />
      </section>

      <div className="hcd-tabs">
        <div className="hcd-tab-list" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "control"}
            className={`hcd-tab${tab === "control" ? " active" : ""}`}
            onClick={() => setTab("control")}
          >
            CONTROL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "console"}
            className={`hcd-tab${tab === "console" ? " active" : ""}`}
            onClick={() => setTab("console")}
          >
            REMOTE CONSOLE
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "logs"}
            className={`hcd-tab${tab === "logs" ? " active" : ""}`}
            onClick={() => setTab("logs")}
          >
            LOGS
          </button>
        </div>

        <div className="hcd-tab-body">
          {tab === "control" && (
            <div className="hcd-panel">
              <div className="hcd-section-title">Hermes Stack</div>
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("start-stack")}>
                  ▶ START STACK
                </button>
                <button type="button" className="hcd-btn danger" disabled={busy} onClick={() => void run("stop-stack")}>
                  ■ STOP STACK
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("restart-stack")}>
                  ↻ RESTART STACK
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("rebuild-stack")}>
                  ⚙ REBUILD + START
                </button>
              </div>

              <div className="hcd-section-title spaced">Services</div>
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("restart-api")}>
                  ↻ API
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("restart-dashboard")}>
                  ↻ DASHBOARD
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("restart-qdrant")}>
                  ↻ QDRANT
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("restart-runner")}>
                  ↻ GITHUB RUNNER
                </button>
              </div>

              <div className="hcd-section-title spaced">Hermes Agent</div>
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("pause")}>
                  Ⅱ PAUSE
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("resume")}>
                  ▶ RESUME
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("hermes-chat")}>
                  💬 HERMES CHAT
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("root-ssh")}>
                  ⌘ ROOT SSH
                </button>
              </div>

              <div className="hcd-section-title spaced">Web</div>
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" onClick={() => openWeb(":3001")}>
                  🌐 CONTROL DESK
                </button>
                <button type="button" className="hcd-btn" onClick={() => openWeb(":8000/docs")}>
                  🌐 API DOCS
                </button>
                <button type="button" className="hcd-btn" onClick={() => openWeb(":6333/dashboard")}>
                  🌐 QDRANT
                </button>
              </div>
            </div>
          )}

          {tab === "console" && (
            <div className="hcd-panel hcd-console-grid">
              <div>
                <div className="hcd-section-title">Direct root command</div>
                <p className="hcd-help">
                  Sent directly to the VPS shell over SSH.
                </p>
              </div>
              <textarea
                ref={rawRef}
                className="hcd-raw"
                aria-label="Raw SSH command"
                value={rawCommand}
                onChange={(e) => setRawCommand(e.target.value)}
              />
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" disabled={busy} onClick={executeRaw}>
                  ▶ EXECUTE
                </button>
                <button
                  type="button"
                  className="hcd-btn"
                  onClick={() => {
                    setRawCommand("");
                    rawRef.current?.focus();
                  }}
                >
                  CLEAR
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("root-ssh")}>
                  OPEN INTERACTIVE SSH
                </button>
              </div>
            </div>
          )}

          {tab === "logs" && (
            <div className="hcd-panel">
              <div className="hcd-section-title">Logs & Diagnostics</div>
              <div className="hcd-wrap">
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("api-logs")}>
                  API LOGS
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("dashboard-logs")}>
                  DASHBOARD LOGS
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("runner-logs")}>
                  RUNNER LOGS
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("docker-ps")}>
                  DOCKER PS
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("hermes-logs")}>
                  HERMES LOGS
                </button>
                <button type="button" className="hcd-btn" disabled={busy} onClick={() => void run("system-status")}>
                  SYSTEM STATUS
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="hcd-console-wrap">
        <div className="hcd-console-bar">
          <div className="hcd-console-label">OPERATIONS CONSOLE</div>
          <button
            type="button"
            className="hcd-btn small"
            onClick={() => setOutput("")}
          >
            CLEAR OUTPUT
          </button>
        </div>
        <textarea
          ref={outputRef}
          className="hcd-output"
          readOnly
          aria-label="Operations console"
          value={output}
        />
      </section>
    </div>
  );
}
