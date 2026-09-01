const params = new URLSearchParams(location.search);
const powerToken = params.get("token") || "";

const proto = location.protocol === "https:" ? "wss" : "ws";
let socket;
let takeover = false;
let assistantBuf = "";

const messagesEl = document.getElementById("messages");
const cardsEl = document.getElementById("cards");
const commandsEl = document.getElementById("commands");
const inputEl = document.getElementById("input");
const modelEl = document.getElementById("model");
const thinkingEl = document.getElementById("thinking");
const nodePill = document.getElementById("node-pill");
const takeoverPill = document.getElementById("takeover-pill");
const liveEl = document.getElementById("live");
const frameEl = document.getElementById("frame");
const liveHint = document.getElementById("live-hint");
const authEl = document.getElementById("auth");
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const pairBtn = document.getElementById("pair-btn");
const pairPanel = document.getElementById("pair-panel");
const pairCodeEl = document.getElementById("pair-code");
const pairHintEl = document.getElementById("pair-hint");

const COMMANDS = [
  ["browser-start", "Start a run"],
  ["browser-status", "Status"],
  ["browser-runs", "Runs"],
  ["browser-pause", "Pause"],
  ["browser-resume", "Resume"],
  ["browser-takeover", "Takeover"],
  ["browser-stop", "Stop"],
  ["browser-knowledge", "Knowledge"],
  ["browser-approve", "Approve"],
];

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function addMessage(role, text, extraClass = "") {
  const el = document.createElement("div");
  el.className = `msg ${role} ${extraClass}`.trim();
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function setNode(connected, reason) {
  nodePill.textContent = connected ? "Connected" : reason || "helper offline";
  nodePill.className = `pill ${connected ? "on" : "off"}`;
}

function setTakeover(on) {
  takeover = on;
  takeoverPill.classList.toggle("hidden", !on);
  liveHint.textContent = on ? "Input enabled — complete the step, then /browser-resume" : "Read-only until takeover";
}

function showAuthError(text) {
  authError.hidden = !text;
  authError.textContent = text || "";
}

async function me() {
  const res = await fetch("/me", { credentials: "same-origin" });
  return res.ok;
}

function connectChat() {
  socket = new WebSocket(`${proto}://${location.host}/chat`);
  socket.addEventListener("open", () => send({ type: "hello", token: powerToken || undefined }));
  socket.addEventListener("message", onServerMessage);
}

function onServerMessage(event) {
  const msg = JSON.parse(event.data);
  if (msg.type === "hello_ok") return;
  if (msg.type === "models") {
    modelEl.innerHTML = "";
    for (const model of msg.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label;
      modelEl.appendChild(option);
    }
    return;
  }
  if (msg.type === "stateSync") {
    if (msg.state.model) modelEl.value = msg.state.model;
    if (msg.state.thinking) thinkingEl.value = msg.state.thinking;
    setNode(msg.state.nodeConnected);
    setTakeover(msg.state.takeover);
    return;
  }
  if (msg.type === "nodeStatus") {
    setNode(msg.connected, msg.reason);
    setTakeover(msg.takeover);
    if (!msg.connected) addMessage("system", msg.reason || "Helper disconnected");
    return;
  }
  if (msg.type === "notify") {
    addMessage("system", msg.message);
    return;
  }
  if (msg.type === "error") {
    addMessage("system", msg.message, "error");
    return;
  }
  if (msg.type === "ui_request") {
    renderCard(msg);
    return;
  }
  if (msg.type === "frame") {
    frameEl.src = `data:image/jpeg;base64,${msg.jpeg}`;
    liveEl.classList.add("has-frame");
    return;
  }
  if (msg.type === "agentEvent") {
    const ev = msg.event || {};
    if (ev.type === "text_delta") {
      assistantBuf += ev.text || "";
      const last = messagesEl.querySelector(".msg.assistant:last-child");
      if (last) last.textContent = assistantBuf;
      else addMessage("assistant", assistantBuf);
      return;
    }
    if (ev.type === "agent_end" || ev.type === "turn_end") assistantBuf = "";
    if (ev.toolName) addMessage("tool", `${ev.toolName}`);
    if (ev.verification) {
      addMessage("tool", `harness ${ev.verification.status}${ev.recovery ? `: ${ev.recovery}` : ""}`);
    }
    if (ev.type === "node_event" && ev.message) addMessage("system", ev.message);
    if (ev.result?.verification) {
      const v = ev.result.verification;
      addMessage("tool", `harness ${v.status}${ev.result.recovery ? `: ${ev.result.recovery}` : ""}`);
    }
    if (isPlanEvent(ev.type)) {
      addPlanCard(ev);
    }
  }
}

const PLAN_TYPES = new Set([
  "action_start",
  "action_done",
  "action_failed",
  "attempt_start",
  "attempt_result",
  "plan_done",
  "escalate",
  "step",
]);

function isPlanEvent(type) {
  return PLAN_TYPES.has(type);
}

function addPlanCard(ev) {
  const el = addMessage(
    "tool",
    planLine(ev),
    "plan",
  );
  el.dataset.planType = ev.type || "";
  el.dataset.actionId = ev.actionId || "";
}

function planLine(ev) {
  if (ev.type === "action_start") return `plan ${ev.actionId || ""}: ${ev.intent || "start"}`;
  if (ev.type === "action_done") return `plan ${ev.actionId || ""} done via ${ev.via || ""}`.trim();
  if (ev.type === "attempt_start") return `plan attempt ${ev.attempt || ""}`;
  if (ev.type === "attempt_result") return `plan attempt ${ev.attempt || ""} ${ev.ok ? "ok" : "miss"} ${ev.reason || ""}`.trim();
  if (ev.type === "plan_done") return "plan done";
  if (ev.type === "escalate") return `plan escalate: ${ev.reason || ""}`;
  if (ev.type === "step") return `plan step ${ev.op || ""} ${ev.ok ? "ok" : "fail"} ${ev.detail || ""}`.trim();
  if (ev.type === "action_failed") return `plan ${ev.actionId || ""} failed`;
  return `plan ${ev.type}`;
}

async function authRequest(path) {
  showAuthError("");
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: authEmail.value, password: authPassword.value }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showAuthError(body.error || res.statusText);
    return false;
  }
  authEl.classList.add("hidden");
  connectChat();
  return true;
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void authRequest("/auth/login");
});
document.getElementById("auth-register").addEventListener("click", () => {
  void authRequest("/auth/register");
});

