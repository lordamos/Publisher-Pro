import {
  PROD_COMPOSE,
  QDRANT_CONTAINER,
  REPO,
  RUNNER_SERVICE,
} from "./constants.ts";

export type ActionKind =
  | "ssh"
  | "raw"
  | "interactive-ssh"
  | "interactive-chat";

export type ControlAction = {
  id: string;
  title: string;
  kind: ActionKind;
  command?: string;
  refresh: boolean;
};

export const ACTIONS: Record<string, ControlAction> = {
  "start-stack": {
    id: "start-stack",
    title: "START HERMES STACK",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} up -d`,
    refresh: true,
  },
  "stop-stack": {
    id: "stop-stack",
    title: "STOP HERMES STACK",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} stop`,
    refresh: true,
  },
  "restart-stack": {
    id: "restart-stack",
    title: "RESTART HERMES STACK",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} restart`,
    refresh: true,
  },
  "rebuild-stack": {
    id: "rebuild-stack",
    title: "REBUILD HERMES STACK",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} up -d --build`,
    refresh: true,
  },
  "restart-api": {
    id: "restart-api",
    title: "RESTART API",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} restart app`,
    refresh: true,
  },
  "restart-dashboard": {
    id: "restart-dashboard",
    title: "RESTART DASHBOARD",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} restart dashboard`,
    refresh: true,
  },
  "restart-qdrant": {
    id: "restart-qdrant",
    title: "RESTART QDRANT",
    kind: "ssh",
    command: `docker restart ${QDRANT_CONTAINER}`,
    refresh: true,
  },
  "restart-runner": {
    id: "restart-runner",
    title: "RESTART GITHUB RUNNER",
    kind: "ssh",
    command: `systemctl restart ${RUNNER_SERVICE} && systemctl is-active ${RUNNER_SERVICE}`,
    refresh: true,
  },
  pause: {
    id: "pause",
    title: "PAUSE HERMES",
    kind: "ssh",
    command: "bash -lc 'hermes pause'",
    refresh: false,
  },
  resume: {
    id: "resume",
    title: "RESUME HERMES",
    kind: "ssh",
    command: "bash -lc 'hermes resume'",
    refresh: false,
  },
  "hermes-chat": {
    id: "hermes-chat",
    title: "HERMES CHAT",
    kind: "interactive-chat",
    refresh: false,
  },
  "root-ssh": {
    id: "root-ssh",
    title: "ROOT SSH",
    kind: "interactive-ssh",
    refresh: false,
  },
  "api-logs": {
    id: "api-logs",
    title: "API LOGS",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} logs --tail=150 app`,
    refresh: false,
  },
  "dashboard-logs": {
    id: "dashboard-logs",
    title: "DASHBOARD LOGS",
    kind: "ssh",
    command: `cd ${REPO} && docker compose -f ${PROD_COMPOSE} logs --tail=150 dashboard`,
    refresh: false,
  },
  "runner-logs": {
    id: "runner-logs",
    title: "RUNNER LOGS",
    kind: "ssh",
    command: `journalctl -u ${RUNNER_SERVICE} -n 150 --no-pager`,
    refresh: false,
  },
  "docker-ps": {
    id: "docker-ps",
    title: "DOCKER STATUS",
    kind: "ssh",
    command:
      "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}'",
    refresh: false,
  },
  "hermes-logs": {
    id: "hermes-logs",
    title: "HERMES LOGS",
    kind: "ssh",
    command: "bash -lc 'hermes logs'",
    refresh: false,
  },
  "system-status": {
    id: "system-status",
    title: "SYSTEM STATUS",
    kind: "ssh",
    command:
      "printf '%s\\n' '--- uptime ---'; uptime; printf '%s\\n' '--- memory ---'; free -h; printf '%s\\n' '--- disk ---'; df -h /; printf '%s\\n' '--- docker ---'; docker ps",
    refresh: false,
  },
  "raw-command": {
    id: "raw-command",
    title: "REMOTE ROOT COMMAND",
    kind: "raw",
    refresh: true,
  },
};

export const RUNNER_STATUS_COMMAND = `systemctl is-active ${RUNNER_SERVICE} 2>/dev/null || true`;
export const CLI_STATUS_COMMAND =
  "bash -lc 'command -v hermes >/dev/null 2>&1 && echo READY || echo MISSING'";
