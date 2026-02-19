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
  ${url ? `<link rel="canonical" href="${url}">` : ""}
</head>
<body>
</body>
</html>
`;
  return Document.parseHTMLUnsafe(html);
}

add_task(async function test_link_rel_canonical_missing() {
  const doc = getDocument();

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.link,
    undefined,
    `link[rel="canonical"] should not be found`
  );
});

add_task(async function test_link_rel_canonical_present() {
  const doc = getDocument("https://www.example.com");

  const candidates = findCandidates(doc);

  Assert.equal(
    candidates.link,
    "https://www.example.com",
    `link[rel="canonical"] should be found`
  );
});
