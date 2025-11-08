// By VishwaGauravIn (https://itsvg.in)
// Robust extraction, logging and retry when model returns empty candidates

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

async function run() {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig,
    });

    // Primary prompt
    const basePrompt =
      "Generate a single plain-text tweet about web development (tips, tricks, advice, or a short rant). Must be unique, specific, and under 280 characters. Output only the tweet text, no explanation. Emojis allowed.";

    const maxRetries = 2;
    let tweetText = "";

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      console.log(`Generation attempt ${attempt}...`);
      const result = await model.generateContent(basePrompt);
      // log entire result for debugging
      try {
        console.log("Full generation result:", JSON.stringify(result, null, 2));
      } catch (e) {
        console.log("Full generation result unavailable to stringify; logging shallowly:", result);
      }

      // The SDK returns a response object; try multiple extraction methods
      let response;
      try {
        response = await result.response; // as you had before
      } catch (e) {
        response = result; // fallback if shape differs
      }

      // Try response.text() if available
      let text = "";
      try {
        if (response && typeof response.text === "function") {
          text = response.text();
        }
      } catch (e) {
        // ignore
      }

      // If still empty, try common fields on the response or result
      const tryGet = (obj, path) => {
        try {
          return path.split(".").reduce((o, p) => (o && p in o ? o[p] : undefined), obj);
        } catch {
          return undefined;
        }
      };

      if (!text || !String(text).trim()) {
        // Check response.candidates array
        const cand = tryGet(response, "candidates") || tryGet(result, "candidates");
        if (Array.isArray(cand) && cand.length > 0) {
          // try multiple candidate fields
          const c = cand[0] || {};
          text =
            text ||
            c.output ||
            c.outputs?.map(o => o?.content || o?.text).filter(Boolean).join(" ") ||
            c.content ||
            c.text ||
            c.string ||
            c.message ||
            "";
        }
      }

      if (!text || !String(text).trim()) {
        // try other common fields
        text =
          text ||
          tryGet(response, "outputText") ||
          tryGet(response, "output") ||
          tryGet(result, "outputText") ||
          tryGet(result, "output") ||
          "";
      }

      if (text && String(text).trim()) {
        // Normalize and trim to 280 code points
        text = String(text).trim();
        const codePoints = [...text];
        if (codePoints.length > 280) {
          text = codePoints.slice(0, 280).join("");
          console.warn("Generated text exceeded 280 characters and was trimmed.");
        }
        tweetText = text;
        console.log(`Extracted tweet (length ${[...tweetText].length}):`, tweetText);
        break;
      } else {
        console.warn("Generation produced no usable text on attempt", attempt);
        // If not last attempt, modify prompt slightly and retry
        if (attempt <= maxRetries) {
          console.log("Retrying with stronger instruction to output only tweet text...");
          // tighten the prompt to encourage a plain tweet response
          basePrompt =
            "Output only a single plain-text tweet (no explanation). Keep it <=280 characters. Topic: web development tips or advice. Use emojis if desired.";
        }
      }
    }

    if (!tweetText) {
      console.error(
        "All generation attempts returned empty candidates or no text. Will NOT send a tweet."
      );
      return;
    }

    await sendTweet(tweetText);
  } catch (err) {
    console.error("Error in run():", err);
  }
}

run();

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
