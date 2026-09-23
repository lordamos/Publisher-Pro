import assert from "node:assert/strict";
import test from "node:test";
import {ACTIONS} from "./actions.ts";
import {
  AGENT_ZERO_PORT,
  DEFAULT_HOST,
  DEFAULT_USER,
  KALI_NOVNC_PORT,
  LABS_COMPOSE,
  PROD_COMPOSE,
  QDRANT_CONTAINER,
  REPO,
  RUNNER_SERVICE,
} from "./constants.ts";
import {buildSshArgs, encodeRawCommand, targetOf} from "./ssh.ts";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

test("defaults match the Windows Control Desk", () => {
  assert.equal(DEFAULT_HOST, "100.118.230.116");
  assert.equal(DEFAULT_USER, "root");
  assert.equal(REPO, "/opt/hermes-memory-os");
  assert.equal(PROD_COMPOSE, "docker-compose.prod.yml");
  assert.equal(
    RUNNER_SERVICE,
    "actions.runner.lordamos-hermes-memory-os.vps-hermes.service",
  );
  assert.equal(QDRANT_CONTAINER, "qdrant");
  assert.equal(targetOf(), "root@100.118.230.116");
});

test("SSH uses BatchMode and ConnectTimeout 8", () => {
  const args = buildSshArgs("root@100.118.230.116", "true");
  assert.deepEqual(args, [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "root@100.118.230.116",
    "true",
  ]);
});

test("raw commands are base64-wrapped like the .ps1", () => {
  const command = "cd /opt/hermes-memory-os && docker ps";
  const remote = encodeRawCommand(command);
  const encoded = Buffer.from(command, "utf8").toString("base64");
  assert.equal(remote, `echo '${encoded}' | base64 -d | bash -s`);
});

test("Qdrant restart is the standalone container only", () => {
  const qdrant = ACTIONS["restart-qdrant"];
  assert.equal(qdrant.command, "docker restart qdrant");
  assert.equal(qdrant.command?.includes("compose"), false);
  assert.equal(qdrant.command?.includes("6333"), false);
});

test("stack commands use the production compose file", () => {
  assert.equal(
    ACTIONS["start-stack"].command,
    "cd /opt/hermes-memory-os && docker compose -f docker-compose.prod.yml up -d",
  );
  assert.equal(
    ACTIONS["stop-stack"].command,
    "cd /opt/hermes-memory-os && docker compose -f docker-compose.prod.yml stop",
  );
  assert.equal(
    ACTIONS["rebuild-stack"].command,
    "cd /opt/hermes-memory-os && docker compose -f docker-compose.prod.yml up -d --build",
  );
});

test("every Control Desk action is registered", () => {
  const expected = [
    "start-stack",
    "stop-stack",
    "restart-stack",
    "rebuild-stack",
    "restart-api",
    "restart-dashboard",
    "restart-qdrant",
    "restart-runner",
    "pause",
    "resume",
    "hermes-chat",
    "root-ssh",
    "api-logs",
    "dashboard-logs",
    "runner-logs",
    "docker-ps",
    "hermes-logs",
    "system-status",
    "raw-command",
    "start-labs",
    "restart-agent-zero",
    "restart-kali",
    "agent-zero-logs",
    "kali-logs",
  ];
  for (const id of expected) {
    assert.ok(ACTIONS[id], `missing action ${id}`);
  }
});

test("Agent Zero and Kali use sidecar compose, not Qdrant 6333", () => {
  assert.equal(LABS_COMPOSE, "docker-compose.agent-zero-kali.yml");
  assert.equal(AGENT_ZERO_PORT, 50080);
  assert.equal(KALI_NOVNC_PORT, 6901);
  assert.equal(ACTIONS["restart-agent-zero"].command, "docker restart agent-zero");
  assert.equal(ACTIONS["restart-kali"].command, "docker restart kali-novnc");
  assert.match(
    ACTIONS["start-labs"].command || "",
    /docker compose -f docker-compose.agent-zero-kali.yml up -d/,
  );
  assert.equal(ACTIONS["start-labs"].command?.includes("6333"), false);

  const compose = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../deploy/docker-compose.agent-zero-kali.yml",
    ),
    "utf8",
  );
  assert.equal(/^\s*-\s*["']?6333/m.test(compose), false);
  assert.equal(compose.includes("50080:80"), true);
  assert.equal(compose.includes("6901:6901"), true);
  assert.match(compose, /container_name:\s*agent-zero/);
  assert.match(compose, /container_name:\s*kali-novnc/);
});
