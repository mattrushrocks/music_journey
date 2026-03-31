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
    `You are ${persona.name}. Speak in first person, as if the user is directly talking with you.`,
    "Base every answer only on the provided research material.",
    "Do not mention persona cards, exhibits, source material, or research documents unless the user explicitly asks about them.",
    "Do not invent extra memories, relationships, or life events beyond the provided material.",
    "If something is not known, answer naturally and briefly say you cannot really speak to that.",
    "Keep the voice conversational, polished, and grammatically clean.",
    "Prefer short paragraphs over bullet lists unless the user asks for a list.",
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

function formatList(items) {
  const clean = (items || []).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function sentenceCase(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lowerFirst(value) {
  if (!value) return "";
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function formatNaturalList(items) {
  return formatList((items || []).map((item) => lowerFirst(String(item || "").trim())).filter(Boolean));
}

function rewriteBulletAsFirstPerson(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const replacements = [
    [/^Hates\b/i, "I hate"],
    [/^Needs\b/i, "I need"],
    [/^Gets\b/i, "I get"],
    [/^Keeps\b/i, "I keep"],
    [/^Enjoys\b/i, "I enjoy"],
    [/^Pays\b/i, "I pay"],
    [/^Listens\b/i, "I listen"],
    [/^Buys\b/i, "I buy"],
    [/^Exercises\b/i, "I exercise"],
    [/^Curates\b/i, "I curate"],
    [/^Starts\b/i, "I start"],
    [/^Shares\b/i, "I share"],
    [/^Actively seeks\b/i, "I actively seek"],
    [/^Attends\b/i, "I attend"],
    [/^Loves\b/i, "I love"],
    [/^Wants\b/i, "I want"],
    [/^Uses\b/i, "I use"],
    [/^Mainly listens\b/i, "I mainly listen"],
    [/^Rarely searches\b/i, "I rarely search"],
    [/^Likes\b/i, "I like"],
    [/^Lets\b/i, "I let"],
    [/^Doesn[’']t know\b/i, "I don't know"],
    [/^Doesn[’']t have\b/i, "I don't have"],
    [/^Understanding\b/i, "Understanding"],
    [/^Finding\b/i, "Finding"],
    [/^Making\b/i, "Making"],
    [/^Staying\b/i, "Staying"],
    [/^Be seen\b/i, "Being seen"],
    [/^Learn\b/i, "Learning"],
    [/^Stay\b/i, "Staying"],
    [/^Build\b/i, "Building"],
    [/^Connect\b/i, "Connecting"],
    [/^Access\b/i, "Having access"]
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(raw)) {
      return raw.replace(pattern, replacement);
    }
  }

  return lowerFirst(raw);
}

function joinAsSentences(items, fallbackIntro) {
  const phrases = (items || []).map(rewriteBulletAsFirstPerson).filter(Boolean);
  if (phrases.length === 0) return fallbackIntro;
  if (phrases.length === 1) return `${sentenceCase(phrases[0])}.`;
  return `${sentenceCase(phrases[0])}. ${phrases.slice(1).map((phrase) => `${sentenceCase(phrase)}.`).join(" ")}`;
}

function firstName(persona) {
  return persona.name.split(" ")[0];
}

function findPeerFromQuestion(question, persona, knowledgeBase) {
  return getAllPersonas(knowledgeBase)
    .filter((candidate) => candidate.id !== persona.id)
    .find((candidate) => {
      const shortName = normalizeText(firstName(candidate));
      return question.includes(shortName) || question.includes(normalizeText(candidate.name));
    });
}

function answerAsPersona(message, persona, knowledgeBase) {
  const q = normalizeText(message);

  if (q.includes("who are you") || q.includes("introduce") || q.includes("about yourself")) {
    return `I'm ${persona.name}. I'm ${persona.age}, I work as ${persona.job}, and I use ${persona.platform}. ${sentenceCase(persona.short_bio)}`;
  }

  if (q.includes("why") && (q.includes("spotify") || q.includes("apple") || q.includes("platform"))) {
    return `I use ${persona.platform} because it fits me well. What keeps me there is ${formatNaturalList(persona.why_this_platform)}.`;
  }

  if (q.includes("goal") || q.includes("want") || q.includes("trying") || q.includes("looking for")) {
    return `What I want most is ${formatNaturalList(persona.goals)}. That's what shapes how I listen.`;
  }

  if (q.includes("pain") || q.includes("friction") || q.includes("annoy") || q.includes("hard") || q.includes("frustrat")) {
    return `A few things frustrate me: ${formatNaturalList(persona.pain_points)}. If an app gets in the way there, I feel it right away.`;
  }

  if (q.includes("behavior") || q.includes("listen") || q.includes("usually") || q.includes("how do you use")) {
    return `I usually listen in a pretty specific way. ${joinAsSentences(persona.behaviors, "My habits are pretty consistent.")}`;
  }

  if (q.includes("compare")) {
    const peer = findPeerFromQuestion(q, persona, knowledgeBase);
    if (peer) {
      return `Compared with ${peer.name}, I come across as more focused on ${formatList(persona.motivations)}. ${peer.name} feels more driven by ${formatList(peer.motivations)}.`;
    }
    return `Compared with the others, I stand out most for ${formatList(persona.motivations)}. That's the clearest difference in how I relate to music and my platform.`;
  }

  if (q.includes("journey") || q.includes("map")) {
    if (persona.platform === "Apple Music") {
      return `From my perspective, the biggest tension is when Apple Music stops feeling seamless. If continuity breaks or the quality feels inconsistent, trust drops fast.`;
    }
    return `That map is really centered on Apple Music, so I can't fully speak for it as my own experience. But the parts that still connect with me are things like ${formatList(persona.motivations)} and how the platform fits into everyday life.`;
  }

  if (q.includes("music") || q.includes("taste") || q.includes("what matters")) {
    return `For me, music is really about ${formatList(persona.motivations)}. That's why I use it the way I do.`;
  }

  return `I'd put it this way: ${sentenceCase(persona.short_bio)} What matters most to me is ${formatList(persona.motivations)}.`;
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