function pairOrigin() {
  return `${location.protocol}//${location.host}`;
}

function pairCommand(code) {
  const origin = pairOrigin();
  const nodeUrl = `${proto}://${location.host}/node`;
  const extra = location.host === "agent.trustless-commerce.com" ? "" : ` BSA_API_URL=${nodeUrl}`;
  return `curl -fsSL ${origin}/install.sh | BSA_PAIR_CODE=${code}${extra} bash`;
}

function pairWindowsCommand(code) {
  const origin = pairOrigin();
  const nodeUrl = `${proto}://${location.host}/node`;
  const extra =
    location.host === "agent.trustless-commerce.com" ? "" : ` $env:BSA_API_URL='${nodeUrl}';`;
  return `curl.exe -fsSL ${origin}/install.ps1 -o $env:TEMP\\bsa-install.ps1; $env:BSA_PAIR_CODE='${code}';${extra} powershell -ExecutionPolicy Bypass -File $env:TEMP\\bsa-install.ps1`;
}

pairBtn.addEventListener("click", async () => {
  pairPanel.classList.add("hidden");
  const res = await fetch("/pair/issue", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.code) {
    addMessage("system", body.error || "Could not issue a pair code", "error");
    return;
  }
  pairCodeEl.textContent = body.code;
  pairHintEl.textContent = pairCommand(body.code);
  const winEl = document.getElementById("pair-win");
  if (winEl) winEl.textContent = pairWindowsCommand(body.code);
  pairPanel.classList.remove("hidden");
});

