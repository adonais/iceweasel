/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * @import { BrowserTestUtils } from "../../../../../testing/mochitest/BrowserTestUtils/BrowserTestUtils.sys.mjs"
 * @import { PageExtractorParent } from "../../PageExtractorParent.sys.mjs"
 */

add_task(async function test_dom_extractor() {
  const { actor, cleanup } = await html`
    <article>
      <h1>Hello World</h1>
      <p>This is a paragraph</p>
    </article>
  `;

  is(
    await actor.getText(),
    ["Hello World", "This is a paragraph"].join("\n"),
    "Text can be extracted from the page."
  );

  is(
    await actor.getReaderModeContent(true /* force */),
    "Hello World\nThis is a paragraph",
    "Reader mode can extract page content."
  );

  is(
    await actor.getReaderModeContent(),
    null,
    "Nothing is returned on non-reader mode content."
  );
  return cleanup();
});
