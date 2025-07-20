import { XstateWorkflowDO } from "./workflowDO";

export type Bindings = {
  MODE: string;
  DO: DurableObjectNamespace<XstateWorkflowDO>;
  QUEUE: Queue;
  WORKFLOW: Workflow;
};