document.getElementById("pair-copy").addEventListener("click", async () => {
  const text = pairHintEl.textContent || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    addMessage("system", "Pair command copied.");
  } catch {
    addMessage("system", text);
  }
});

COMMANDS.forEach(([name, label]) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `/${name}`;
  button.title = label;
  button.addEventListener("click", async () => {
    if (name === "browser-start") {
      const goal = prompt("Goal for this browser run?");
      if (!goal) return;
      const url = prompt("Optional start URL") || "";
      send({ type: "command", name, args: url ? `--url ${url} ${goal}` : goal });
      addMessage("user", `/${name} ${url ? `--url ${url} ` : ""}${goal}`);
      return;
    }
    if (name === "browser-approve") {
      const id = prompt("Knowledge id to approve?");
      if (!id) return;
      send({ type: "command", name, args: id });
      addMessage("user", `/${name} ${id}`);
      return;
    }
    send({ type: "command", name, args: "" });
    addMessage("user", `/${name}`);
  });
  commandsEl.appendChild(button);
});

document.getElementById("composer").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  addMessage("user", text);
  send({ type: "prompt", text });
  inputEl.value = "";
  assistantBuf = "";
});

document.getElementById("abort").addEventListener("click", () => send({ type: "abort" }));
modelEl.addEventListener("change", () => send({ type: "setModel", model: modelEl.value }));
thinkingEl.addEventListener("change", () => send({ type: "setThinking", level: thinkingEl.value }));

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.getElementById("composer").requestSubmit();
  }
});

function renderCard(request) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.requestId = request.requestId;
  const title = document.createElement("h3");
  title.textContent = request.title || request.kind;
  card.appendChild(title);
  if (request.message) {
    const p = document.createElement("p");
    p.textContent = request.message;
    card.appendChild(p);
  }
  const row = document.createElement("div");
  row.className = "row";
  const finish = (value) => {
    send({ type: "ui_answer", requestId: request.requestId, value });
    addMessage("user", String(value));
    card.remove();
  };
  if (request.kind === "confirm") {
    for (const [label, value] of [["Yes", true], ["No", false]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => finish(value));
      row.appendChild(button);
    }
  } else if (request.kind === "select") {
    for (const option of request.options || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => finish(option));
      row.appendChild(button);
    }
  } else {
    const field = document.createElement("input");
    field.placeholder = request.placeholder || request.message || "";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = "Answer";
    submit.addEventListener("click", () => finish(field.value));
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(field.value);
    });
    row.append(field, submit);
  }
  card.appendChild(row);
  cardsEl.appendChild(card);
}

function point(event) {
  const rect = frameEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function sendInput(event) {
  if (!takeover) return;
  send({ type: "takeover_input", event });
}

frameEl.addEventListener("mousemove", (event) => {
  const p = point(event);
  if (p) sendInput({ kind: "mouse", action: "move", x: p.x, y: p.y });
});
frameEl.addEventListener("mousedown", (event) => {
  event.preventDefault();
  const p = point(event);
  if (p) sendInput({ kind: "mouse", action: "down", x: p.x, y: p.y, button: event.button });
});
frameEl.addEventListener("mouseup", (event) => {
  const p = point(event);
  if (p) sendInput({ kind: "mouse", action: "up", x: p.x, y: p.y, button: event.button });
});
frameEl.addEventListener("wheel", (event) => {
  const p = point(event);
  if (p) sendInput({ kind: "mouse", action: "wheel", x: p.x, y: p.y, deltaY: event.deltaY });
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (!takeover || event.target !== document.body && event.target !== frameEl) return;
  sendInput({ kind: "key", action: "down", key: event.key, text: event.key.length === 1 ? event.key : undefined });
});
window.addEventListener("keyup", (event) => {
  if (!takeover) return;
  sendInput({ kind: "key", action: "up", key: event.key });
});

void (async () => {
  if (powerToken) {
    authEl.classList.add("hidden");
    connectChat();
    return;
  }
  if (await me()) {
    authEl.classList.add("hidden");
    connectChat();
    return;
  }
  authEl.classList.remove("hidden");
})();
