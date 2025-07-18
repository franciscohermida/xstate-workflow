import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./bindings";

// Simple WebSocket broadcaster
export class WebSocketDO extends DurableObject<Bindings> {
  sockets = new Set<WebSocket>();
  env: Bindings;

  constructor(state: DurableObjectState, env: Bindings) {
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

  async addWorkflowInstanceId(workflowInstanceId: string) {
    const existingWorkflowInstancesString = await this.kvGet("workflow-instances");
    if (existingWorkflowInstancesString == null) {
      await this.kvSet("workflow-instances", JSON.stringify([workflowInstanceId]));
    } else {
      const existingWorkflowInstancesSet = new Set(JSON.parse(existingWorkflowInstancesString as string));
      existingWorkflowInstancesSet.add(workflowInstanceId);
      await this.kvSet("workflow-instances", JSON.stringify(Array.from(existingWorkflowInstancesSet)));
    }
  }

  async removeWorkflowInstanceId(workflowInstanceId: string) {
    const existingWorkflowInstancesString = await this.kvGet("workflow-instances");
    if (existingWorkflowInstancesString == null) {
      return;
    }
    const existingWorkflowInstancesSet = new Set(JSON.parse(existingWorkflowInstancesString as string));
    existingWorkflowInstancesSet.delete(workflowInstanceId);
    await this.kvSet("workflow-instances", JSON.stringify(Array.from(existingWorkflowInstancesSet)));
  }

  async broadcast(event: { workflowInstanceId: string; type: string; payload: unknown }) {
    await new Promise((res) => setTimeout(res, 1000));
    this.sockets.forEach(
      (ws) =>
        ws.readyState === WebSocket.OPEN &&
        ws.send(
          JSON.stringify({
            ...event,
            time: new Date().toISOString(),
          }),
        ),
    );
  }
}
