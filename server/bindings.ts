import type { WebSocketDO } from "./webSocketDo";

export type Bindings = {
  XSTATE_DO: DurableObjectNamespace<WebSocketDO>;
  XSTATE_WORKFLOW_JOBS: Queue;
  XSTATE_WORKFLOW: Workflow;
};
