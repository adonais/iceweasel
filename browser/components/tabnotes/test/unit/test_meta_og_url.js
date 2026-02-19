/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { findCandidates } = ChromeUtils.importESModule(
  "moz-src:///browser/components/tabnotes/CanonicalURL.sys.mjs"
);

/**
 * @param {string|undefined} [url]
 * @returns {Document}
 */
function getDocument(url) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${url ? `<meta property="og:url" content="${url}">` : ""}
</head>
<body>
</body>
</html>
`;
  return Document.parseHTMLUnsafe(html);
}

add_task(async function test_meta_og_url_missing() {
  const doc = getDocument();

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.opengraph,
    undefined,
    `meta[property="og:url"] should not be found`
  );
});

add_task(async function test_meta_og_url_present() {
  const doc = getDocument("https://www.example.com");

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.opengraph,
    "https://www.example.com",
    `meta[property="og:url"] should be found`
  );
});
