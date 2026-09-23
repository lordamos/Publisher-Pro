import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = process.env.CONTROL_DESK_API_PORT || "8787";
const uiPort = process.env.PORT || "3000";

function bin(name) {
  return path.join(root, "node_modules", ".bin", name);
}

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    cwd: root,
    env: {...process.env, ...extraEnv},
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
  return child;
}

const api = run(bin("tsx"), ["server/index.ts"], {
  CONTROL_DESK_API_PORT: apiPort,
});
const ui = run(bin("vite"), [`--port=${uiPort}`, "--host=0.0.0.0"]);

function shutdown() {
  api.kill();
  ui.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
