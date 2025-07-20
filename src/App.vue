<template>
  <div class="bg-gray-100 p-8 font-mono min-h-screen">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="flex justify-between items-center my-4 gap-4 border-b py-4">
        <div>
          <h1 class="text-2xl font-bold">Xstate Workflow Monitor</h1>
          <p class="text-sm text-gray-600 mt-1">
            <span
              :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
              class="inline-block w-2 h-2 rounded-full flex-shrink-0"
            ></span>
            {{ connectionStatus }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            :disabled="isCreatingWorkflow"
            class="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="createWorkflow"
          >
            <span v-if="isCreatingWorkflow">Creating...</span>
            <span v-else>Create Workflow</span>
          </button>
          <button
            :disabled="isLoadingWorkflows"
            class="bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="loadWorkflows"
          >
            <span v-if="isLoadingWorkflows">Loading...</span>
            <span v-else>Refresh</span>
          </button>
          <button
            :disabled="workflowsVms.length === 0"
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
              <tr v-if="workflowsVms.length === 0" class="text-center">
                <td colspan="4" class="p-8 text-gray-500">No workflows running</td>
              </tr>
              <tr
                v-for="workflow in workflowsVms"
                :key="workflow.id"
                class="border-b hover:bg-gray-50 transition-colors"
              >
                <td class="p-4 font-mono text-xs w-32">
                  <span class="bg-gray-100 px-2 py-1 rounded truncate block" @click="getWorkflow(workflow.id)">{{
                    workflow.id
                  }}</span>
                </td>
                <td class="p-4">
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        :class="workflow.workflowStatusColor"
                        class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      ></span>
                      <span class="text-xs text-gray-600 flex-shrink-0">Workflow:</span>
                      <span class="font-medium text-xs">{{ workflow.workflowStatus || "Not set" }}</span>
                    </div>
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        :class="workflow.xstateStateValueColor"
                        class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      ></span>
                      <span class="text-xs text-gray-600 flex-shrink-0">XState:</span>
                      <span class="font-medium text-xs">{{ workflow.xstateStatus }}</span>
                    </div>
                  </div>
                </td>
                <td class="p-4 text-gray-600 w-32">
                  <div :key="workflow.instance.updatedAt.getTime()" class="text-xs relative">
                    <div>
                      {{ formatTime(workflow.instance.updatedAt) }}
                    </div>
                    <div
                      class="absolute inset-0 text-blue-400 font-bold animate-in fade-in direction-reverse fill-mode-forwards duration-500 ease-out"
                    >
                      {{ formatTime(workflow.instance.updatedAt) }}
                    </div>
                  </div>
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
import { orderBy } from "es-toolkit";
import type { WorkflowInstanceData, WorkflowStateValue } from "../server/workflow";
import { myMachine, type MyMachineEvents } from "../server/machines/myMachine";
import { createActor } from "xstate";

// Reactive state
const workflows = ref<WorkflowInstanceData[]>([]);
const workflowsVms = computed(() =>
  orderBy(workflows.value, [(w) => w.createdAt], ["desc"]) // Sort by created date, newest first
    .map((w) => {
      const actor = createActor(myMachine, {
        snapshot: w.xstateSnapshot ?? undefined,
      });

      const snapshot = actor.getSnapshot();
      const xstateStateValue = snapshot.value;

      return {
        id: w.id,
        instance: w,
        canProcess:
          (w.workflowStateValue === "Waiting For Event" || w.workflowStateValue === "Running") &&
          xstateStateValue === "Unprocessed",
        canApprove: w.workflowStateValue !== "Errored" && xstateStateValue === "Waiting For Approval",
        canReject: w.workflowStateValue !== "Errored" && xstateStateValue === "Waiting For Approval",
        workflowStatus: w.workflowStatusMessage
          ? `${w.workflowStateValue ?? "Unknown"}: ${w.workflowStatusMessage}`
          : (w.workflowStateValue ?? "Not set"),
        xstateStatus: snapshot.context.errorMessage
          ? `${xstateStateValue ?? "Unknown"}: ${snapshot.context.errorMessage}`
          : (xstateStateValue ?? "Not set"),
        xstateStateValue,
        workflowStatusColor: getWorkflowStatusColor(w.workflowStateValue),
        xstateStateValueColor: getXstateStatusColor(xstateStateValue),
      };
    }),
);
const isConnected = ref(false);
const isCreatingWorkflow = ref(false);
const isLoadingWorkflows = ref(false);

// Computed properties
const connectionStatus = computed(() => {
  if (!isConnected.value) return "Disconnected";
  return "Connected";
});

// Methods
function createOrUpdateWorkflow(data: WorkflowInstanceData) {
  const existingIndex = workflows.value.findIndex((w) => w.id === data.id);

  if (workflows.value[existingIndex] != null) {
    const existing = workflows.value[existingIndex];

    Object.assign(existing, {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  } else {
    const newWorkflow: WorkflowInstanceData = {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };

    workflows.value.unshift(newWorkflow);
  }
}

function getWorkflowStatusColor(message: WorkflowStateValue | null | undefined): string {
  if (!message) return "bg-gray-300";
  if (message.includes("Starting...") || message.includes("Initializing")) return "bg-gray-400";
  if (message.includes("Completed")) return "bg-green-500";
  if (message.includes("Error")) return "bg-red-500";
  return "bg-gray-500";
}

function getXstateStatusColor(message: string | undefined): string {
  if (!message) return "bg-gray-300";
  if (message.includes("Unprocessed")) return "bg-gray-400";
  if (message.includes("Waiting For Approval")) return "bg-yellow-500";
  if (message.includes("Error")) return "bg-red-500";
  if (message.includes("Finished")) return "bg-green-500";
  return "bg-gray-500";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString();
}

async function createWorkflow() {
  if (isCreatingWorkflow.value) return;

  isCreatingWorkflow.value = true;
  try {
    await fetch("/api/workflow", { method: "POST" });
  } catch (err) {
    console.error("Failed to start workflow:", err);
  } finally {
    isCreatingWorkflow.value = false;
  }
}

async function sendEvent(id: string, event: MyMachineEvents) {
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

async function loadWorkflows() {
  isLoadingWorkflows.value = true;
  try {
    const res = await fetch("/api/workflow/list");
    const data = (await res.json()) as { workflowInstances: WorkflowInstanceData[] };
    console.log("data", data);

    // Convert date strings back to Date objects and replace the entire workflows array
    const updatedWorkflows = data.workflowInstances.map((instance) => ({
      ...instance,
      createdAt: new Date(instance.createdAt),
      updatedAt: new Date(instance.updatedAt),
    }));

    // Replace the entire workflows array to ensure removed workflows are not shown
    workflows.value = updatedWorkflows;
  } catch (err) {
    console.error("Failed to load workflows:", err);
  } finally {
    isLoadingWorkflows.value = false;
  }
}

async function clearWorkflows() {
  await fetch("/api/workflow/clear", { method: "POST" });
  workflows.value = [];
}

async function getWorkflow(id: string) {
  const res = await fetch(`/api/workflow/get/${id}`);
  const data = (await res.json()) as { workflowInstanceData: WorkflowInstanceData; workflowStatus: InstanceStatus };

  // Convert date strings back to Date objects (JSON deserialization converts Dates to strings)
  if (data.workflowInstanceData) {
    data.workflowInstanceData.createdAt = new Date(data.workflowInstanceData.createdAt);
    data.workflowInstanceData.updatedAt = new Date(data.workflowInstanceData.updatedAt);
  }

  console.log("Workflow:", data);
  return data;
}

const ws = ref<WebSocket | null>(null);
function setupWebSocket() {
  const wsUrl = `${location.origin}/api/ws`;

  ws.value = new WebSocket(wsUrl, undefined, { debug: true });

  ws.value.onopen = () => {
    isConnected.value = true;
  };

  ws.value.onmessage = (e) => {
    console.log("WebSocket message:", e.data);
    const data = JSON.parse(e.data) as WorkflowInstanceData;
    createOrUpdateWorkflow(data);
  };

  ws.value.onclose = () => {
    isConnected.value = false;
  };

  ws.value.onerror = (error) => {
    console.error("WebSocket error:", error);
    isConnected.value = false;
  };
}

// Lifecycle
onMounted(() => {
  setupWebSocket();
  loadWorkflows();
});

onUnmounted(() => {
  if (ws.value) {
    ws.value.close();
  }
});
</script>
