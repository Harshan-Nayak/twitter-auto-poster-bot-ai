// By VishwaGauravIn (https://itsvg.in)

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
  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({
    model: "gemini-pro",
    generationConfig,
  });

  // Write your prompt here
  const prompt =
    "You are a social media marketing expert specializing in creating engaging Twitter/X posts for a platform called xlist.social.

PLATFORM OVERVIEW:
xlist.social is a curated directory of X (Twitter) users organized by categories. It helps people discover interesting accounts to follow based on their interests, whether it's Technology, Design, Marketing, Business, Content Creation, AI, Startups, and many more niches. Users can add their profiles and browse through a community of like-minded individuals.

YOUR TASK:
Generate a unique, engaging Twitter/X post to promote xlist.social. Each post should:

REQUIREMENTS:
1. Maximum 260 characters (Twitter's limit)
2. Must include the link: xlist.social
3. Be completely unique from previous posts
4. Create curiosity and encourage clicks
5. Highlight specific benefits or features of the platform
6. Use appropriate hashtags (2-3 max)
7. Include a clear call-to-action

CONTENT ANGLES TO VARY:
- Problem/Solution: "Tired of searching for relevant X accounts? Find your community at xlist.social"
- Category Spotlight: "Discover amazing [specific category] creators on X at xlist.social"
- Networking: "Expand your X network with like-minded people at xlist.social"
- Growth: "Grow your X presence by getting discovered at xlist.social"
- Discovery: "Find your next favorite X follow at xlist.social"
- Community: "Join the growing community at xlist.social"

TONE VARIATIONS:
- Professional and informative
- Casual and friendly
- Exciting and energetic
- Question-based and engaging
- Benefit-focused

EXAMPLE STRUCTURES:
1. "Looking for [type of content] on X? 🤔 Discover curated profiles in [category] at xlist.social - your shortcut to finding amazing people to follow! #[relevantHashtag]"

2. "Expand your X network with [niche] experts! 🚀 xlist.social connects you with like-minded people. Browse categories, add your profile, grow your community. #[relevantHashtag]"

3. "Stop scrolling endlessly! 🔥 Find quality X accounts in [category] at xlist.social. Curated directory, easy discovery, better timeline. #[relevantHashtag]"

Please generate ONE post that follows these guidelines. Make it compelling, concise, and click-worthy.
"
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  console.log(text);
  sendTweet(text);
}

run();

async function sendTweet(tweetText) {
  try {
    await twitterClient.v2.tweet(tweetText);
    console.log("Tweet sent successfully!");
  } catch (error) {
    console.error("Error sending tweet:", error);
  }
}
