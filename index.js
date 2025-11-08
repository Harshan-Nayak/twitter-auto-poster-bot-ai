// By VishwaGauravIn (https://itsvg.in)
// Robust extraction of text from Gemini responses to avoid tweeting "[object Object]"

const GenAI = require("@google/generative-ai");
const { TwitterApi } = require("twitter-api-v2");
const SECRETS = require("./SECRETS");

const twitterClient = new TwitterApi({
  appKey: SECRETS.APP_KEY,
  appSecret: SECRETS.APP_SECRET,
  accessToken: SECRETS.ACCESS_TOKEN,
  accessSecret: SECRETS.ACCESS_SECRET,
});

const generationConfig = {
  maxOutputTokens: 400,
};
const genAI = new GenAI.GoogleGenerativeAI(SECRETS.GEMINI_API_KEY);

function safeTrimTo280(s) {
  const cp = [...s];
  return cp.length > 280 ? cp.slice(0, 280).join("") : s;
}

function isUsableString(s) {
  return typeof s === "string" && s.trim().length > 0 && s !== "[object Object]";
}

function tryGet(obj, path) {
  try {
    return path.split(".").reduce((o, p) => (o && p in o ? o[p] : undefined), obj);
  } catch {
    return undefined;
  }
}

function deepFindFirstString(obj, visited = new WeakSet(), depth = 0) {
  if (depth > 6) return undefined;
  if (obj == null) return undefined;
  if (typeof obj === "string") {
    if (isUsableString(obj)) return obj;
    return undefined;
  }
  if (typeof obj !== "object") return undefined;
  if (visited.has(obj)) return undefined;
  visited.add(obj);

  // If it's an array, iterate elements
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const found = deepFindFirstString(el, visited, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  // Try common keys first in some order
  const commonKeys = ["text", "content", "parts", "outputs", "outputText", "message", "sections"];
  for (const key of commonKeys) {
    if (key in obj) {
      const found = deepFindFirstString(obj[key], visited, depth + 1);
      if (found) return found;
    }
  }

  // Otherwise iterate object properties
  for (const k of Object.keys(obj)) {
    const found = deepFindFirstString(obj[k], visited, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function extractTextFromCandidate(candidate) {
  // candidate might be a string, an object with content or many other shapes
  if (!candidate) return undefined;

  if (typeof candidate === "string") {
    if (isUsableString(candidate)) return { text: candidate, source: "candidate:string" };
    return undefined;
  }

  // Direct fields
  if (isUsableString(candidate.text)) return { text: candidate.text, source: "candidate.text" };
  if (isUsableString(candidate.content)) return { text: candidate.content, source: "candidate.content" };
  if (candidate.outputs && Array.isArray(candidate.outputs)) {
    const joined = candidate.outputs.map(o => (typeof o === "string" ? o : o?.text || o?.content)).filter(Boolean).join(" ");
    if (isUsableString(joined)) return { text: joined, source: "candidate.outputs" };
  }

  // If content is object, check common nested shapes
  const c = candidate.content || candidate;
  // message.content.parts (common in some SDKs)
  const parts = tryGet(c, "message.content.parts") || tryGet(c, "message.parts");
  if (Array.isArray(parts) && parts.length) {
    const joined = parts.filter(Boolean).map(p => (typeof p === "string" ? p : p?.text || p?.content)).filter(Boolean).join(" ");
    if (isUsableString(joined)) return { text: joined, source: "message.content.parts" };
  }

  // content.parts
  if (Array.isArray(c.parts)) {
    const joined = c.parts.map(p => (typeof p === "string" ? p : p?.text || p?.content)).filter(Boolean).join(" ");
    if (isUsableString(joined)) return { text: joined, source: "content.parts" };
  }

  // content.outputs (array)
  if (Array.isArray(c.outputs)) {
    const joined = c.outputs.map(o => (typeof o === "string" ? o : o?.text || o?.content)).filter(Boolean).join(" ");
    if (isUsableString(joined)) return { text: joined, source: "content.outputs" };
  }

  // outputText or output
  if (isUsableString(c.outputText)) return { text: c.outputText, source: "content.outputText" };
  if (isUsableString(c.output)) return { text: c.output, source: "content.output" };

  // sections array with text-like nodes
  if (Array.isArray(c.sections)) {
    const joined = c.sections.map(s => (typeof s === "string" ? s : s?.text || s?.content)).filter(Boolean).join(" ");
    if (isUsableString(joined)) return { text: joined, source: "content.sections" };
  }

  // Fall back to a deep search to find the first usable string
  const found = deepFindFirstString(c);
  if (found) return { text: found, source: "deepFindFirstString" };

  return undefined;
}

async function run() {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig,
    });

    const basePrompt =
      "Generate a single plain-text tweet about web development (tips, tricks, advice, or a short rant). Must be unique, specific, and under 280 characters. Output only the tweet text, no explanation. Emojis allowed.";

    console.log("Generation attempt 1...");
    const result = await model.generateContent(basePrompt);

    // Log the result object so you can inspect it next time
    try {
      console.log("Full generation result:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.log("Full generation result (unstringifiable):", result);
    }

    // Try to get the response object (some SDK shapes)
    let response;
    try {
      response = await result.response;
    } catch {
      response = result.response || result;
    }

    // candidates array is common
    const candidates = tryGet(response, "candidates") || tryGet(result, "candidates") || [];
    let extracted;
    if (Array.isArray(candidates) && candidates.length > 0) {
      // Try each candidate until we find usable text
      for (const cand of candidates) {
        const attempt = extractTextFromCandidate(cand);
        if (attempt && isUsableString(attempt.text)) {
          extracted = attempt;
          break;
        }
      }
    }

    // If still nothing, try top-level fields
    if (!extracted) {
      const topAttempt = extractTextFromCandidate(response) || extractTextFromCandidate(result);
      if (topAttempt) extracted = topAttempt;
    }

    if (!extracted || !isUsableString(extracted.text)) {
      console.error("No usable text could be extracted from the model response. Will not send a tweet.");
      return;
    }

    let tweetText = String(extracted.text).trim();
    tweetText = safeTrimTo280(tweetText);

    console.log(`Extracted tweet from ${extracted.source} (length ${[...tweetText].length}):`, tweetText);

    await sendTweet(tweetText);
  } catch (err) {
    console.error("Error in run():", err);
  }
}

async function sendTweet(tweetText) {
  try {
    if (!tweetText || !String(tweetText).trim()) {
      throw new Error("sendTweet called with empty text.");
    }
    const res = await twitterClient.v2.tweet({ text: tweetText });
    console.log("Tweet sent successfully! Response:", res);
  } catch (error) {
    console.error("Error sending tweet:", error);
  }
}

run();
