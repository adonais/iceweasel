/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URI = URL_ROOT_SSL + "doc_media_queries.html";

add_task(async function () {
  await addTab(TEST_URI);
  const { inspector, view } = await openRuleView();

  info("Open the emulation panel");
  await openEmulationPanel(view);

  const mdnLinks = [
    {
      selector: "#emulation-print-heading",
      expectedPath: "/docs/Web/CSS/Reference/At-rules/@media",
    },
    {
      selector: "#emulation-color-scheme-heading",
      expectedPath: "/docs/Web/CSS/@media/prefers-color-scheme",
    },
    {
      selector: "#emulation-reduced-motion-heading",
      expectedPath: "/docs/Web/CSS/@media/prefers-reduced-motion",
    },
  ];

  for (const { selector, expectedPath } of mdnLinks) {
    const linkEl = inspector.panelDoc.querySelector(selector);
    ok(linkEl, `The ${selector} heading exists`);

    info(`Check that ${selector} opens the expected MDN page`);

    const expectedUrl = new URL(`https://developer.mozilla.org${expectedPath}`);
    expectedUrl.searchParams.set("utm_source", "devtools");
    expectedUrl.searchParams.set("utm_medium", "inspector-emulation");
    expectedUrl.searchParams.set("utm_campaign", "default");

    const { link } = await simulateLinkClick(linkEl);

    is(
      link,
      expectedUrl.href,
      `The ${selector} heading points to the expected MDN URL`
    );
  }
});
