import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const knowledgePath = join(__dirname, "data", "knowledge-base.json");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function loadEnvFile() {
  try {
    const raw = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function sendJson(request, response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

async function parseJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function loadKnowledgeBase() {
  const raw = await readFile(knowledgePath, "utf8");
  return JSON.parse(raw);
}

function buildInstructions(knowledgeBase) {
  return [
    "You are a warm, concise museum-style project companion for a student research exhibit.",
    "Answer questions using only the provided project material.",
    "If the answer is not in the project material, say that clearly and suggest the closest useful follow-up.",
    "When comparing Apple Music and Spotify, call out concrete differences from the source material.",
    "Avoid pretending to know unpublished team intent.",
    "Keep answers clear for first-time readers encountering the printed journey map through a QR code.",
    "",
    "PROJECT MATERIAL:",
    JSON.stringify(knowledgeBase, null, 2)
  ].join("\n");
}

function toInputItems(history, message) {
  const trimmedHistory = Array.isArray(history) ? history.slice(-10) : [];
  const historyItems = trimmedHistory
    .filter((item) => item && typeof item.content === "string" && typeof item.role === "string")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: item.content }]
    }));

  historyItems.push({
    role: "user",
    content: [{ type: "input_text", text: message }]
  });

  return historyItems;
}

async function fetchOpenAIReply({ instructions, history, message }) {
  const openaiApiKey = process.env.OPENAI_API_KEY || "";
  const openaiModel = process.env.OPENAI_MODEL || "gpt-5-mini";

  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      instructions,
      input: toInputItems(history, message),
      text: {
        verbosity: "medium"
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const apiMessage = data?.error?.message || "OpenAI API request failed.";
    throw new Error(apiMessage);
  }

  const outputText = data.output_text?.trim();
  if (outputText) {
    return outputText;
  }

  throw new Error("The model returned an empty response.");
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, cleanPath);

  try {
    const content = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(content);
  } catch (error) {
    sendJson(request, response, 404, { error: "Not found" });
  }
}

await loadEnvFile();

const PORT = Number(process.env.PORT || 3000);

const server = createServer(async (request, response) => {
  try {
    if ((request.method === "GET" || request.method === "HEAD") && request.url === "/api/health") {
      return sendJson(request, response, 200, {
        ok: true,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || "gpt-5-mini"
      });
    }

    if (request.method === "POST" && request.url === "/api/chat") {
      const body = await parseJsonBody(request);
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (!message) {
        return sendJson(request, response, 400, { error: "Message is required." });
      }

      const knowledgeBase = await loadKnowledgeBase();
      const instructions = buildInstructions(knowledgeBase);
      const reply = await fetchOpenAIReply({
        instructions,
        history: body.history,
        message
      });

      return sendJson(request, response, 200, { reply });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return serveStatic(request, response);
    }

    sendJson(request, response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(request, response, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Music research agent running at http://localhost:${PORT}`);
});
