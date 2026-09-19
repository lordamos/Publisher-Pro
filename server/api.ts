import type {IncomingMessage, ServerResponse} from "node:http";
import {
  ACTIONS,
  CLI_STATUS_COMMAND,
  RUNNER_STATUS_COMMAND,
} from "./actions.ts";
import {
  AGENT_ZERO_CONTAINER,
  AGENT_ZERO_PORT,
  DEFAULT_HOST,
  DEFAULT_USER,
  KALI_CONTAINER,
  KALI_NOVNC_PORT,
  LABS_COMPOSE,
  PROD_COMPOSE,
  QDRANT_CONTAINER,
  REPO,
  RUNNER_SERVICE,
} from "./constants.ts";
import {encodeRawCommand, invokeSsh, targetOf, testPort} from "./ssh.ts";

type Creds = {host: string; user: string};

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function credsFrom(
  input: {host?: unknown; user?: unknown},
  query?: URLSearchParams,
): Creds {
  const host = String(
    input.host || query?.get("host") || DEFAULT_HOST,
  ).trim();
  const user = String(
    input.user || query?.get("user") || DEFAULT_USER,
  ).trim();
  return {
    host: host || DEFAULT_HOST,
    user: user || DEFAULT_USER,
  };
}

function statusPayload(
  online: boolean,
  onlineText: string,
  offlineText: string,
) {
  return {
    online,
    label: online ? onlineText : offlineText,
  };
}

export async function refreshStatus(creds: Creds) {
  const {host, user} = creds;
  const [apiOpen, dashboardOpen, qdrantOpen, agentZeroOpen, kaliOpen, runner, cli] =
    await Promise.all([
      testPort(host, 8000),
      testPort(host, 3001),
      testPort(host, 6333),
      testPort(host, AGENT_ZERO_PORT),
      testPort(host, KALI_NOVNC_PORT),
      invokeSsh(user, host, RUNNER_STATUS_COMMAND, 20_000),
      invokeSsh(user, host, CLI_STATUS_COMMAND, 20_000),
    ]);

  const runnerOnline = runner.output.trim() === "active";
  const cliOnline = cli.output.trim() === "READY";
  const sshUnreachable =
    runner.exitCode !== 0 ||
    cli.exitCode !== 0 ||
    /timed out|unreachable|connection refused|permission denied|could not resolve/i.test(
      `${runner.output}\n${cli.output}`,
    );

  return {
    host,
    user,
    target: targetOf(user, host),
    api: statusPayload(apiOpen, "ONLINE", "OFFLINE"),
    dashboard: statusPayload(dashboardOpen, "ONLINE", "OFFLINE"),
    qdrant: statusPayload(qdrantOpen, "ONLINE", "OFFLINE"),
    agentZero: statusPayload(agentZeroOpen, "ONLINE", "OFFLINE"),
    kali: statusPayload(kaliOpen, "ONLINE", "OFFLINE"),
    runner: statusPayload(runnerOnline, "ACTIVE", "DOWN"),
    cli: statusPayload(cliOnline, "READY", "MISSING"),
    runnerOutput: runner.output,
    cliOutput: cli.output,
    sshUnreachable,
    sshError: sshUnreachable
      ? runner.output || cli.output || "SSH unreachable"
      : "",
  };
}

export async function runDeskAction(
  id: string,
  creds: Creds,
  rawCommand = "",
) {
  const action = ACTIONS[id];
  if (!action) {
    return {error: `Unknown action: ${id}`, status: 404};
  }

  const {host, user} = creds;
  const target = targetOf(user, host);

  if (action.kind === "interactive-ssh") {
    const command = `ssh ${target}`;
    return {
      status: 200,
      body: {
        id,
        title: action.title,
        kind: action.kind,
        target,
        command,
        output:
          "Interactive SSH is not available in the browser.\n" +
          "Run this on a machine that can reach the VPS:\n\n" +
          command,
        exitCode: 0,
        refresh: action.refresh,
        interactive: true,
      },
    };
  }

  if (action.kind === "interactive-chat") {
    const command = `ssh -t ${target} "bash -lc 'hermes chat'"`;
    return {
      status: 200,
      body: {
        id,
        title: action.title,
        kind: action.kind,
        target,
        command,
        output:
          "Interactive Hermes chat is not available in the browser.\n" +
          "Run this on a machine that can reach the VPS:\n\n" +
          command,
        exitCode: 0,
        refresh: action.refresh,
        interactive: true,
      },
    };
  }

  if (action.kind === "raw") {
    const command = rawCommand;
    if (!command.trim()) {
      return {error: "Command is empty", status: 400};
    }
    const remoteCommand = encodeRawCommand(command);
    const result = await invokeSsh(user, host, remoteCommand);
    return {
      status: 200,
      body: {
        id,
        title: action.title,
        kind: action.kind,
        target,
        command,
        remoteCommand,
        output: result.output,
        exitCode: result.exitCode,
        refresh: action.refresh,
      },
    };
  }

  const command = action.command || "";
  const result = await invokeSsh(user, host, command);
  return {
    status: 200,
    body: {
      id,
      title: action.title,
      kind: action.kind,
      target,
      command,
      output: result.output,
      exitCode: result.exitCode,
      refresh: action.refresh,
    },
  };
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (!url.pathname.startsWith("/api")) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    if (url.pathname === "/api/health" && req.method === "GET") {
      json(res, 200, {ok: true, service: "hermes-control-desk"});
      return true;
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      json(res, 200, {
        host: DEFAULT_HOST,
        user: DEFAULT_USER,
        repo: REPO,
        prodCompose: PROD_COMPOSE,
        runnerService: RUNNER_SERVICE,
        qdrantContainer: QDRANT_CONTAINER,
        composePath: `${REPO}/${PROD_COMPOSE}`,
        labsComposePath: `${REPO}/${LABS_COMPOSE}`,
        agentZeroContainer: AGENT_ZERO_CONTAINER,
        agentZeroPort: AGENT_ZERO_PORT,
        kaliContainer: KALI_CONTAINER,
        kaliPort: KALI_NOVNC_PORT,
        agentZeroUrl: `http://${DEFAULT_HOST}:${AGENT_ZERO_PORT}`,
        kaliUrl: `https://${DEFAULT_HOST}:${KALI_NOVNC_PORT}`,
      });
      return true;
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      const creds = credsFrom({}, url.searchParams);
      const status = await refreshStatus(creds);
      json(res, 200, status);
      return true;
    }

    if (url.pathname === "/api/action" && req.method === "POST") {
      const body = await readJson(req);
      const creds = credsFrom(body, url.searchParams);
      const id = String(body.id || "");
      const result = await runDeskAction(
        id,
        creds,
        String(body.command || ""),
      );
      if ("error" in result) {
        json(res, result.status, {error: result.error});
        return true;
      }
      json(res, result.status, result.body);
      return true;
    }

    json(res, 404, {error: `No API route ${req.method} ${url.pathname}`});
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, {error: message});
    return true;
  }
}
