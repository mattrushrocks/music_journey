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

function slugifyPersonaName(name) {
  return normalizeText(name).replace(/\s+/g, "-");
}

function getAllPersonas(knowledgeBase) {
  return [
    ...knowledgeBase.personas.apple_music,
    ...knowledgeBase.personas.spotify
  ].map((persona) => ({
    ...persona,
    id: slugifyPersonaName(persona.name)
  }));
}

function buildPersonaInstructions(knowledgeBase, persona) {
  return [
    `You are roleplaying as ${persona.name}, whose persona card appears in a student research exhibit.`,
    `Speak in first person as ${persona.name}, but only using facts grounded in the persona and journey-map material.`,
    "Do not invent extra biography, memories, or experiences beyond the provided material.",
    "If asked something outside the persona card or journey map, say that the exhibit materials do not tell us that directly.",
    "Keep the tone natural, short, and conversational, like a visitor is talking to the persona at a gallery installation.",
    "Occasionally reference motivations, pain points, behaviors, and platform fit from the source material.",
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreText(haystack, needles) {
  const text = normalizeText(haystack);
  return needles.reduce((score, needle) => {
    if (!needle) return score;
    return text.includes(needle) ? score + 1 : score;
  }, 0);
}

function formatPersona(persona) {
  return [
    `${persona.name} (${persona.role_or_identity}, ${persona.platform})`,
    `Age: ${persona.age}`,
    `Job: ${persona.job}`,
    `Bio: ${persona.short_bio}`,
    `Goals: ${persona.goals.join("; ")}`,
    `Pain points: ${persona.pain_points.join("; ")}`,
    `Why this platform: ${persona.why_this_platform.join("; ")}`
  ].join("\n");
}

function answerAsPersona(message, persona, knowledgeBase) {
  const q = normalizeText(message);
  const replies = [];

  if (q.includes("who are you") || q.includes("introduce") || q.includes("about yourself")) {
    replies.push(
      `I'm ${persona.name}. I'm ${persona.age}, I work as ${persona.job}, and I use ${persona.platform}.`
    );
    replies.push(persona.short_bio);
  } else if (q.includes("why") && (q.includes("spotify") || q.includes("apple"))) {
    replies.push(`I stick with ${persona.platform} because ${persona.why_this_platform.join(", ").toLowerCase()}.`);
  } else if (q.includes("goal") || q.includes("want") || q.includes("trying")) {
    replies.push(`What I'm really looking for is ${persona.goals.join(", ").toLowerCase()}.`);
  } else if (q.includes("pain") || q.includes("friction") || q.includes("annoy") || q.includes("hard")) {
    replies.push(`What frustrates me most is ${persona.pain_points.join(", ").toLowerCase()}.`);
  } else if (q.includes("behavior") || q.includes("listen") || q.includes("use music") || q.includes("use spotify") || q.includes("use apple")) {
    replies.push(`The way I usually use it is pretty consistent: ${persona.behaviors.join(", ").toLowerCase()}.`);
  } else if (q.includes("compare")) {
    const peers = getAllPersonas(knowledgeBase).filter((candidate) => candidate.id !== slugifyPersonaName(persona.name));
    const peer = peers.find((candidate) => q.includes(normalizeText(candidate.name.split(" ")[0]))) || peers[0];
    replies.push(`Compared with ${peer.name}, I come across as more focused on ${persona.motivations[0].toLowerCase()} and ${persona.platform}.`);
    replies.push(`My card emphasizes ${persona.pain_points[0].toLowerCase()}, while ${peer.name}'s profile is more about ${peer.motivations[0].toLowerCase()}.`);
  } else if (q.includes("journey") || q.includes("map")) {
    if (persona.platform === "Apple Music") {
      replies.push(`From my point of view, the biggest Apple Music tension is around ${knowledgeBase.project.journey_map_overview.key_takeaways[3].toLowerCase()}.`);
      replies.push(`The exhibit also shows trust staying high when the system feels seamless and quality stays consistent.`);
    } else {
      replies.push("The journey map in this exhibit is specifically for Apple Music, so it isn't a direct map of my platform.");
      replies.push(`But my persona still connects to it through needs like ${persona.motivations.join(", ").toLowerCase()}.`);
    }
  } else {
    replies.push(`If I answered from my persona card, I'd say ${persona.short_bio.charAt(0).toLowerCase()}${persona.short_bio.slice(1)}`);
    replies.push(`What matters most to me is ${persona.motivations.join(", ").toLowerCase()}.`);
  }

  replies.push("I'm answering from the exhibit persona, so there are some things the project materials don't tell us directly.");
  return replies.join("\n\n");
}

function answerWithKnowledgeBase(message, knowledgeBase, personaId) {
  const q = normalizeText(message);
  const personas = getAllPersonas(knowledgeBase);

  if (personaId) {
    const persona = personas.find((candidate) => candidate.id === personaId);
    if (persona) {
      return answerAsPersona(message, persona, knowledgeBase);
    }
  }

  const namedPersona = personas.find((persona) =>
    q.includes(normalizeText(persona.name.split(" ")[0])) || q.includes(normalizeText(persona.name))
  );

  if (namedPersona) {
    return `${formatPersona(namedPersona)}\n\nIf you want, ask me to compare ${namedPersona.name.split(" ")[0]} with another persona.`;
  }

  if (q.includes("compare") || q.includes("difference") || q.includes("spotify") || q.includes("apple music")) {
    return [
      "Here’s the clearest comparison from your materials:",
      "",
      `Spotify personas: ${knowledgeBase.comparative_insights[0]}`,
      `Apple Music personas: ${knowledgeBase.comparative_insights[1]}`,
      knowledgeBase.comparative_insights[2],
      knowledgeBase.comparative_insights[3],
      knowledgeBase.comparative_insights[4]
    ].join("\n");
  }

  if (q.includes("journey") || q.includes("map") || q.includes("friction") || q.includes("stage")) {
    const topStages = knowledgeBase.project.journey_map_overview.stage_insights
      .filter((stage) => stage.frictions.length > 0)
      .slice(0, 4)
      .map((stage) => `- ${stage.stage}: ${stage.frictions.join("; ")}`)
      .join("\n");

    return [
      "The Apple Music journey map shows friction clustering around these moments:",
      topStages,
      "",
      "Big pattern: trust stays high when Apple Music feels seamless across devices and transparent about quality, but drops quickly when continuity or audio confidence breaks."
    ].join("\n");
  }

  if (q.includes("all personas") || q.includes("personas") || q.includes("who are")) {
    return [
      "The five personas in this project are:",
      ...personas.map((persona) => `- ${persona.name}: ${persona.role_or_identity} on ${persona.platform}`)
    ].join("\n");
  }

  const scored = personas
    .map((persona) => {
      const haystack = JSON.stringify(persona);
      return { persona, score: scoreText(haystack, q.split(" ")) };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 1) {
    return `${formatPersona(scored[0].persona)}\n\nThis seems like the closest match to your question based on the project material.`;
  }

  return [
    "I can answer from the five personas and the Apple Music journey map loaded into this project.",
    "Try asking something like:",
    "- Compare Apple Music and Spotify personas",
    "- Which persona cares most about audio quality?",
    "- Where does the journey map show the biggest friction?",
    "- Tell me about Franklin, Brayden, Brandon, Reid, or Sheila"
  ].join("\n");
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
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        personas: getAllPersonas(await loadKnowledgeBase()).map((persona) => ({
          id: persona.id,
          name: persona.name,
          role: persona.role_or_identity,
          platform: persona.platform
        }))
      });
    }

    if (request.method === "POST" && request.url === "/api/chat") {
      const body = await parseJsonBody(request);
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (!message) {
        return sendJson(request, response, 400, { error: "Message is required." });
      }

      const knowledgeBase = await loadKnowledgeBase();
      const personaId = typeof body.personaId === "string" ? body.personaId : "";
      let reply;

      if (process.env.OPENAI_API_KEY) {
        const persona = personaId
          ? getAllPersonas(knowledgeBase).find((candidate) => candidate.id === personaId)
          : null;
        const instructions = persona
          ? buildPersonaInstructions(knowledgeBase, persona)
          : buildInstructions(knowledgeBase);
        reply = await fetchOpenAIReply({
          instructions,
          history: body.history,
          message
        });
      } else {
        reply = answerWithKnowledgeBase(message, knowledgeBase, personaId);
      }

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
