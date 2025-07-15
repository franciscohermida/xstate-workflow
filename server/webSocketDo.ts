import { DurableObject } from "cloudflare:workers";

// Simple WebSocket broadcaster
export class WebSocketDO extends DurableObject<Env> {
  sockets = new Set<WebSocket>();
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.sockets.add(server);
      server.accept();
      server.addEventListener("close", () => this.sockets.delete(server));
      return new Response(null, {
        status: 101,
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
        },
        webSocket: client,
      });
    }

    return new Response("Not related to WebSocket", { status: 400 });
  }

  async kvSet(key: string, value: string) {
    this.ctx.storage.put(key, value);
  }
  async kvGet(key: string) {
    return this.ctx.storage.get(key);
  }
  async kvDelete(key: string) {
    this.ctx.storage.delete(key);
  }

  async broadcast({ id, message }: { id: string; message: string }) {
    this.sockets.forEach(
      (ws) =>
        ws.readyState === WebSocket.OPEN &&
        ws.send(JSON.stringify({ id, message, time: new Date().toISOString() }))
    );
  }
}
