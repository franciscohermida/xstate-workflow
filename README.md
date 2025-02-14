# Xstate Workflow Monitor

Using Xstate, Cloudflare Workers, Durable Objects, Websockets, Workflows, Queues.

2 Steps workflow:
1. Sends to queue
2. Waits for user input

Based on Workflow-live of [Jordan Coeyman](https://x.com/acoyfellow) at https://github.com/acoyfellow/workflow-live

## Demo
Try it live at [workflow-xstate.boxofapps.workers.dev](https://workflow-xstate.boxofapps.workers.dev/)

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