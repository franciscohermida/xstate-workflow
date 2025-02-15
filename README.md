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
