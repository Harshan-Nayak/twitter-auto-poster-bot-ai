// By VishwaGauravIn (https://itsvg.in)
// Updated by GitHub Copilot (@copilot) - adds validation, trimming and debugging logs

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
    // For text-only input, use the gemini-pro model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig,
    });

    // Write your prompt here
    const prompt =
      "generate a web development content, tips and tricks or something new or some rant or some advice as a tweet, it should not be vague and should be unique; under 280 characters and should be plain text, you can use emojis";

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // The library code you're using returns text() — preserve that, but guard it
    let text = "";
    try {
      text = typeof response.text === "function" ? response.text() : String(response);
    } catch (e) {
      console.warn("Could not call response.text(); falling back to string conversion.", e);
      text = String(response);
    }

    // Debug: log the response object so you can inspect unexpected shapes
    console.log("Full model response (trimmed):", JSON.stringify(response, Object.keys(response).slice(0, 50), 2));
    // If response is large, you can print specific fields instead:
    // console.log("Response raw:", response);

    // Validate and normalize
    if (!text || !String(text).trim()) {
      console.error("Generated text is empty or only whitespace. Will not send an empty tweet.");
      console.error("Paste the full model response above and examine why it produced no text.");
      return;
    }

    // Trim whitespace
    text = String(text).trim();

    // Ensure tweet <= 280 characters. Use codepoint-aware trimming for emojis:
    const codePoints = [...text];
    let safeText = codePoints.length > 280 ? codePoints.slice(0, 280).join("") : text;
    if (safeText.length !== text.length) {
      console.warn("Generated text exceeded 280 characters — trimmed to fit Twitter's limit.");
    }

    console.log(`Prepared tweet (length ${[...safeText].length}):`, safeText);
    await sendTweet(safeText);
  } catch (err) {
    console.error("Error in run():", err);
  }
}

run();

async function sendTweet(tweetText) {
  try {
    if (!tweetText || !String(tweetText).trim()) {
      throw new Error("sendTweet was called with empty text.");
    }

    // twitter-api-v2 accepts a string or an object; using object makes it explicit:
    const res = await twitterClient.v2.tweet({ text: tweetText });
    console.log("Tweet sent successfully! Response:", res);
  } catch (error) {
    console.error("Error sending tweet:", error);
    // If this persists, paste the logged error and the earlier 'Full model response' above.
  }
}
