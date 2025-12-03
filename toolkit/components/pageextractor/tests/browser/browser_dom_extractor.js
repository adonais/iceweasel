/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * @import { BrowserTestUtils } from "../../../../../testing/mochitest/BrowserTestUtils/BrowserTestUtils.sys.mjs"
 * @import { PageExtractorParent } from "../../PageExtractorParent.sys.mjs"
 */

add_task(async function test_dom_extractor_default_options() {
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

add_task(async function test_dom_extractor_sufficient_length_option() {
  const { actor, cleanup } = await html`
    <article>
      <h1>Hello World</h1>
      <p>First paragraph.</p>
      <p>Second paragraph.</p>
    </article>
  `;

  const header = "Hello World";
  const headerAndP1 = ["Hello World", "First paragraph."].join("\n");
  const allText = ["Hello World", "First paragraph.", "Second paragraph."].join(
    "\n"
  );

  is(
    await actor.getText(),
    allText,
    "All text is returned with the default options."
  );

  const max = allText.length + 1;
  const expectations = [
    [length => length === 0, ""],
    [length => length > 0 && length <= 12, header],
    [length => length > 12 && length <= 29, headerAndP1],
    [length => length > 29 && length <= max, allText],
  ];

  for (let sufficientLength = 0; sufficientLength <= max; ++sufficientLength) {
    let expectedValue;

    for (const [predicate, value] of expectations) {
      if (predicate(sufficientLength)) {
        expectedValue = value;
      }
    }

    is(
      await actor.getText({ sufficientLength }),
      expectedValue,
      `The text, given sufficientLength of ${sufficientLength}, matches the expectation.`
    );
  }

  return cleanup();
});

add_task(
  async function test_dom_extractor_ignores_hidden_and_collapsed_nodes() {
    const { actor, cleanup } = await html`
      <article>
        <!-- Visible header -->
        <h1>Visible Title</h1>

        <!-- Visible paragraph -->
        <p>Visible paragraph</p>

        <!-- Hidden via the [hidden] attribute -->
        <p hidden>Hidden via [hidden]</p>

        <!-- Hidden via display:none -->
        <p style="display:none">Hidden via display:none</p>

        <!-- Hidden via visibility:hidden -->
        <p style="visibility:hidden">Hidden via visibility:hidden</p>

        <!-- Hidden via opacity:0 -->
        <p style="opacity:0">Hidden via opacity:0</p>

        <!-- Hidden via zero-sized block container -->
        <div style="width:0; height:0; overflow:hidden">
          <span>Inline text within zero-sized block container</span>
        </div>

        <!-- Hidden via zero-width block container (non-zero height only) -->
        <div style="width:0; height:16px; overflow:hidden">
          <span>Inline text within zero-width (height>0) block container</span>
        </div>

        <!-- Hidden via zero-height block container (non-zero width only) -->
        <div style="width:16px; height:0; overflow:hidden">
          <span>Inline text within zero-height (width>0) block container</span>
        </div>

        <!-- Visible block within hidden inline container -->
        <span style="width:0; height:0; overflow:hidden">
          <div>Block text within zero-sized inline container</div>
        </span>

        <!-- Hidden block container with inline descendant -->
        <div hidden>
          Hidden container outer text
          <span>Hidden container inner text</span>
        </div>

        <!-- Visible block container with hidden inline descendant -->
        <div>
          Visible container outer text (hidden descendant)
          <span hidden>Hidden child text in visible container</span>
        </div>

        <!-- Hidden inline container with block descendant -->
        <span hidden>
          Hidden inline outer text
          <div>Hidden inline inner text</div>
        </span>

        <!-- Visible inline container with hidden block descendant -->
        <span>
          Visible inline outer text (hidden descendant)
          <div hidden>Hidden block descendant text</div>
        </span>

        <!-- Collapsed <details> with <summary> still visible -->
        <details>
          <summary>Summary is visible</summary>
          <div>Hidden inside closed details</div>
          Text node directly under closed details (hidden)
        </details>
      </article>
    `;

    const expected = [
      "Visible Title",
      "Visible paragraph",
      "Block text within zero-sized inline container",
      "Visible container outer text (hidden descendant)",
      "Visible inline outer text (hidden descendant)",
      "Summary is visible",
    ].join("\n");

    is(
      await actor.getText(),
      expected,
      "The extractor returns only visible text."
    );

    return cleanup();
  }
);
