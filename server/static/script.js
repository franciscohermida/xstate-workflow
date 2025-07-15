const workflows = document.getElementById("workflows");
const startBtn = document.getElementById("start");
const ws = new WebSocket(
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`
);

const workflowRows = new Map();

ws.onmessage = (e) => {
  const { id, message, time } = JSON.parse(e.data);
  console.log("onmessage", { id, time, message });

  let row = workflowRows.get(id);
  if (!row) {
    const noWorkflows = document.getElementById("no-workflows");
    if (noWorkflows) noWorkflows.remove();

    row = workflows.insertRow(0);
    row.innerHTML = `
          <td class="p-2 border-b w-20 truncate">${id}</td>
          <td class="p-2 border-b message"></td>
          <td class="p-2 border-b time">${new Date(
            time
          ).toLocaleTimeString()}</td>
          <td class="p-2 border-b actions"></td>
        `;

    workflowRows.set(id, row);
  }
  row.querySelector(".message").textContent = message;
  row.querySelector(".time").textContent = new Date(time).toLocaleTimeString();

  const actionsTd = row.querySelector(".actions");
  actionsTd.innerHTML = ""; // Clear existing buttons
  console.log("actionsTd", actionsTd);
  if (message.includes("Waiting Input")) {
    console.log("creating button");
    const processedBtn = document.createElement("button");
    actionsTd.appendChild(processedBtn);
    processedBtn.id = "send-input";
    processedBtn.textContent = "Send Input";
    processedBtn.onclick = () => sendEvent(id, "received");
  }
};

startBtn.onclick = async () => {
  try {
    const noWorkflows = document.getElementById("no-workflows");
    if (noWorkflows) noWorkflows.remove();
    const res = await fetch("/api/workflow", { method: "POST" });
    const { id } = await res.json();
    console.log("Started workflow:", id);
  } catch (err) {
    console.error("Failed to start workflow:", err);
  }
};

async function sendEvent(id, event) {
  fetch("/api/workflow/" + id, {
    method: "POST",
    body: JSON.stringify({ type: event }),
  });
}
