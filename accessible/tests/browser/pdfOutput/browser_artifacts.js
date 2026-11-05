/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests for content that must be marked as a PDF artifact rather than being
 * untagged content or associated with a node in the accessibility tree; e.g.
 * page headers and footers. Since artifacts aren't struct tree elements, this
 * can't be verified via getStructTree(). Instead, this walks the raw marked
 * content operators reported by getTextContent({includeMarkedContent: true}) to
 * check that the relevant content is wrapped in an Artifact tag.
 */

/**
 * Load `markup` as part of a PDF test task, export it and return the text
 * content items (including marked content) for its first page. If `testFont`
 * is true, the document uses pdfTest.ttf. See PDF_TEST_FONT_STYLE.
 */
async function getPdfArtifactItems(ctx, markup, { testFont = false } = {}) {
  await loadPdfTestDoc(ctx, testFont ? PDF_TEST_FONT_STYLE + markup : markup);
  const pdf = await exportPdf(ctx);
  if (testFont) {
    await assertPdfUsesTestFont(pdf);
  }
  const page = await pdf.getPage(1);
  return (await page.getTextContent({ includeMarkedContent: true })).items;
}

/**
 * Assert that among getTextContent's flat list of items, there's a top
 * level Artifact marked content sequence containing `text`, and that it
 * isn't associated with an MCID (since artifacts aren't struct tree
 * elements).
 */
function assertArtifactContains(items, text) {
  const msg = `"${text}" is wrapped in an Artifact tag`;
  let depth = 0;
  let artifactDepth = 0; // 0 means we aren't inside an Artifact.
  let id;
  let content = "";
  for (const item of items) {
    if (
      item.type == "beginMarkedContentProps" ||
      item.type == "beginMarkedContent"
    ) {
      // Marked content can be nested, so keep track of the depth so we know
      // when we've exited an Artifact.
      ++depth;
      if (artifactDepth == 0 && item.tag == "Artifact") {
        artifactDepth = depth;
        // Artifacts without a properties dict (e.g. a bare "Artifact BMC")
        // have no id property at all, rather than an id of null.
        id = item.id ?? null;
        content = "";
      }
    } else if (item.type == "endMarkedContent") {
      if (artifactDepth == depth) {
        // This is the end of the Artifact we've just walked.
        if (content.includes(text)) {
          ok(true, msg);
          is(id, null, `"${text}" Artifact isn't associated with an MCID`);
          return;
        }
        artifactDepth = 0;
      }
      --depth;
    } else if (artifactDepth && item.str !== undefined) {
      // The text in Artifacts can be split into multiple chunks.
      content += item.str;
    }
  }
  ok(false, msg);
}

const HEADER_TEXT = "PDFTESTHEADER";
const FOOTER_TEXT = "PDFTESTFOOTER";
addPdfTabTask(async function testHeaderFooter(ctx) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["print.print_headerleft", ""],
      ["print.print_headercenter", HEADER_TEXT],
      ["print.print_headerright", ""],
      ["print.print_footerleft", ""],
      ["print.print_footercenter", FOOTER_TEXT],
      ["print.print_footerright", ""],
    ],
  });
  const items = await getPdfArtifactItems(ctx, `<h1>content</h1>`);
  assertArtifactContains(items, HEADER_TEXT);
  assertArtifactContains(items, FOOTER_TEXT);
});

// Use pdfTest.ttf so that the square root sign is drawn with the same glyph
// regardless of which math fonts are installed.
addPdfTabTask(async function testMsqrt(ctx) {
  const items = await getPdfArtifactItems(
    ctx,
    `<math><msqrt><mn>4</mn></msqrt></math>`,
    { testFont: true }
  );
  assertArtifactContains(items, "√");
});

// Use pdfTest.ttf so that the longdiv sign is drawn with the same glyph
// regardless of which math fonts are installed.
addPdfTabTask(async function testMencloseLongdiv(ctx) {
  const items = await getPdfArtifactItems(
    ctx,
    `<math><menclose notation="longdiv"><mn>4</mn></menclose></math>`,
    { testFont: true }
  );
  assertArtifactContains(items, ")");
});
