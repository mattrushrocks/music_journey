const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#messageInput");
const statusEl = document.querySelector("#status");
const suggestionsEl = document.querySelector("#suggestions");
const resetButton = document.querySelector("#resetButton");
const template = document.querySelector("#messageTemplate");
const personaGridEl = document.querySelector("#personaGrid");
const chatTitleEl = document.querySelector("#chatTitle");
const journeyChartsEl = document.querySelector("#journeyCharts");

const generalSeedQuestions = [
  "What are the biggest differences between the Apple Music and Spotify personas?",
  "Where does the journey map show the biggest friction?",
  "Which persona cares most about audio quality?",
  "What patterns showed up across the five personas?"
];

let chatHistory = [];
let isSending = false;
let personas = [];
let selectedPersona = null;
let journeyGraph = null;
let journeyStages = [];

function themeNameForPersona(persona) {
  if (!persona) return "neutral";
  return persona.platform === "Apple Music" ? "apple" : "spotify";
}

function applyTheme() {
  document.body.dataset.theme = themeNameForPersona(selectedPersona);
}

function getPersonaQuestions(persona) {
  const firstName = persona.name.split(" ")[0];
  return [
    `Hi ${firstName}, can you introduce yourself?`,
    `Why do you use ${persona.platform}?`,
    `What frustrates you most about music apps?`,
    `What are you trying to get out of listening?`
  ];
}

function addMessage(role, text) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const roleEl = fragment.querySelector(".message-role");
  const bodyEl = fragment.querySelector(".message-body");

  article.classList.add(role);
  roleEl.textContent = role === "assistant"
    ? selectedPersona
      ? selectedPersona.name
      : "Project Agent"
    : "You";
  bodyEl.textContent = text;
  messagesEl.appendChild(fragment);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  const questions = selectedPersona ? getPersonaQuestions(selectedPersona) : generalSeedQuestions;

  questions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question;
    button.addEventListener("click", () => {
      inputEl.value = question;
      inputEl.focus();
    });
    suggestionsEl.appendChild(button);
  });
}

