/**
 * Channels where the bot is allowed to respond to mentions.
 *
 * Configured via the `ALLOWED_CHANNELS` env var as a comma-separated list of
 * channel names (with or without a leading `#`). Falls back to the office
 * defaults when unset so a missing env var doesn't break local dev.
 */
export const ALLOWED_CHANNELS = parseAllowedChannels(
  process.env.ALLOWED_CHANNELS,
);

function parseAllowedChannels(raw: string | undefined): Set<string> {
  const fallback = ["oslo-office-internal", "test-content-agent"];
  const list = raw
    ? raw
        .split(",")
        .map((entry) => entry.trim().replace(/^#/, ""))
        .filter(Boolean)
    : fallback;
  return new Set(list);
}

/**
 * Maximum prior messages to load from a thread when reconstructing context.
 *
 * Observational Memory compresses older history into dense observations
 * once the conversation crosses ~30k tokens, so we no longer pay a token
 * tax for long history and can pass the full thread. The cap is just a
 * safety net for pathological threads (1000+ replies); we don't want to
 * rebuild that much from Slack on every mention.
 */
export const HISTORY_LIMIT = 200;

/**
 * Pool of food/grocery-themed loading messages. We sample up to 10 of these
 * for each agent invocation; Slack rotates through them as a thinking
 * indicator until our first reply lands. Keep them on-brand: dry, lightly
 * snarky, food-adjacent.
 */
export const LOADING_MESSAGE_POOL = [
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
  "Sniffing the melon for ripeness…",
  "Asking grandma if it's a good deal…",
  "Checking the use-by date twice…",
  "Polishing the apples…",
  "Folding the receipts…",
  "Wrestling the shopping cart…",
  "Translating from grocery Norwegian…",
  "Sorting the bananas by ripeness…",
  "Looking for the secret salt aisle…",
  "Tasting the air for cheap pasta…",
  "Pretending to read the ingredients list…",
  "Untangling the produce bags…",
  "Whispering to the brunost…",
  "Practicing my matpakke skills…",
  "Doing math on the bottle deposit…",
  "Avoiding the lutefisk aisle…",
  "Memorizing the discount stickers…",
  "Listening for the kjempålit angle…",
  "Tasting test… for science…",
  "Calling Tine for a second opinion…",
];

/** Slack hard cap on loading_messages array. */
export const LOADING_MESSAGE_LIMIT = 10;
