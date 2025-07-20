import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./bindings";
import type { WorkflowInstanceData } from "./workflow";
import { sleepDev } from "./utils";

export type BroadcastArgsBase = Partial<WorkflowInstanceData>;

export type BroadcastEvent = BroadcastArgsBase & {
  workflowInstanceId: string;
};

export class XstateWorkflowDO extends DurableObject<Bindings> {
  constructor(state: DurableObjectState, env: Bindings) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      this.ctx.acceptWebSocket(server);

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

  async kvSet(key: string, value: unknown) {
    this.ctx.storage.put(key, value);
  }

  async kvGet(key: string) {
    return this.ctx.storage.get(key);
  }

  async kvDelete(key: string) {
    this.ctx.storage.delete(key);
  }

  async upsertWorkflowInstance(workflowInstanceId: string, data?: Partial<WorkflowInstanceData>) {
    let workflowInstances = (await this.kvGet("workflow-instances")) as WorkflowInstanceData[] | null;

    if (workflowInstances == null) {
      workflowInstances = [];
    }

    let existing = workflowInstances.find((instance) => instance.id === workflowInstanceId);

    const now = new Date();
    if (existing == null) {
      existing = {
        id: workflowInstanceId,
        createdAt: now,
        updatedAt: now,
      };

      workflowInstances.push(existing);
    }

    Object.assign(existing, {
      ...existing,
      ...data,
      updatedAt: now,
    });

    await this.kvSet("workflow-instances", workflowInstances);

    return existing;
  }

  async removeWorkflowInstance(workflowInstanceId: string) {
    const workflowInstances = (await this.kvGet("workflow-instances")) as WorkflowInstanceData[] | null;
    if (workflowInstances == null) {
      return;
    }

    const index = workflowInstances.findIndex((instance) => instance.id === workflowInstanceId);
    if (index !== -1) {
      workflowInstances.splice(index, 1);
    }

    await this.kvSet("workflow-instances", workflowInstances);
  }

  async getWorkflowInstances(): Promise<WorkflowInstanceData[]> {
    const workflowInstances = (await this.kvGet("workflow-instances")) as WorkflowInstanceData[] | null;
    if (workflowInstances == null) {
      return [];
    }

    return workflowInstances;
  }

  async getWorkflowInstance(id: string) {
    const workflowInstances = (await this.kvGet("workflow-instances")) as WorkflowInstanceData[] | null;
    if (workflowInstances == null) {
      return null;
    }

    const workflowInstanceData = workflowInstances.find((instance) => instance.id === id);

    if (workflowInstanceData == null) {
      return null;
    }

    return workflowInstanceData;
  }

  async broadcast(event: BroadcastEvent) {
    await sleepDev(1000);

    const updated = await this.upsertWorkflowInstance(event.workflowInstanceId, {
      ...event,
    });

    const sockets = this.ctx.getWebSockets();
    sockets.forEach(
      (ws) =>
        ws.readyState === WebSocket.OPEN &&
        ws.send(
          JSON.stringify({
            ...updated,
          }),
        ),
    );
  }
}
