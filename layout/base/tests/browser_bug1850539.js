/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that anonymous content inserted via insertAnonymousContent gets a
// frame (and thus a non-empty layout rect) when the document is an SVG
// document. The DevTools highlighters rely on this. See bug 1850539.

const SVG_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'>` +
      `<rect x='10' y='10' width='100' height='100' fill='purple'/>` +
      `</svg>`
  );

async function doTest() {
  function waitForFrame() {
    return new Promise(r => {
      content.requestAnimationFrame(() => {
        content.requestAnimationFrame(r);
      });
    });
  }

  await waitForFrame();

  {
    let children = InspectorUtils.getChildrenForNode(
      content.document,
      true,
      true
    );
    is(children.length, 1, "Shouldn't have existing anon content (document)");
  }

  {
    let children = InspectorUtils.getChildrenForNode(
      content.document.documentElement,
      true,
      true
    ).filter(n => !["scrollbar", "scrollcorner"].includes(n.tagName));
    is(
      children.length,
      1,
      "Shouldn't have existing anon content (documentElement)"
    );
  }

  let ac = content.document.insertAnonymousContent();
  ac.root.innerHTML = `<div style="position: absolute; width: 50px; height: 30px;">anonymous content</div>`;

  let div = ac.root.querySelector("div");
  let rect = div.getBoundingClientRect();
  Assert.greater(
    rect.width,
    0,
    "Anonymous content in an SVG document should have a non-zero width"
  );
  Assert.greater(
    rect.height,
    0,
    "Anonymous content in an SVG document should have a non-zero height"
  );

  content.document.removeAnonymousContent(ac);
}

add_task(async function () {
  // AccessibleCaret inserts anonymous content into the document too early to
  // reproduce this.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["layout.accessiblecaret.enabled", false],
      ["layout.accessiblecaret.enabled_on_touch", false],
    ],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: SVG_DATA_URI },
    async function (browser) {
      await SpecialPowers.spawn(browser, [], doTest);
    }
  );
});
