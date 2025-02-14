import { WebSocketDO } from "./webSocketDo";
import { XstateWorkflow } from "./xstateWorkflow";

// Simple request router
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const id = env.XSTATE_DO.idFromName("broadcast");
      return env.XSTATE_DO.get(id).fetch(req);
    }
    if (url.pathname === "/api/workflow") {
      const { id } = await env.XSTATE_WORKFLOW.create({});
      return Response.json({ id });
    }
    if (url.pathname.startsWith("/api/workflow/")) {
      const id = url.pathname.split("/").pop();

      const body = (await req.json()) ?? {};

      // TODO: Deduplicate somehow
      const doId = env.XSTATE_DO.idFromName("broadcast");
      const doInstance = env.XSTATE_DO.get(doId);
      await doInstance.kvSet(`${id}:event`, JSON.stringify(body));

      const workflow = await env.XSTATE_WORKFLOW.get(id);
      await workflow.resume();

      return new Response("ok", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  async queue(batch, env): Promise<void> {
    let messages = JSON.stringify(batch.messages);
    console.log(`consumed from our queue: ${messages}`);
    for (const message of batch.messages) {
      console.log(`processing message: ${message.body}`);
      // taking some time processing the message
      await new Promise((res) => setTimeout(res, 1000));

      const id = message.body.workflowInstanceId;

      // TODO: Deduplicate somehow
      const doId = env.XSTATE_DO.idFromName("broadcast");
      const doInstance = env.XSTATE_DO.get(doId);
      await doInstance.kvSet(
        `${id}:event`,
        JSON.stringify({ type: "processed" })
      );

      const workflow = await env.XSTATE_WORKFLOW.get(id);
      await workflow.resume();
    }
  },
} satisfies ExportedHandler<Env>;

export { XstateWorkflow, WebSocketDO };
