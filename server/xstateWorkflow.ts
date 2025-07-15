import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { createActor } from "xstate";
import { myMachine, MyMachineContext } from "./machines/myMachine";

export class XstateWorkflow extends WorkflowEntrypoint<Env> {
  private stub = this.env.XSTATE_DO.get(
    this.env.XSTATE_DO.idFromName("broadcast")
  );
  private q = Promise.resolve();

  async run(event: WorkflowEvent<MyMachineContext>, step: WorkflowStep) {
    const runId = crypto.randomUUID();

    const broadcast = (message: string) =>
      (this.q = this.q.then(async () => {
        console.log(`log: ${message}`);
        await this.stub.broadcast({
          id: event.instanceId,
          message,
        });
      }));

    const xEventKey = `${event.instanceId}:event`;
    const xEvent = JSON.parse((await this.stub.kvGet(xEventKey)) ?? "null");

    let persistedSnapshot = undefined;
    const snapshotKey = `${event.instanceId}:snapshot`;
    const snapshotRaw = await this.stub.kvGet(snapshotKey);
    if (snapshotRaw != null) persistedSnapshot = JSON.parse(snapshotRaw);

    const actor = createActor(myMachine, { snapshot: persistedSnapshot });

    type SubEvent =
      | { type: "next" }
      | { type: "error"; error: any }
      | { type: "completed" };

    let subEvent: SubEvent = await new Promise((res) => {
      actor.start();

      actor.subscribe({
        next: async (snapshot) => {
          console.log(
            `actor.subscribe.next: ${JSON.stringify(snapshot.value)}`
          );
          res({ type: "next" });
        },
        error: (error) => {
          console.log(`actor.subscribe.error: ${error?.message}`);
          res({ type: "error", error });
        },
        complete: () => {
          console.log(`actor.subscribe.complete: ${JSON.stringify(snapshot)}`);
          res({ type: "completed" });
        },
      });

      const snapshot = actor.getSnapshot();

      if (xEvent == null) res({ type: "next" });

      if (snapshot.can(xEvent)) {
        actor.send(xEvent);
      } else {
        console.log(
          `Invalid Event: ${JSON.stringify({
            event: xEvent,
            current: snapshot.value,
          })}`
        );
        res({ type: "error", error: "Invalid Event" });
      }
    });

    // persist the snapshot
    await this.stub.kvSet(
      snapshotKey,
      JSON.stringify(actor.getPersistedSnapshot())
    );

    const snapshot = actor.getSnapshot();
    console.log(`snapshot: ${JSON.stringify(snapshot)}`);

    // clean up the event for the next run
    await this.stub.kvDelete(xEventKey);

    // TODO: figure out why subEvent.type "completed" is not working
    if (snapshot.matches("Processed") || subEvent?.type === "completed") {
      await this.stub.kvDelete(snapshotKey);

      console.log("Workflow complete!");
      await broadcast("Workflow complete!");
      return { success: true };
    }

    if (subEvent?.type === "error") {
      await this.stub.kvDelete(snapshotKey);

      // Should this error the whole workflow?
      await broadcast(`Workflow failed: ${subEvent.error.message}`);
      return { success: false, error: subEvent.error.message };
    }

    if (subEvent?.type === "next") {
      const stepName = `step: ${JSON.stringify(snapshot.value)} ${runId} `;

      if (snapshot.matches("Processing")) {
        // decide between deterministic step names or not depending if you want to cache the result
        await step.do(stepName, async () => {
          await broadcast(
            `Sending to queue: ${JSON.stringify(snapshot.value)} ${runId}`
          );

          await this.env.XSTATE_WORKFLOW_JOBS.send({
            workflowInstanceId: event.instanceId,
          });

          // We need to pause and only resume when  we receive an external event
          // Solution from https://github.com/apeacock1991/workflows-wait-for-action/
          // https://x.com/_ashleypeacock/status/1889693397293654503
          const workflow = await this.env.XSTATE_WORKFLOW.get(event.instanceId);
          await workflow.pause();
        });
      } else if (snapshot.matches("Waiting Input")) {
        await step.do(stepName, async () => {
          console.log("Waiting Input");
          await broadcast(stepName);

          const workflow = await this.env.XSTATE_WORKFLOW.get(event.instanceId);
          await workflow.pause();
        });
      }
    }
  }
}
