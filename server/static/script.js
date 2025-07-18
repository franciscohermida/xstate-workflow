const workflows = document.getElementById("workflows");
const startBtn = document.getElementById("start");
const ws = new WebSocket(
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`
);

const workflowRows = new Map();

function createOrGetRow(id) {
  let row = workflowRows.get(id);
  if (!row) {
    const noWorkflows = document.getElementById("no-workflows");
    if (noWorkflows) noWorkflows.remove();

    row = workflows.insertRow(0);
    row.innerHTML = `
          <td class="p-2 border-b w-20 truncate">${id}</td>
          <td class="p-2 border-b message"></td>
          <td class="p-2 border-b time"></td>
          <td class="p-2 border-b actions"></td>
        `;

    workflowRows.set(id, row);
  }
  return row;
}

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log("onmessage", data);

  let row = createOrGetRow(data.workflowInstanceId);

  const rowMessageElement = row.querySelector(".message")
  
  row.querySelector(".time").textContent = new Date(data.time).toLocaleTimeString();

  const actionsTd = row.querySelector(".actions");
  actionsTd.innerHTML = ""; // Clear existing buttons

  if (data.type === "workflow-status" && data.payload === "started") {
    rowMessageElement.textContent = `${data.type}: ${data.payload}`;
    console.log("creating button");
    const processedBtn = document.createElement("button");
    actionsTd.appendChild(processedBtn);
    processedBtn.id = "send-processed";
    processedBtn.textContent = "Process";
    processedBtn.onclick = () => sendEvent(data.workflowInstanceId, {type: "xstate-event", payload: { type: "process" }});
  }

  else if (data.type === "xstate-state" && data.payload === "Waiting For Approval") {
    console.log("creating button");
    
    const approvedBtn = document.createElement("button");
    actionsTd.appendChild(approvedBtn);
    approvedBtn.id = "send-approved";
    approvedBtn.textContent = "Approve";
    approvedBtn.onclick = () => sendEvent(data.workflowInstanceId, {type: "xstate-event", payload: { type: "approved" }});

    const processedBtn = document.createElement("button");
    actionsTd.appendChild(processedBtn);
    processedBtn.id = "send-rejected";
    processedBtn.textContent = "Reject";
    processedBtn.onclick = () => sendEvent(data.workflowInstanceId, {type: "xstate-event", payload: { type: "rejected" }});
  }
  else {
    rowMessageElement.textContent = `${data.type}: ${data.payload}`;
  }
};

startBtn.onclick = async () => {
  try {
    const noWorkflows = document.getElementById("no-workflows");
    if (noWorkflows) noWorkflows.remove();
    const res = await fetch("/api/workflow", { method: "POST" });
    const { id } = await res.json();
    console.log("Started workflow:", id);
    const row = createOrGetRow(id);
  } catch (err) {
    console.error("Failed to start workflow:", err);
  }
};

async function sendEvent(id, event) {
  fetch("/api/workflow/" + id, {
    method: "POST",
    body: JSON.stringify(event),
  });
}
