import { WebSocketDO } from "./webSocketDo";
import { XstateWorkflow } from "./xstateWorkflow";
import { type MyMachineEvents } from "./machines/myMachine";
import type { Bindings } from "./bindings";

type MessageBody = {
  workflowInstanceId: string;
};

// Simple request router
export default {
  async fetch(req: Request, env: Bindings) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const id = env.XSTATE_DO.idFromName("broadcast");
      return env.XSTATE_DO.get(id).fetch(req);
    }

    if (url.pathname === "/api/workflow") {
      const workflow = await env.XSTATE_WORKFLOW.create();
      console.log(`created workflow: ${workflow.id}`);

      return Response.json({ id: workflow.id });
    }

    if (url.pathname.startsWith("/api/workflow/")) {
      const id = url.pathname.split("/").pop();

      if (!id) {
        return new Response("Not found", { status: 404 });
      }

      const body = ((await req.json()) ?? {}) as {
        type: string;
        payload: unknown;
      };

      const workflow = await env.XSTATE_WORKFLOW.get(id);
      console.log(`endpoint /api/workflow/${workflow.id}`, body);
      await workflow.sendEvent(body);

      return new Response("ok", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<MessageBody>, env: Bindings): Promise<void> {
    const messages = JSON.stringify(batch.messages);
    console.log(`consumed from our queue: ${messages}`);
    for (const message of batch.messages) {
      console.log(`processing message: ${JSON.stringify(message.body, null, 2)}`);
      // take some time processing the message
      await new Promise((res) => setTimeout(res, 1000));

      const id = message.body.workflowInstanceId;

      const workflow = await env.XSTATE_WORKFLOW.get(id);
      await workflow.sendEvent({
        type: "xstate-event",
        payload: {
          type: "processed",
          output: Math.random(),
        } satisfies MyMachineEvents,
      });
    }
  },
} satisfies ExportedHandler<Bindings, MessageBody>;

export { XstateWorkflow, WebSocketDO };
