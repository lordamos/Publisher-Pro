export type ServiceStatus = {
  online: boolean;
  label: string;
};

export type DeskConfig = {
  host: string;
  user: string;
  repo: string;
  prodCompose: string;
  runnerService: string;
  qdrantContainer: string;
  composePath: string;
  labsComposePath: string;
  agentZeroContainer: string;
  agentZeroPort: number;
  kaliContainer: string;
  kaliPort: number;
  agentZeroUrl: string;
  kaliUrl: string;
};

export type DeskStatus = {
  host: string;
  user: string;
  target: string;
  api: ServiceStatus;
  dashboard: ServiceStatus;
  qdrant: ServiceStatus;
  agentZero: ServiceStatus;
  kali: ServiceStatus;
  runner: ServiceStatus;
  cli: ServiceStatus;
  runnerOutput: string;
  cliOutput: string;
  sshUnreachable: boolean;
  sshError: string;
};

export type ActionResult = {
  id: string;
  title: string;
  kind: string;
  target: string;
  command: string;
  remoteCommand?: string;
  output: string;
  exitCode: number;
  refresh: boolean;
  interactive?: boolean;
};

const STORAGE_KEY = "hermes-control-desk";

export function loadSavedTarget(): {host?: string; user?: string} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as {host?: string; user?: string}) : {};
  } catch {
    return {};
  }
}

export function saveTarget(user: string, host: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({user, host}));
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {error?: string};
  if (!res.ok) {
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return data;
}

export async function fetchConfig(): Promise<DeskConfig> {
  const res = await fetch("/api/config");
  return parseJson<DeskConfig>(res);
}

export async function fetchStatus(
  user: string,
  host: string,
): Promise<DeskStatus> {
  const params = new URLSearchParams({user, host});
  const res = await fetch(`/api/status?${params.toString()}`);
  return parseJson<DeskStatus>(res);
}

export async function runAction(
  id: string,
  user: string,
  host: string,
  command = "",
): Promise<ActionResult> {
  const res = await fetch("/api/action", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({id, user, host, command}),
  });
  return parseJson<ActionResult>(res);
}

export const UNKNOWN: ServiceStatus = {online: false, label: "UNKNOWN"};
