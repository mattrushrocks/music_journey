const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#messageInput");
const statusEl = document.querySelector("#status");
const suggestionsEl = document.querySelector("#suggestions");
const resetButton = document.querySelector("#resetButton");
const template = document.querySelector("#messageTemplate");
const personaGridEl = document.querySelector("#personaGrid");
const chatTitleEl = document.querySelector("#chatTitle");

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
        `You're now talking with ${persona.name}, "${persona.role}." Ask a question and I'll answer in their voice based on the exhibit research.`
      );
      setStatus("Persona mode is active.");
      renderPersonas();
      renderSuggestions();
    });

    personaGridEl.appendChild(button);
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.ok) {
      personas = Array.isArray(data.personas) ? data.personas : [];
      renderPersonas();
      renderSuggestions();
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
checkHealth();
