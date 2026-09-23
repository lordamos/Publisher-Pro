import {spawn} from "node:child_process";
import net from "node:net";
import {
  DEFAULT_HOST,
  DEFAULT_USER,
  PORT_PROBE_TIMEOUT_MS,
  SSH_CONNECT_TIMEOUT_SECONDS,
} from "./constants.ts";

export type SshResult = {
  exitCode: number;
  output: string;
};

export function targetOf(
  user = DEFAULT_USER,
  host = DEFAULT_HOST,
): string {
  return `${user.trim()}@${host.trim()}`;
}

export function buildSshArgs(target: string, command: string): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
    target,
    command,
  ];
}

export function encodeRawCommand(command: string): string {
  const encoded = Buffer.from(command, "utf8").toString("base64");
  return `echo '${encoded}' | base64 -d | bash -s`;
}

export function testPort(
  host: string,
  port: number,
  timeoutMs = PORT_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

export function invokeSsh(
  user: string,
  host: string,
  command: string,
  timeoutMs = 300_000,
): Promise<SshResult> {
  const target = targetOf(user, host);
  const args = buildSshArgs(target, command);

  return new Promise((resolve) => {
    const child = spawn("ssh", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;

    const finish = (exitCode: number, extra = "") => {
      if (settled) return;
      settled = true;
      const combined = `${output}${extra}`.trimEnd();
      resolve({exitCode, output: combined});
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(1, `\nERROR: SSH command timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish(1, `ERROR: ${err.message}`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code ?? 1);
    });
  });
}
