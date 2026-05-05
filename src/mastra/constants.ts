/** Channels where the bot is allowed to respond to mentions. */
export const ALLOWED_CHANNELS = new Set([
  "oslo-office-internal",
  "test-content-agent",
]);

/** Maximum prior messages to load from a thread when reconstructing context. */
export const HISTORY_LIMIT = 20;

/** Slack user-mention syntax, e.g. `<@U0AGNB12B9V>`. */
export const MENTION_PATTERN = /<@[A-Z0-9]+>/g;

/**
 * Loading messages Slack rotates through under the bot's thinking indicator.
 * Max 10 entries (Slack hard cap). Keep them on-brand: dry, food-adjacent,
 * a little snarky. Slack auto-clears when we post the reply.
 */
export const LOADING_MESSAGES = [
  "Squeezing the oranges…",
  "Asking the cheese for an opinion…",
  "Counting the bananas…",
  "Stirring the gryte…",
  "Bribing the office goldfish for a tip…",
  "Checking the fridge twice…",
  "Finding the good kaffe…",
  "Comparing kr per liter…",
  "Negotiating with the bakery…",
  "Reading the back of the box…",
];
