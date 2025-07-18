import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createActor } from "xstate";
import { myMachine, type MyMachineContext, type MyMachineEvents } from "./machines/myMachine";
import type { Bindings } from "./bindings";

export class XstateWorkflow extends WorkflowEntrypoint<Bindings> {
  async run(event: WorkflowEvent<MyMachineContext>, step: WorkflowStep) {
    const runId = crypto.randomUUID();

    console.log(`Workflow started with runId: ${runId}`);

    const globalWorkflowDOStub = this.env.XSTATE_DO.get(this.env.XSTATE_DO.idFromName("broadcast"));

    async function broadcast(
      args: Omit<Awaited<Parameters<typeof globalWorkflowDOStub.broadcast>[0]>, "workflowInstanceId">,
    ) {
      await globalWorkflowDOStub.broadcast({
        workflowInstanceId: event.instanceId,
        ...args,
      });
    }

    await broadcast({
      type: "workflow-status",
      payload: "started",
    });

    await step.do("save-workflow-instance-id", async () => {
      console.log("saving workflow instance id");
      try {
        await globalWorkflowDOStub.addWorkflowInstanceId(event.instanceId);
      } catch (error) {
        console.error("error saving workflow instance id", error);
      }
    });

    console.log("getting persisted actor");

    // this cannot be cached on a step, has to be executed on every run
    const actor = await getPersistedActor(this.env, {
      workflowInstanceId: event.instanceId,
      initialContext: event.payload,
    });

    // you can choose starting the actor before or after step.waitForEvent<MyMachineEvents> depending if you want to manually start or not
    actor.start();

    while (actor.getSnapshot().status === "active") {
      const eventReceived = await step.waitForEvent<MyMachineEvents>("Waiting for XState Event", {
        type: "xstate-event",
        timeout: "1 minute",
      });

      // this promise is supposed to handle promise actor invoke (still investigating if this can be used)
      const next = await new Promise<boolean>(async (res) => {
        actor.subscribe({
          next: async () => {
            res(true);
          },
        });

        actor.send(eventReceived.payload);
      });

      const snapshot = actor.getSnapshot();

      if (next) {
        await broadcast({
          type: "xstate-state",
          payload: snapshot.value,
        });

        const stepName = `step: ${JSON.stringify(snapshot.value)} ${runId} `;

        if (snapshot.matches("Sending To Queue")) {
          try {
            await step.do(stepName, async () => {
              try {
                const random = Math.random();
                if (random > 0.2 || true) {
                  throw new Error(`api error ${random}`);
                }
              } catch (error) {
                const errorMessage = `step internal error (sending to queue): ${error}`;
                console.log(errorMessage);
                await broadcast({
                  type: "workflow-status",
                  payload: errorMessage,
                });

                throw error;
              }
            });
          } catch (error) {
            const errorMessage = `step error (sending to queue): ${error}`;
            console.log(errorMessage);
            await broadcast({
              type: "workflow-status",
              payload: errorMessage,
            });
            actor.send({ type: "error", errorMessage: "step error (sending to queue)" });
          }
        } else if (snapshot.matches("Waiting For Approval")) {
          await new Promise((res) => setTimeout(res, 1000));
        }
      }

      // persist the snapshot
      await globalWorkflowDOStub.kvSet(getSnapshotKey(event.instanceId), JSON.stringify(actor.getPersistedSnapshot()));
    }

    await step.do("delete-workflow-instance-id", async () => {
      try {
        await globalWorkflowDOStub.removeWorkflowInstanceId(event.instanceId);
      } catch (error) {
        console.error("error removing workflow instance id", error);
      }
    });

    if (actor.getSnapshot().status == "done") {
      await globalWorkflowDOStub.kvDelete(getSnapshotKey(event.instanceId));

      await broadcast({
        type: "xstate-state",
        payload: actor.getSnapshot().value,
      });
      await broadcast({
        type: "workflow-status",
        payload: `Completed`,
      });
      return { success: true };
    }

    if (actor.getSnapshot().status == "error") {
      await globalWorkflowDOStub.kvDelete(getSnapshotKey(event.instanceId));
      await broadcast({
        type: "xstate-state",
        payload: `Errored: ${JSON.stringify(actor.getSnapshot().error)}`,
      });
      await broadcast({
        type: "workflow-status",
        payload: `Errored: xstate error`,
      });
      return { success: false, error: actor.getSnapshot().error };
    }

    await broadcast({
      type: "workflow-status",
      payload: `Errored: Workflow ended unexpectedly`,
    });
    return { success: false, error: "Workflow ended unexpectedly" };
  }
}

function getSnapshotKey(workflowInstanceId: string) {
  return `workflow:${workflowInstanceId}:snapshot`;
}

async function getDO(env: Bindings) {
  const id = env.XSTATE_DO.idFromName("broadcast");
  return env.XSTATE_DO.get(id);
}

async function getPersistedActor(
  env: Bindings,
  args: { workflowInstanceId: string; initialContext: MyMachineContext },
) {
  let persistedSnapshot = undefined;
  const globalWorkflowDOStub = await getDO(env);
  const snapshotRaw = await globalWorkflowDOStub.kvGet(getSnapshotKey(args.workflowInstanceId));
  if (snapshotRaw != null) persistedSnapshot = JSON.parse(snapshotRaw);

  const actor = createActor(myMachine.provide({}), {
    snapshot: persistedSnapshot,
  });

  return actor;
}
