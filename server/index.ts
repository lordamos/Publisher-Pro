import http from "node:http";
import {handleApi} from "./api.ts";

const port = Number(process.env.CONTROL_DESK_API_PORT || process.env.PORT || 8787);
const listenHost = "0.0.0.0";

const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleApi(req, res);
    if (handled) return;
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({error: "Not found"}));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({error: message}));
    }
  }
});

server.listen(port, listenHost, () => {
  console.log(`Hermes Control Desk API http://${listenHost}:${port}`);
});
