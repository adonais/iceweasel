/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { findCandidates } = ChromeUtils.importESModule(
  "moz-src:///browser/components/tabnotes/CanonicalURL.sys.mjs"
);

/**
 * @param {string[]} scripts
 * @returns {Document}
 */
function getDocument(scripts) {
  const scriptTags = scripts
    .map(content => `<script type="application/ld+json">${content}</script>`)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  ${scriptTags}
</body>
</html>
`;
  return Document.parseHTMLUnsafe(html);
}

add_task(async function test_json_ld_missing() {
  const doc = getDocument([]);

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.jsonLd,
    undefined,
    `JSON-LD data should not be found`
  );
});

add_task(async function test_json_ld_basic() {
  const doc = getDocument([
    JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "Thing",
      url: "https://www.example.com",
    }),
  ]);

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.jsonLd,
    "https://www.example.com",
    `JSON-LD data should be found`
  );
});

add_task(async function test_json_ld_selects_first() {
  const doc = getDocument([
    JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "Thing",
      url: "https://www.example.com/1",
    }),
    JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "CreativeWork",
      url: "https://www.example.com/2",
    }),
    JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "WebPage",
      url: "https://www.example.com/3",
    }),
  ]);

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.jsonLd,
    "https://www.example.com/1",
    `the first JSON-LD data should be preferred`
  );
});

add_task(async function test_json_ld_robust_to_url_array() {
  const doc = getDocument([
    JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "SiteMap",
      url: [
        "https://www.example.com/1",
        "https://www.example.com/2",
        "https://www.example.com/3",
      ],
    }),
  ]);

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.jsonLd,
    undefined,
    `when url is an array, the JSON-LD data should not be used`
  );
});
