/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { analyzeURL, SEARCH_CTA_ACTIONS, SEARCH_CTA_REASONS } =
  ChromeUtils.importESModule(
    "resource://gre/modules/URLKeywordAnalyzer.sys.mjs"
  );

function checkAnalyze(url, expected, options) {
  Assert.deepEqual(analyzeURL(url, options), expected, `analyzeURL(${url})`);
}

add_task(function test_blocked_hosts() {
  const blocked = [
    "http://192.168.1.1/status", // IPv4 literal
    "http://10.0.0.5/admin/login", // IPv4 literal
    "http://[::1]/dashboard", // IPv6 literal
    "http://localhost/wiki", // single-label host
    "http://intranet/home", // single-label host
    "http://db.internal/status", // reserved TLD (worked example)
    "http://foo.test/bar", // reserved TLD
    "http://service.local/api", // reserved TLD
    "https://example.invalid/x", // reserved TLD
  ];
  for (const url of blocked) {
    checkAnalyze(url, {
      action: SEARCH_CTA_ACTIONS.NONE,
      query: null,
      reason: SEARCH_CTA_REASONS.HOST_UNUSABLE,
    });
  }
});

// Path tokens first, in path order, then the host's tokens: the kept subdomain
// and the registrable label, never the public suffix.
add_task(function test_descriptive_path_includes_host_tokens() {
  checkAnalyze("https://shop.wildernessgear.com/mountain-hiking-boots", {
    action: SEARCH_CTA_ACTIONS.KEYWORDS,
    query: "mountain hiking boots shop wildernessgear",
    reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
  });
});

add_task(function test_www_is_stripped_from_host_tokens() {
  checkAnalyze("https://www.wildernessgear.com/tents", {
    action: SEARCH_CTA_ACTIONS.KEYWORDS,
    query: "tents wildernessgear",
    reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
  });
});

// Ten path tokens, capped at MAX_SEARCH_KEYWORDS (8), so the host's tokens are
// cut off entirely rather than displacing path tokens.
add_task(function test_keyword_query_is_capped() {
  checkAnalyze(
    "https://sub.wildernessgear.com/alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel-india-juliett",
    {
      action: SEARCH_CTA_ACTIONS.KEYWORDS,
      query: "alpha bravo charlie delta echo foxtrot golf hotel",
      reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
    }
  );
});

add_task(function test_empty_path_falls_back_to_registrable_domain() {
  for (const url of [
    "https://shop.wildernessgear.com/",
    "https://shop.wildernessgear.com",
  ]) {
    checkAnalyze(url, {
      action: SEARCH_CTA_ACTIONS.HOST,
      query: "wildernessgear.com",
      reason: SEARCH_CTA_REASONS.NO_PATH,
    });
  }
});

add_task(function test_opaque_path_falls_back_to_registrable_domain() {
  // A path with no letters yields no keywords (digits are stripped).
  checkAnalyze("https://shop.wildernessgear.com/12345/67890", {
    action: SEARCH_CTA_ACTIONS.HOST,
    query: "wildernessgear.com",
    reason: SEARCH_CTA_REASONS.NO_MEANINGFUL_KEYWORDS,
  });
});

// CountVectorizer removes digits before splitting, so an alphanumeric token
// keeps its letters rather than being dropped whole: "mp3" -> "mp" and
// "covid19" -> "covid". This documents the current tokenizer behavior.
add_task(function test_alphanumeric_tokens_strip_digits_in_place() {
  checkAnalyze("https://shop.wildernessgear.com/mp3-covid19-reviews", {
    action: SEARCH_CTA_ACTIONS.KEYWORDS,
    query: "mp covid reviews shop wildernessgear",
    reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
  });
});

// The secret in the query string and the fragment are both absent from the
// exact expected query, so neither can reach the search engine.
add_task(function test_query_string_and_fragment_never_tokenized() {
  checkAnalyze(
    "https://shop.wildernessgear.com/tents?token=supersecret#section-2",
    {
      action: SEARCH_CTA_ACTIONS.KEYWORDS,
      query: "tents shop wildernessgear",
      reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
    }
  );
});

add_task(function test_min_keywords_option() {
  // One path keyword clears the default threshold of 1...
  Assert.equal(
    analyzeURL("https://shop.wildernessgear.com/tents").action,
    SEARCH_CTA_ACTIONS.KEYWORDS
  );
  // ...but not a threshold of 2, which falls back to the host.
  checkAnalyze(
    "https://shop.wildernessgear.com/tents",
    {
      action: SEARCH_CTA_ACTIONS.HOST,
      query: "wildernessgear.com",
      reason: SEARCH_CTA_REASONS.NO_MEANINGFUL_KEYWORDS,
    },
    { minKeywords: 2 }
  );
});

add_task(function test_curated_stopwords_keep_content_words() {
  // Content words the shared ENGLISH_STOP_WORDS drops but our forked list keeps
  // (bug 2057648). Canary: if the fork ever re-stops these, this fails.
  const { query } = analyzeURL(
    "https://unstoptest.com/system-fire-interest-name-part"
  );
  const words = query.split(" ");
  for (const w of ["system", "fire", "interest", "name", "part"]) {
    Assert.ok(
      words.includes(w),
      `un-stopped content word survives: ${w} (${query})`
    );
  }
});

add_task(function test_common_stopwords_still_filtered() {
  // Our list must still behave as a stopword filter, not pass everything.
  const { query } = analyzeURL(
    "https://unstoptest.com/the-and-of-hiking-boots"
  );
  const words = query.split(" ");
  for (const w of ["the", "and", "of"]) {
    Assert.ok(!words.includes(w), `stopword dropped: ${w} (${query})`);
  }
  Assert.ok(
    words.includes("hiking") && words.includes("boots"),
    `content words kept: ${query}`
  );
});

add_task(function test_invalid_input() {
  for (const url of ["not a url", "", "://missing-scheme"]) {
    checkAnalyze(url, {
      action: SEARCH_CTA_ACTIONS.NONE,
      query: null,
      reason: SEARCH_CTA_REASONS.HOST_UNUSABLE,
    });
  }
});
