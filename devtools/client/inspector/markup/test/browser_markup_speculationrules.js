/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that the markup view correctly displays speculation rules in script tags

const TEST_URL = URL_ROOT + "doc_markup_speculationrules.html";
add_task(async function testSpeculationRules() {
  await pushPref("dom.speculation_rules.enabled", true);

  const { inspector } = await openInspectorForURL(TEST_URL);

  await selectNode("script", inspector);
  const scriptContainer = await getContainerForSelector("script", inspector);

  info("Expand the script node to see the speculation rules content");
  await toggleContainerByClick(inspector, scriptContainer, { altKey: true });

  is(
    scriptContainer.elt.querySelector(".open .attreditor .attr-value")
      .textContent,
    "speculationrules",
    "Script tag should have type `speculationrules`"
  );

  is(
    scriptContainer.elt.querySelector("pre").innerHTML,
    `
  {
    "prefetch": [
      {
        "urls": [
          "doc_markup_speculationrules_subpage.html",
        ],
        "eagerness": "immediate"
      }
    ]
  }
  `,
    "The script tag content is correct"
  );
});
