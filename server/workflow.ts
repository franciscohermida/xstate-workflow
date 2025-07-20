import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepEvent } from "cloudflare:workers";
import { createActor } from "xstate";
import {
  myMachine,
  type MyMachineContext,
  type MyMachineEvents,
  type MyMachinePersistedSnapshot,
} from "./machines/myMachine";
import type { Bindings } from "./bindings";
import type { XstateWorkflowDO } from "./workflowDO";
import { NonRetryableError } from "cloudflare:workflows";
import { sleep, sleepDev } from "./utils";

export type WorkflowStateValue =
  | "Queued"
  | "Running"
  | "Waiting For Event"
  | "Processing Step"
  | "Completed"
  | "Errored";

export interface WorkflowInstanceData {
  id: string;

  workflowStateValue?: WorkflowStateValue | null | undefined;
  workflowStatusMessage?: string | null | undefined;

  xstateSnapshot?: MyMachinePersistedSnapshot | null | undefined;

  createdAt: Date;
  updatedAt: Date;
}

export class XstateWorkflow extends WorkflowEntrypoint<Bindings> {
  async run(event: WorkflowEvent<MyMachineContext>, step: WorkflowStep) {
    const runId = crypto.randomUUID();
    console.log(`Workflow started with runId: ${runId}`);

    const globalWorkflowDOStub = this.env.DO.get(this.env.DO.idFromName("global"));

    await step.do("save-workflow-instance", { timeout: "1 minute" }, async () => {
      console.log("saving workflow instance");
      try {
        await globalWorkflowDOStub.upsertWorkflowInstance(event.instanceId, {
          workflowStateValue: "Running",
        });
      } catch (error) {
        console.error("error saving workflow instance", error);
        throw error;
      }
    });

    // this cannot be cached on a step, has to be executed on every run
    console.log("getting persisted actor");
    const actor = await getPersistedActor(globalWorkflowDOStub, event);

    // you can choose starting the actor before or after step.waitForEvent<MyMachineEvents> depending if you want to manually start or not
    actor.start();

    await globalWorkflowDOStub.broadcast({
      workflowInstanceId: event.instanceId,
      workflowStateValue: "Running",

      xstateSnapshot: actor.getPersistedSnapshot(),
    });

    while (actor.getSnapshot().status === "active") {
      await globalWorkflowDOStub.broadcast({
        workflowInstanceId: event.instanceId,
        workflowStateValue: "Waiting For Event",
        workflowStatusMessage: null,

        xstateSnapshot: actor.getPersistedSnapshot(),
      });

      let eventReceived: WorkflowStepEvent<MyMachineEvents> | undefined = undefined;
      try {
        eventReceived = await step.waitForEvent<MyMachineEvents>("Waiting for XState Event", {
          type: "xstate-event",
          timeout: "1 minute",
        });
      } catch (error) {
        console.error("error waiting for event", error);

        await globalWorkflowDOStub.broadcast({
          workflowInstanceId: event.instanceId,
          workflowStateValue: "Errored",
          workflowStatusMessage: `${error}`,
        });

        await sleep(1000);
        throw error;
      }

      await new Promise((res) => {
        actor.subscribe({
          next: async () => {
            res(null);
          },
        });

        actor.send(eventReceived.payload);
      });

      const snapshot = actor.getSnapshot();

      await globalWorkflowDOStub.broadcast({
        workflowInstanceId: event.instanceId,
        xstateSnapshot: actor.getPersistedSnapshot(),
      });

      const stepName = `Step: ${JSON.stringify(snapshot.value)} ${runId} `;

      if (snapshot.matches("Sending To Queue")) {
        try {
          await step.do(stepName, { timeout: "1 minute" }, async () => {
            try {
              const random = Math.random();
              if (random < 0.25) {
                throw new Error(`api error ${random}`);
              }
              await this.env.QUEUE.send({
                workflowInstanceId: event.instanceId,
              });
            } catch (error) {
              const errorMessage = `step internal error (sending to queue): ${error}`;
              console.log(errorMessage);
              await globalWorkflowDOStub.broadcast({
                workflowInstanceId: event.instanceId,
                workflowStateValue: "Errored",
                workflowStatusMessage: errorMessage,

                xstateSnapshot: actor.getPersistedSnapshot(),
              });

              await sleep(1000);

              const random = Math.random();
              if (random < 0.25) {
                throw new NonRetryableError(errorMessage);
              } else {
                throw error;
              }
            }
          });
        } catch (error) {
          const errorMessage = `step error (sending to queue): ${error}`;
          console.log(errorMessage);

          await globalWorkflowDOStub.broadcast({
            workflowInstanceId: event.instanceId,
            workflowStateValue: "Errored",
            workflowStatusMessage: errorMessage,

            xstateSnapshot: actor.getPersistedSnapshot(),
          });
          await sleep(1000);

          actor.send({ type: "error", errorMessage: "step error (sending to queue)" });
        }
      } else if (snapshot.matches("Waiting For Approval")) {
        await sleepDev(1000);
      }

      // persist the snapshot
      await globalWorkflowDOStub.upsertWorkflowInstance(event.instanceId, {
        xstateSnapshot: actor.getPersistedSnapshot(),
      });
    }

    await step.do("delete-workflow-instance", { timeout: "1 minute" }, async () => {
      try {
        await globalWorkflowDOStub.removeWorkflowInstance(event.instanceId);
      } catch (error) {
        console.error("error removing workflow instance", error);
      }
    });

    await globalWorkflowDOStub.removeWorkflowInstance(event.instanceId);

    if (actor.getSnapshot().status == "done") {
      await globalWorkflowDOStub.broadcast({
        workflowInstanceId: event.instanceId,
        workflowStateValue: "Completed",

        xstateSnapshot: actor.getPersistedSnapshot(),
      });
      return { success: true };
    }

    if (actor.getSnapshot().status == "error") {
      await globalWorkflowDOStub.broadcast({
        workflowInstanceId: event.instanceId,
        workflowStateValue: "Errored",
        workflowStatusMessage: `xstate error`,

        xstateSnapshot: actor.getPersistedSnapshot(),
      });
      return { success: false, error: actor.getSnapshot().error };
    }

    await globalWorkflowDOStub.broadcast({
      workflowInstanceId: event.instanceId,
      workflowStateValue: "Errored",
      workflowStatusMessage: `Workflow ended unexpectedly`,
    });
    return { success: false, error: "Workflow ended unexpectedly" };
  }
}

async function getPersistedActor(
  globalWorkflowDOStub: DurableObjectStub<XstateWorkflowDO>,
  event: WorkflowEvent<MyMachineContext>,
) {
  let persistedSnapshot: MyMachinePersistedSnapshot | null | undefined = undefined;

  const workflowInstanceData = (await globalWorkflowDOStub.getWorkflowInstance(
    event.instanceId,
  )) as WorkflowInstanceData | null;
  if (workflowInstanceData != null) persistedSnapshot = workflowInstanceData.xstateSnapshot;

  const actor = createActor(myMachine.provide({}), {
    snapshot: persistedSnapshot as MyMachinePersistedSnapshot | undefined,
  });

  return actor;
}
