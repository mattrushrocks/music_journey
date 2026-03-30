const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#messageInput");
const statusEl = document.querySelector("#status");
const suggestionsEl = document.querySelector("#suggestions");
const resetButton = document.querySelector("#resetButton");
const template = document.querySelector("#messageTemplate");

const seedQuestions = [
  "What are the biggest differences between the Apple Music and Spotify personas?",
  "Which persona had the most onboarding friction?",
  "What design opportunities came out of the journey map?",
  "Summarize the Apple Music personas for me.",
  "What patterns showed up across both platforms?"
];

let chatHistory = [];
let isSending = false;

function addMessage(role, text) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const roleEl = fragment.querySelector(".message-role");
  const bodyEl = fragment.querySelector(".message-body");

  article.classList.add(role);
  roleEl.textContent = role === "assistant" ? "Project Agent" : "You";
  bodyEl.textContent = text;
  messagesEl.appendChild(fragment);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderSuggestions() {
  seedQuestions.forEach((question) => {
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

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.ok) {
      setStatus(data.hasApiKey ? "Ready for questions." : "Add OPENAI_API_KEY to enable live answers.");
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
        history: chatHistory
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    addMessage("assistant", data.reply);
    chatHistory.push({ role: "assistant", content: data.reply });
    setStatus("Ready for questions.");
  } catch (error) {
    addMessage(
      "assistant",
      `I hit a setup issue: ${error.message} Check the README and confirm your API key is set.`
    );
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
    "Fresh chat started. Ask me about personas, pain points, comparisons, or what your journey map reveals."
  );
  setStatus("Ready for questions.");
});

renderSuggestions();
addMessage(
  "assistant",
  "Ask me anything about the Apple Music and Spotify personas, your assignments, or the journey map."
);
checkHealth();
