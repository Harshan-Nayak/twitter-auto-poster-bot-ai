// By VishwaGauravIn (https://itsvg.in)
// Updated: use only gemini-2.5-pro, retries, validation, and proper tweet payload.

const GenAI = require("@google/generative-ai");
const { TwitterApi } = require("twitter-api-v2");
const SECRETS = require("./SECRETS");

const twitterClient = new TwitterApi({
  appKey: SECRETS.APP_KEY,
  appSecret: SECRETS.APP_SECRET,
  accessToken: SECRETS.ACCESS_TOKEN,
  accessSecret: SECRETS.ACCESS_SECRET,
});

// enforce single model only
const MODEL_NAME = "gemini-2.5-pro";

const generationConfig = { maxOutputTokens: 400 };
const genAI = new GenAI.GoogleGenerativeAI(SECRETS.GEMINI_API_KEY);

// limits and retries
const GENERATION_ATTEMPTS = 3;
const TWEET_CHAR_LIMIT = 260;

// exact marketing prompt
 const prompt =
    "generate a web development content, tips and tricks or something new or some rant or some advice as a tweet, it should not be vague and should be unique; under 280 characters and should be plain text, you can use emojis";

// generate using only MODEL_NAME; retry if transient or empty
async function generateTweetText(prompt) {
  for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Generation attempt ${attempt} using model: ${MODEL_NAME}`);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig });
      const result = await model.generateContent(prompt);
      const response = await result.response;

      let text = "";
      if (response) {
        if (typeof response.text === "function") {
          text = response.text();
        } else if (response.output && Array.isArray(response.output) && response.output.length) {
          const first = response.output[0];
          if (first?.content && Array.isArray(first.content) && first.content.length) {
            text = first.content.map((c) => c?.text || "").join(" ").trim();
          } else {
            text = first?.text || "";
          }
        } else if (response?.candidates && Array.isArray(response.candidates) && response.candidates[0]) {
          text = response.candidates[0].content || response.candidates[0].text || "";
        } else {
          text = response?.text || response?.content || "";
        }
      }

      text = (text || "").trim();
      console.log(`[${new Date().toISOString()}] Generated length=${text.length}`);
      if (text && text.length > 0) return text;
      console.warn(`[${new Date().toISOString()}] Empty generation result from ${MODEL_NAME}, retrying...`);
    } catch (err) {
      // if model not found / not accessible, surface a clear message and stop retries
      const msg = err && err.message ? err.message : String(err);
      console.error(`[${new Date().toISOString()}] Generation error on attempt ${attempt}:`, msg);
      if (/not found|404|model.*not/i.test(msg)) {
        console.error(`[${new Date().toISOString()}] The model "${MODEL_NAME}" is not available to this API key or for generateContent. Please ensure your key/account has access to ${MODEL_NAME}.`);
        break; // don't retry a model-not-found error
      }
      // otherwise continue retrying for transient errors
    }
  }

  return ""; // failed to generate non-empty text
}

async function sendTweet(tweetText) {
  try {
    await twitterClient.v2.tweet({ text: tweetText });
    console.log(`[${new Date().toISOString()}] Tweet sent successfully!`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending tweet:`, error);
  }
}

async function run() {
  try {
    const raw = await generateTweetText(PROMPT);
    if (!raw || raw.trim().length === 0) {
      console.error(`[${new Date().toISOString()}] Generation failed or returned empty text. Aborting tweet.`);
      return;
    }

    // enforce max length and ensure xlist.social present
    let tweet = raw.trim();
    if (tweet.length > TWEET_CHAR_LIMIT) {
      console.warn(`[${new Date().toISOString()}] Trimming tweet from ${tweet.length} to ${TWEET_CHAR_LIMIT} chars.`);
      tweet = tweet.slice(0, TWEET_CHAR_LIMIT - 3).trim() + "...";
    }

    if (!tweet.includes("xlist.social")) {
      const append = " Read more at xlist.social";
      if (tweet.length + append.length <= TWEET_CHAR_LIMIT) {
        tweet = tweet + append;
      } else {
        tweet = tweet.slice(0, TWEET_CHAR_LIMIT - append.length - 1).trim() + "…" + append;
      }
      console.log(`[${new Date().toISOString()}] Appended CTA/link to tweet.`);
    }

    if (!tweet || tweet.trim().length === 0) {
      console.error(`[${new Date().toISOString()}] Final tweet empty after processing. Aborting.`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Final tweet (len=${tweet.length}):`, tweet);
    await sendTweet(tweet);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Unexpected error in run():`, err && err.message ? err.message : err);
  }
}

run();