function renderPersonas() {
  personaGridEl.innerHTML = "";

  personas.forEach((persona) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "persona-card";
    button.dataset.platform = themeNameForPersona(persona);
    if (selectedPersona?.id === persona.id) {
      button.classList.add("is-active");
    }

    button.innerHTML = `
      <span class="persona-platform">${persona.platform}</span>
      <strong>${persona.name}</strong>
      <span>${persona.role}</span>
    `;

    button.addEventListener("click", () => {
      selectedPersona = persona;
      chatHistory = [];
      messagesEl.innerHTML = "";
      chatTitleEl.textContent = `${persona.name} Conversation`;
      addMessage(
        "assistant",
        `You're now talking with ${persona.name}. Ask a question, and I'll answer the way they would.`
      );
      setStatus("Persona mode is active.");
      applyTheme();
      renderPersonas();
      renderSuggestions();
    });

    personaGridEl.appendChild(button);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPath(values, width, height, maxValue) {
  const stepX = width / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildAreaPath(values, width, height, maxValue) {
  const linePath = buildPath(values, width, height, maxValue);
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

function renderJourneyCharts() {
  if (!journeyChartsEl) return;
  journeyChartsEl.innerHTML = "";

  if (!journeyGraph) return;

  const profiles = [journeyGraph.reid, journeyGraph.sheila].filter(Boolean);
  const maxValue = 10;
  const chartWidth = 520;
  const chartHeight = 180;
  const threshold = Number(journeyGraph.threshold || 5);
  const thresholdY = chartHeight - (threshold / maxValue) * chartHeight;

  profiles.forEach((profile) => {
    const values = profile.stages.map((stage) => Number(stage.value || 0));
    const areaPath = buildAreaPath(values, chartWidth, chartHeight, maxValue);
    const linePath = buildPath(values, chartWidth, chartHeight, maxValue);
    const stepX = chartWidth / Math.max(values.length - 1, 1);
    const stageColumns = profile.stages
      .map((stage, index) => {
        const left = index * stepX;
        const pointY = chartHeight - (Number(stage.value || 0) / maxValue) * chartHeight;
        const labelY = Math.max(pointY - 14, 14);
        return `
          <line x1="${left.toFixed(1)}" y1="0" x2="${left.toFixed(1)}" y2="${chartHeight}" class="graph-grid-line" />
          <circle cx="${left.toFixed(1)}" cy="${pointY.toFixed(1)}" r="5.5" fill="${profile.accent}" />
          <text x="${left.toFixed(1)}" y="${labelY.toFixed(1)}" class="graph-point-label">${escapeHtml(stage.note)}</text>
        `;
      })
      .join("");

    const stageLabels = profile.stages
      .map(
        (stage, index) => `
          <div class="graph-stage-pill">
            <span>Stage ${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(journeyStages[index] || stage.label)}</strong>
          </div>
        `
      )
      .join("");

    const infoRows = profile.stages
      .map(
        (stage, index) => `
          <div class="graph-stage-row">
            <span>Stage ${index + 1}</span>
            <strong>${escapeHtml(stage.note)}</strong>
          </div>
        `
      )
      .join("");

    const card = document.createElement("article");
    card.className = "journey-chart-card";
    card.innerHTML = `
      <div class="journey-card-header">
        <div>
          <p class="journey-card-kicker">${escapeHtml(profile.metric)} Curve</p>
          <h3>${escapeHtml(profile.display_name)}</h3>
          <p>${escapeHtml(profile.role)}</p>
        </div>
        <div class="journey-card-swatch" style="--swatch:${profile.accent}"></div>
      </div>
      <div class="graph-stage-strip">${stageLabels}</div>
      <div class="graph-shell">
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="journey-svg" role="img" aria-label="${escapeHtml(profile.display_name)} feeling graph">
          <defs>
            <linearGradient id="gradient-${escapeHtml(profile.display_name).replace(/\s+/g, "-")}" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="${profile.accent}" stop-opacity="0.45"></stop>
              <stop offset="100%" stop-color="${profile.accent}" stop-opacity="0.04"></stop>
            </linearGradient>
          </defs>
          <line x1="0" y1="${thresholdY.toFixed(1)}" x2="${chartWidth}" y2="${thresholdY.toFixed(1)}" class="graph-threshold" />
          ${stageColumns}
          <path d="${areaPath}" fill="url(#gradient-${escapeHtml(profile.display_name).replace(/\s+/g, "-")})"></path>
          <path d="${linePath}" fill="none" stroke="${profile.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <div class="graph-axis">
          <span>Low</span>
          <span>Threshold</span>
          <span>High</span>
        </div>
      </div>
      <div class="graph-detail-list">${infoRows}</div>
    `;

    journeyChartsEl.appendChild(card);
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.ok) {
      personas = Array.isArray(data.personas) ? data.personas : [];
      journeyGraph = data.journeyGraph || null;
      journeyStages = Array.isArray(data.journeyStages) ? data.journeyStages : [];
      applyTheme();
      renderPersonas();
      renderSuggestions();
      renderJourneyCharts();
      setStatus(
        data.hasApiKey
          ? "Ready for persona conversations."
          : "Free persona mode is active."
      );
    } else {
      setStatus("Server is running, but setup still needs attention.");
    }
  } catch (error) {
    setStatus("Unable to reach the server.");
  }
}

async function sendMessage(message) {
  if (isSending) return;
  isSending = true;

  addMessage("user", message);
  chatHistory.push({ role: "user", content: message });
  setStatus("Thinking...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        history: chatHistory,
        personaId: selectedPersona?.id || ""
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    addMessage("assistant", data.reply);
    chatHistory.push({ role: "assistant", content: data.reply });
    setStatus(selectedPersona ? `Talking with ${selectedPersona.name}.` : "Ready for questions.");
  } catch (error) {
    addMessage("assistant", `I hit a setup issue: ${error.message}`);
    setStatus("Setup issue detected.");
  } finally {
    isSending = false;
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = inputEl.value.trim();
  if (!message) return;
  inputEl.value = "";
  await sendMessage(message);
});

resetButton.addEventListener("click", () => {
  chatHistory = [];
  messagesEl.innerHTML = "";
  addMessage(
    "assistant",
    selectedPersona
      ? `Fresh chat started with ${selectedPersona.name}. Ask about goals, frustrations, habits, or why this platform fits them.`
      : "Fresh chat started. Pick a persona above, or ask about the overall project."
  );
  setStatus(selectedPersona ? `Talking with ${selectedPersona.name}.` : "Ready for questions.");
});

addMessage(
  "assistant",
  "Pick a persona above to start a first-person conversation, or ask about the overall project and journey map."
);
applyTheme();
checkHealth();
