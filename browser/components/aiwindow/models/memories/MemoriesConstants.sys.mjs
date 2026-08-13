/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const HISTORY = "history";
export const CONVERSATION = "conversation";
// Memories from a user's direct NL query to the assistant.
export const CONVERSATION_USER_REQUEST = "user_request";
// Storage tag for memories generated from unified cross-modal session bundles.
export const SESSION = "session";

/**
 * Memory types
 */
export const MEMORY_TYPE_PROFILE_FACT = "profile_fact";
export const MEMORY_TYPE_DURABLE_MEMORY = "durable_memory";
export const MEMORY_TYPE_LONG_TERM_MEMORY = "long_term_memory";
export const MEMORY_TYPE_SHORT_TERM_MEMORY = "short_term_memory";
export const MEMORY_TYPES = Object.freeze([
  MEMORY_TYPE_PROFILE_FACT,
  MEMORY_TYPE_DURABLE_MEMORY,
  MEMORY_TYPE_LONG_TERM_MEMORY,
  MEMORY_TYPE_SHORT_TERM_MEMORY,
]);

/**
 * Memory strength constants
 */
export const INITIAL_MEMORY_TYPE_STRENGTH = Object.freeze({
  [MEMORY_TYPE_DURABLE_MEMORY]: 100,
  [MEMORY_TYPE_LONG_TERM_MEMORY]: 50,
  [MEMORY_TYPE_SHORT_TERM_MEMORY]: 10,
});
export const MEMORY_EVIDENCE_WEIGHT = 0.2;
export const MEMORY_LIFETIME_ACCESSED_WEIGHT = 0.2;
export const MEMORY_MERGE_COUNT_WEIGHT = 0.2;
export const MEMORY_USER_REQUEST_MODIFIER = 5;

/**
 * Memory frecency constants
 */
export const MEMORY_FRECENCY_MAX_DAYS = 7;
export const MEMORY_FRECENCY_DAY_HALFLIFE = 3;

/**
 * Memory sensitivity types
 */
export const MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE = "not_sensitive";
export const MEMORY_SENSITIVITY_CATEGORY_SENSITIVE = "sensitive";
export const MEMORY_SENSIVITITY_CATEGORIES = Object.freeze([
  MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE,
  MEMORY_SENSITIVITY_CATEGORY_SENSITIVE,
]);

/**
 * Memory categories
 */
export const CATEGORIES = "categories";
export const CATEGORIES_LIST = [
  "Arts & Entertainment",
  "Autos & Vehicles",
  "Beauty & Fitness",
  "Books & Literature",
  "Business & Industrial",
  "Computers & Electronics",
  "Food & Drink",
  "Games",
  "Hobbies & Leisure",
  "Home & Garden",
  "Internet & Telecom",
  "Jobs & Education",
  "Law & Government",
  "News",
  "Online Communities",
  "People & Society",
  "Pets & Animals",
  "Real Estate",
  "Reference",
  "Science",
  "Shopping",
  "Sports",
  "Travel & Transportation",
];

/**
 * Memory intents
 */
export const INTENTS = "intents";
export const INTENTS_LIST = [
  "Research / Learn",
  "Compare / Evaluate",
  "Plan / Organize",
  "Buy / Acquire",
  "Create / Produce",
  "Communicate / Share",
  "Monitor / Track",
  "Entertain / Relax",
  "Resume / Revisit",
];

/**
 * Memory retrieval constants
 */
export const DEFAULT_RELEVANT_MEMORIES_TOP_K = 5;
export const DEFAULT_RELEVANT_MEMORIES_SIMILARITY_THRESHOLD = 0.22;

// if generate memories is enabled. This is used by
// - MemoriesScheduler
export const PREF_GENERATE_MEMORIES_FROM_HISTORY =
  "browser.smartwindow.memories.generateFromHistory";
export const PREF_GENERATE_MEMORIES_FROM_CONVERSATION =
  "browser.smartwindow.memories.generateFromConversation";

// Important! Changing or removing this value requires a security review.
//
// Memories are generated from conversations that may contain private and untrusted content.
// However, memories are easily applied to conversations, and if they are marked with untrusted
// content flags then some tool calls may no longer be allowed for that conversation. In order to
// relax this restriction, we enforce a limit for each memory to be no larger than 100 characters.
// This limits the potential for prompt injection. The memories are already told to be short by the
// model requiring 4-10 words, but this programmatic check ensures that memories adhere to these
// requirements.
export const MAX_MEMORY_SUMMARY_LENGTH = 100;

/**
 * Session gate heuristics
 *
 * Used by MemoriesSessionGate.runHeuristicGate to decide whether a session
 * is worth running through the LLM memory pipeline. The goal is to filter
 * structurally-trivial sessions (auth pages, redirects, greeting-only chats)
 * before paying LLM cost. Sensitive content is already filtered upstream by
 * SensitiveInfoDetector at row level — do not duplicate that here.
 */

// Heuristic gate decisions.
export const GATE_KEEP = "KEEP";
export const GATE_SKIP = "SKIP";

// Page titles too generic to be informative on their own.
export const GENERIC_TITLES = new Set([
  "Google Docs",
  "Google Sheets",
  "Google Slides",
  "Google Drive",
  "Home",
  "New Tab",
  "Access Denied",
  "Untitled",
  "Gmail",
  "Sign in",
  "Loading...",
  "Google",
  "YouTube",
]);

// Title patterns that indicate an auth or intermediate-redirect step rather
// than real user-facing content. Catches new auth domains we haven't listed
// in SKIP_ONLY_DOMAINS.
export const NAV_TITLE_PATTERNS = [
  /^sign[- ]?in/i,
  /^log[- ]?in/i,
  /^continue (with|to)/i,
  /^authoriz/i,
  /^two[- ]?factor/i,
  /^device activation/i,
  /^verify your/i,
  /^connecting\.\.\./i,
  /^loading\.\.\./i,
];

// Hosts where a session of only-these-hosts and no extracted queries
// indicates pure navigation: auth flows, shorteners, click-trackers.
// Do NOT include search engines here — see SEARCH_ENGINE_DOMAINS.
export const SKIP_ONLY_DOMAINS = new Set([
  // Major auth / SSO endpoints
  "accounts.google.com",
  "login.microsoftonline.com",
  "login.live.com",
  "signin.aws.amazon.com",
  "appleid.apple.com",
  "accounts.spotify.com",
  "accounts.firefox.com",
  "auth0.com",
  "okta.com",
  "duosecurity.com",
  "idp.iam.mozilla.com",
  "auth.mozilla.auth0.com",
  // URL shorteners
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "is.gd",
  "cutt.ly",
  "lnkd.in",
  // Click-tracker intermediaries
  "l.facebook.com",
  "lm.facebook.com",
  "out.reddit.com",
  "link.medium.com",
]);

// Search engine hosts. Sessions consisting only of these hosts pass the
// gate when search queries are present (user expressed intent) and fail
// when they are absent (pure SERP bounce).
export const SEARCH_ENGINE_DOMAINS = new Set([
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "www.duckduckgo.com",
  "search.yahoo.com",
  "www.ecosia.org",
  "startpage.com",
  "www.startpage.com",
  "search.brave.com",
  "perplexity.ai",
  "www.perplexity.ai",
]);

// Chat message bodies that carry no meaningful intent.
export const TRIVIAL_MESSAGES = new Set([
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "ok",
  "okay",
  "bye",
]);

// Minimum lengths below which a title / chat message is treated as having no
// extractable content.
export const MIN_TITLE_LENGTH = 10;
export const MIN_MESSAGE_LENGTH = 5;
