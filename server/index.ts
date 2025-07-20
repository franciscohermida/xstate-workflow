import { XstateWorkflowDO } from "./workflowDO";
import { XstateWorkflow } from "./workflow";
import { type MyMachineEvents } from "./machines/myMachine";
import type { Bindings } from "./bindings";
import { sleepDev } from "./utils";

type MessageBody = {
  workflowInstanceId: string;
};

// Simple request router
export default {
  async fetch(req: Request, env: Bindings) {
    const url = new URL(req.url);

    if (url.pathname === "/api/ws") {
      const id = env.DO.idFromName("global");
      return env.DO.get(id).fetch(req);
    }

    // Create
    if (url.pathname === "/api/workflow") {
      const workflow = await env.WORKFLOW.create();
      const xstateDo = env.DO.get(env.DO.idFromName("global"));
      const result = await xstateDo.broadcast({
        workflowInstanceId: workflow.id,
        workflowStateValue: "Queued",
      });

      return Response.json(result);
    }

    // List
    if (url.pathname === "/api/workflow/list") {
      const id = env.DO.idFromName("global");
      const stub = env.DO.get(id);

      const workflowInstances = await stub.getWorkflowInstances();
      // console.log(`workflowInstances: ${JSON.stringify(workflowInstances, null, 2)}`);
      return Response.json({ workflowInstances });
    }

    // Get
    if (url.pathname.startsWith("/api/workflow/get/")) {
      const id = url.pathname.split("/").pop();

      if (!id) {
        return new Response("Not found", { status: 404 });
      }

      const doId = env.DO.idFromName("global");
      const stub = env.DO.get(doId);

      const workflow = await env.WORKFLOW.get(id);
      // console.log(`workflow: ${JSON.stringify(workflow, null, 2)}`);
      const workflowStatus = await workflow.status();
      console.log("workflow status error", workflowStatus.error);

      const workflowInstanceData = await stub.getWorkflowInstance(id);
      // console.log(`workflowInstance: ${JSON.stringify(workflowInstanceData, null, 2)}`);

      console.log({ workflowInstanceData, workflowStatus });
      return Response.json({ workflowInstanceData, workflowStatus });
    }

    // Clear
    if (url.pathname === "/api/workflow/clear") {
      const id = env.DO.idFromName("global");
      const stub = env.DO.get(id);

      await stub.kvDelete("workflow-instances");

      return Response.json({ success: true });
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

      const workflow = await env.WORKFLOW.get(id);
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
      await sleepDev(1000);

      const id = message.body.workflowInstanceId;

      const workflow = await env.WORKFLOW.get(id);
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

export { XstateWorkflow, XstateWorkflowDO };
