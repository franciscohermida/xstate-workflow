# Xstate Workflow Monitor

Using Xstate, Cloudflare Workers, Durable Objects, Websockets, Workflows, Queues.

Multi-step approval workflow:

1. User manually starts the process
2. Sends job to queue for processing
3. Waits for user approval/rejection
4. If rejected, retries processing until approved

Based on Workflow-live of [Jordan Coeyman](https://x.com/acoyfellow) at https://github.com/acoyfellow/workflow-live

## Demo

Try it live at [xstate-workflow.boxofapps.workers.dev](https://xstate-workflow.boxofapps.workers.dev/)

## Xstate Machine

![image](https://github.com/user-attachments/assets/0d2c2ad6-99b4-4664-b025-1ccdb8e04859)

## How It Works

Each workflow instance is assigned a unique ID and managed through an XState machine that controls the approval flow. The system uses a Durable Object as an improvised KV database for data persistence and real-time broadcasting via WebSockets.

### Key Features

- **Real-time Vue.js Frontend**: Clean interface with WebSocket-powered live updates showing workflow status
- **User-Controlled Workflow**: Manual process initiation and approval/rejection controls
- **Retry Logic**: Rejected outputs trigger reprocessing until approval
- **Error Testing**: Random errors throughout to test resilience
- **Data Persistence**: Durable Object-based storage with broadcasting for real-time sync
- **Dual State Management**: Clean separation between Cloudflare Workflow infrastructure state and XState business logic

### Architecture Design

**Separation of Concerns**: The system maintains two distinct state machines that serve different purposes:

- **Cloudflare Workflow State**: Generic infrastructure states that apply to any workflow type
  - `Queued`, `Running`, `Waiting For Event`, `Processing Step`, `Completed`, `Errored`
  - Handles workflow lifecycle, error handling, and infrastructure concerns
  - Reusable across different workflow types

- **XState Machine State**: Business-specific states that define the approval workflow logic
  - `Unprocessed`, `Sending To Queue`, `Waiting For Approval`, `Finished`, `Error`
  - Handles business rules, approval logic, and step-specific behavior
  - Specific to each workflow type's requirements

This separation avoids mixing infrastructure concerns with business logic, prevents duplication of concerns, and makes the system clearer to reason about. The frontend displays both states independently, giving users visibility into both the infrastructure status and business process state.

### Workflow States

1. **Unprocessed**: Initial state, waiting for user to start processing
2. **Sending To Queue**: Adds job to queue with random error simulation
3. **Waiting For Approval**: User can approve or reject the output based on criteria (output > 0.25)
4. **Finished**: Successfully completed workflow
5. **Error**: Final error state

### Architecture Flow

1. **Workflow Creation**: User creates a new workflow instance via the Vue frontend
2. **Manual Start**: User clicks "Process" to begin, transitioning machine to "Sending To Queue"
3. **Queue Processing**: Job is sent to Cloudflare Queue with random error simulation (25% failure rate)
4. **Queue Consumer**: Processes the job and returns a random output value
5. **Approval Check**: If output > 0.25, moves to "Waiting For Approval", otherwise errors
6. **User Decision**: User can approve (finish) or reject (retry processing)
7. **Real-time Updates**: All state changes broadcast via WebSocket to connected clients
8. **Data Persistence**: Workflow state and XState snapshots saved in Durable Object storage

### Error Simulation

The system includes intentional error scenarios for testing:

- 25% random failure rate when sending to queue
- Random API errors with configurable retry behavior
- Timeout configurations for various steps
- NonRetryableError vs retryable error handling

---

## Future Investigations

- Investigate creating a base class that delegates control to the xstate machine. For example, a class like `export class MyWorkflow extends XstateWorkflowEntrypoint<Env>` could allow you to configure the machine and define steps for each state change.
- Explore ways to structure the code to make it possible to cache the result of each step and use it as context for the subsequent step
- Does it even make any sense to use a Workflow for this? Wouldn't it be so much easier just using the durable object? Identify the value of using Workflows vs the alternative of not using it.

---

### Installation

```
# Clone the repo
git clone https://github.com/franciscohermida/xstate-workflow.git
cd xstate-workflow

# Install dependencies
pnpm install

# Configure Cloudflare
wrangler login

# Deploy
pnpm run deploy
```

### Development

```
pnpm dev
```
