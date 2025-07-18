<template>
  <div class="bg-gray-100 p-8 font-mono min-h-screen">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="flex justify-between items-center my-4 gap-4 border-b py-4">
        <div>
          <h1 class="text-2xl font-bold">Xstate Workflow Monitor</h1>
          <p class="text-sm text-gray-600 mt-1">
            {{ connectionStatus }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            :disabled="!isConnected || isStarting"
            class="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="startWorkflow"
          >
            <span v-if="isStarting">Starting...</span>
            <span v-else>Start Workflow</span>
          </button>
          <button
            :disabled="workflows.length === 0"
            class="bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="clearWorkflows"
          >
            Clear All
          </button>
        </div>
      </div>

      <!-- Workflows Table -->
      <div class="mt-6">
        <div class="overflow-auto bg-white rounded-lg shadow">
          <table class="w-full text-sm border-collapse table-fixed">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="text-left p-4 font-semibold w-24">ID</th>
                <th class="text-left p-4 font-semibold">Latest Message</th>
                <th class="text-left p-4 font-semibold w-32">Last Update</th>
                <th class="text-left p-4 font-semibold w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="workflows.length === 0" class="text-center">
                <td colspan="4" class="p-8 text-gray-500">No workflows running</td>
              </tr>
              <tr v-for="workflow in workflows" :key="workflow.id" class="border-b hover:bg-gray-50 transition-colors">
                <td class="p-4 font-mono text-xs w-32">
                  <span class="bg-gray-100 px-2 py-1 rounded truncate block">{{ workflow.id }}</span>
                </td>
                <td class="p-4">
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        :class="getStatusColor(workflow.workflowStatus)"
                        class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      ></span>
                      <span class="text-xs text-gray-600 flex-shrink-0">Workflow:</span>
                      <span class="font-medium text-sm truncate">{{ workflow.workflowStatus || "Not set" }}</span>
                    </div>
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        :class="getStatusColor(workflow.xstateState)"
                        class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      ></span>
                      <span class="text-xs text-gray-600 flex-shrink-0">XState:</span>
                      <span class="font-medium text-sm truncate">{{ workflow.xstateState || "Not set" }}</span>
                    </div>
                  </div>
                </td>
                <td class="p-4 text-gray-600 w-32">
                  <span class="text-xs">{{ formatTime(workflow.lastUpdate) }}</span>
                </td>
                <td class="p-4 w-48">
                  <div class="flex gap-2 flex-wrap">
                    <button
                      v-if="workflow.canProcess"
                      class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 transition-colors flex-shrink-0"
                      @click="sendEvent(workflow.id, { type: 'process' })"
                    >
                      Process
                    </button>
                    <button
                      v-if="workflow.canApprove"
                      class="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors flex-shrink-0"
                      @click="sendEvent(workflow.id, { type: 'approved' })"
                    >
                      Approve
                    </button>
                    <button
                      v-if="workflow.canReject"
                      class="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors flex-shrink-0"
                      @click="sendEvent(workflow.id, { type: 'rejected' })"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-6 text-right">
        <a
          href="https://github.com/franciscohermida/xstate-workflow"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          View on GitHub
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { WebSocket } from "partysocket";

// Types
interface WorkflowData {
  id: string;
  workflowStatus: string | undefined;
  xstateState: string | undefined;
  lastUpdate: Date;
  canProcess: boolean;
  canApprove: boolean;
  canReject: boolean;
}

interface WebSocketMessage {
  workflowInstanceId: string;
  type: string;
  payload: string;
  time: string;
}

// Reactive state
const workflows = ref<WorkflowData[]>([]);
const isConnected = ref(false);
const isStarting = ref(false);
const ws = ref<WebSocket | null>(null);

// Computed properties
const connectionStatus = computed(() => {
  if (!isConnected.value) return "Disconnected";
  return "Connected";
});

// Methods
function createOrUpdateWorkflow(id: string, type: string, payload: string, time: string) {
  const existingIndex = workflows.value.findIndex((w) => w.id === id);

  if (existingIndex >= 0) {
    // Update existing workflow
    const existing = workflows.value[existingIndex];
    if (!existing) return; // Safety check

    const updatedWorkflow: WorkflowData = {
      id: existing.id,
      workflowStatus: existing.workflowStatus,
      xstateState: existing.xstateState,
      lastUpdate: new Date(time),
      canProcess: existing.canProcess,
      canApprove: existing.canApprove,
      canReject: existing.canReject,
    };

    // Update based on message type
    if (type === "workflow-status") {
      updatedWorkflow.workflowStatus = payload;
      // Reset action flags and set based on current status
      updatedWorkflow.canProcess = payload === "started";
      updatedWorkflow.canApprove = false;
      updatedWorkflow.canReject = false;
    } else if (type === "xstate-state") {
      updatedWorkflow.xstateState = payload;
      // Reset action flags and set based on current state
      updatedWorkflow.canProcess = false;
      updatedWorkflow.canApprove = payload === "Waiting For Approval";
      updatedWorkflow.canReject = payload === "Waiting For Approval";
    }

    workflows.value[existingIndex] = updatedWorkflow;
  } else {
    // Create new workflow
    const newWorkflow: WorkflowData = {
      id: id,
      workflowStatus: type === "workflow-status" ? payload : undefined,
      xstateState: type === "xstate-state" ? payload : undefined,
      lastUpdate: new Date(time),
      canProcess: type === "workflow-status" && payload === "started",
      canApprove: type === "xstate-state" && payload === "Waiting For Approval",
      canReject: type === "xstate-state" && payload === "Waiting For Approval",
    };

    workflows.value.unshift(newWorkflow);
  }
}

function getStatusColor(message: string | undefined): string {
  if (!message) return "bg-gray-300";
  if (message.includes("Starting...") || message.includes("Initializing")) return "bg-gray-400";
  if (message.includes("started")) return "bg-green-500";
  if (message.includes("Waiting For Approval")) return "bg-yellow-500";
  if (message.includes("approved")) return "bg-blue-500";
  if (message.includes("rejected")) return "bg-red-500";
  if (message.includes("processed")) return "bg-purple-500";
  return "bg-gray-500";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString();
}

async function startWorkflow() {
  if (!isConnected.value || isStarting.value) return;

  isStarting.value = true;
  try {
    const res = await fetch("/api/workflow", { method: "POST" });
    const data = (await res.json()) as { id: string };
    console.log("Started workflow:", data.id);

    // Immediately add the workflow to the list
    const newWorkflow: WorkflowData = {
      id: data.id,
      workflowStatus: undefined,
      xstateState: undefined,
      lastUpdate: new Date(),
      canProcess: false,
      canApprove: false,
      canReject: false,
    };

    workflows.value.unshift(newWorkflow);
  } catch (err) {
    console.error("Failed to start workflow:", err);
  } finally {
    isStarting.value = false;
  }
}

async function sendEvent(id: string, event: { type: string }) {
  try {
    await fetch(`/api/workflow/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "xstate-event", payload: event }),
    });
  } catch (err) {
    console.error("Failed to send event:", err);
  }
}

function clearWorkflows() {
  workflows.value = [];
}

function setupWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}/ws`;

  ws.value = new WebSocket(wsUrl);

  ws.value.onopen = () => {
    isConnected.value = true;
    console.log("WebSocket connected");
  };

  ws.value.onmessage = (e) => {
    const data: WebSocketMessage = JSON.parse(e.data);
    console.log("WebSocket message:", data);

    createOrUpdateWorkflow(data.workflowInstanceId, data.type, data.payload, data.time);
  };

  ws.value.onclose = () => {
    isConnected.value = false;
    console.log("WebSocket disconnected");
    // Attempt to reconnect after 3 seconds
    setTimeout(() => {
      if (ws.value?.readyState === WebSocket.CLOSED) {
        setupWebSocket();
      }
    }, 3000);
  };

  ws.value.onerror = (error) => {
    console.error("WebSocket error:", error);
    isConnected.value = false;
  };
}

// Lifecycle
onMounted(() => {
  setupWebSocket();
});

onUnmounted(() => {
  if (ws.value) {
    ws.value.close();
  }
});
</script>

<style scoped>
/* Additional custom styles can be added here */
</style>
