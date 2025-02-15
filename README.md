# Xstate Workflow Monitor

Using Xstate, Cloudflare Workers, Durable Objects, Websockets, Workflows, Queues.

2 Steps workflow:
1. Sends to queue
2. Waits for user input

Based on Workflow-live of [Jordan Coeyman](https://x.com/acoyfellow) at https://github.com/acoyfellow/workflow-live

## Demo
Try it live at [xstate-workflow.boxofapps.workers.dev](https://xstate-workflow.boxofapps.workers.dev/)

## Xstate Machine

![image](https://github.com/user-attachments/assets/0d2c2ad6-99b4-4664-b025-1ccdb8e04859)

## How it works

Each Workflow "run cycle" has an unique id we use this id to make the steps non deterministic (as sugested in "best practices), we want to dynamically decide which step to run as determined by the xstate machine.

We pause the workflow and wait for events, we simulate a trigger by saving the trigger payload to kv or Durable Object storage and resume the workflow and check for trigger value associated to the workflow instance (workaround until they release `waitForEvent` new API)

1. Create workflow (xstate machine instance is created and snapshot persistend)
2. Machine transitions to Processing ("always" xstate transition)
3. Executes functions associated to "Processing" state in a step which will add a job to a Queue (including workflow instanceId so we can trigger it once the consumer of the job finishes processing job)
4. Run again with the previous trigger from job done from Queue and move to a state "Waiting For Input" which the user will send an event to get another from from the workflow
5. Transition to the complete state and complete the workflow.

Below is a revised version of your markdown that remains close to your original structure while being clearer and more concise:

---

## How It Works

Each workflow "run cycle" is assigned a unique ID. We use this ID to intentionally introduce non-determinism into our steps (the opposite of what is suggested in the best practices section) and dynamically decide which step to run using the xstate machine.

Ideally, the workflow would pause until an event with a payload wakes it up. Unfortunately, this feature is not yet available, though it appears to be coming soon according to the [changelog](https://developers.cloudflare.com/changelog/2025-01-15-workflows-more-steps/).

For now, the workaround is to receive the payload at a custom endpoint, save it in KV or Durable Object storage, and then resume the workflow so it can check for the payload.

1. **Workflow Creation:** An xstate machine instance is created and its snapshot is persisted.
2. **Processing:** The machine automatically transitions to the "Processing" state.
3. **Job Queuing:** The step associated with the "Processing" state executes and adds a job to a queue, including the workflow instance ID so that once it is done being processed by the consumer it can send an event to resume the workflow instance.
4. **Waiting for Input:** The workflow transitions the machine to the "Waiting For Input" state, where it waits for the user to send an event by clicking a button on the frontend.
5. **Completion:** The workflow receives the last event to transition to the "Complete" state, finalizing the process.

---

## Future Investigations

- Investigate creating a base class that delegates control to the xstate machine. For example, a class like `export class MyWorkflow extends XstateWorkflowEntrypoint<Env>` could allow you to configure the machine and define steps for each state change.
- Explore ways to structured the code to make it possible to cache the result of each step and use it as context for the subsequent step

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
