/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Basic rendering + markdown/sanitization test for <ai-chat-message>.
 *
 * Notes:
 * - Uses a content-side readiness gate (readyState polling) instead of
 *   BrowserTestUtils.browserLoaded to avoid missing the load event.
 * - Avoids Lit's updateComplete because MozLitElement variants may not expose it
 *   or it may never resolve in this harness.
 */
add_task(async function test_ai_chat_message_rendering() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    // Wait for content to be fully loaded
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }
    });

    await SpecialPowers.spawn(browser, [], async () => {
      const doc = content.document;

      function sleep(ms) {
        return new content.Promise(resolve => content.setTimeout(resolve, ms));
      }

      async function withTimeout(promise, ms, label) {
        return content.Promise.race([
          promise,
          new content.Promise((_, reject) =>
            content.setTimeout(
              () => reject(new Error(`Timeout (${ms}ms): ${label}`)),
              ms
            )
          ),
        ]);
      }

      async function waitFor(fn, msg, maxTicks = 200) {
        for (let i = 0; i < maxTicks; i++) {
          try {
            if (fn()) {
              return;
            }
          } catch (_) {
            // Keep looping; DOM may not be ready yet.
          }
          await sleep(0);
        }
        throw new Error(`Timed out waiting: ${msg}`);
      }

      function root(el) {
        return el.shadowRoot ?? el;
      }

      function setRoleAndMessage(el, role, message) {
        // `role` reflects to `data-message-role` (the `role` attribute is the
        // native ARIA role and collides with Element.prototype.role), so drive
        // it via that attribute rather than the `role` property/attribute.
        el.setAttribute("data-message-role", role);

        el.message = message;
        el.setAttribute("message", message);
      }

      // Ensure the custom element is registered. If the module failed to load,
      // this will fail fast instead of hanging until harness teardown.
      await withTimeout(
        content.customElements.whenDefined("ai-chat-message"),
        5000,
        "customElements.whenDefined('ai-chat-message')"
      );

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      Assert.ok(el, "ai-chat-message element should be created");

      // --- User message ---
      setRoleAndMessage(el, "user", "Test user message");

      await waitFor(() => {
        const div = root(el).querySelector(".message-user");
        return div && div.textContent.includes("Test user message");
      }, "User message should render with expected text");

      const userDiv = root(el).querySelector(".message-user");
      Assert.ok(userDiv, "User message div should exist");
      Assert.ok(
        userDiv.textContent.includes("Test user message"),
        `User message content should be present (got: "${userDiv.textContent}")`
      );

      // --- Assistant message ---
      setRoleAndMessage(el, "assistant", "Test AI response");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return div && div.textContent.includes("Test AI response");
      }, "Assistant message should render with expected text");

      let assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(assistantDiv, "Assistant message div should exist");
      Assert.ok(
        assistantDiv.textContent.includes("Test AI response"),
        `Assistant message content should be present (got: "${assistantDiv.textContent}")`
      );

      // --- Markdown parsing (positive) ---
      // Verifies that markdown like "**Bold** and *italic*" becomes markup
      // (<strong> and <em> elements) rather than literal asterisks.
      setRoleAndMessage(el, "assistant", "**Bold** and *italic* text");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return div && div.querySelector("strong") && div.querySelector("em");
      }, "Markdown should produce <strong> and <em>");

      assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(
        assistantDiv.querySelector("strong"),
        `Expected <strong> in: ${assistantDiv.innerHTML}`
      );
      Assert.ok(
        assistantDiv.querySelector("em"),
        `Expected <em> in: ${assistantDiv.innerHTML}`
      );

      // --- Negative: raw HTML should not become markup ---
      // Verifies sanitization / safe rendering: raw HTML should not be
      // interpreted as elements, but should remain visible as text.
      setRoleAndMessage(el, "assistant", "<b>not bolded</b>");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return (
          div &&
          !div.querySelector("b") &&
          div.textContent.includes("not bolded")
        );
      }, "Raw HTML should not become a <b> element, but text should remain");

      assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(
        !assistantDiv.querySelector("b"),
        `Should not contain real <b>: ${assistantDiv.innerHTML}`
      );
      Assert.ok(
        assistantDiv.textContent.includes("not bolded"),
        `Raw HTML content should still be visible as text (got: "${assistantDiv.textContent}")`
      );

      el.remove();
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_user_message_website_mentions_render_as_chips() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      await content.customElements.whenDefined("ai-chat-message");
      await content.customElements.whenDefined("ai-website-chip");

      const doc = content.document;

      const googleHref = "https://www.google.com";
      const markdown = `Check [Google](mention:?href=${googleHref}) for info`;

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      // --- IMPORTANT PART ---
      // In mochitests, Xray wrappers can prevent Lit property setters from firing.
      // Set properties on the unwrapped element AND set attributes to guarantee update.
      const elJS = el.wrappedJSObject || el;

      // `role` reflects to `data-message-role` (the `role` attribute is the
      // native ARIA role), so drive it via that attribute.
      el.setAttribute("data-message-role", "user");

      elJS.message = markdown;
      el.setAttribute("message", markdown);

      // Wait for message container
      await ContentTaskUtils.waitForCondition(
        () => el.shadowRoot?.querySelector(".message-user"),
        () =>
          `Expected .message-user. shadowRoot=${
            el.shadowRoot ? el.shadowRoot.innerHTML : "<no shadowRoot>"
          }`
      );

      // Wait for either chip OR the mention anchor
      await ContentTaskUtils.waitForCondition(
        () => {
          const msg = el.shadowRoot?.querySelector(".message-user");
          if (!msg) {
            return false;
          }
          return (
            msg.querySelector("ai-website-chip") ||
            msg.querySelector('a[href^="mention:"]')
          );
        },
        () => {
          const msg = el.shadowRoot?.querySelector(".message-user");
          return `Expected chip or mention anchor. message-user=${
            msg ? msg.innerHTML : "<none>"
          }`;
        }
      );

      const msg = el.shadowRoot.querySelector(".message-user");
      const chip = msg.querySelector("ai-website-chip");
      const mentionAnchor = msg.querySelector('a[href^="mention:"]');

      info("message-user HTML: " + msg.innerHTML);

      // If we still have the mention anchor, replacement didn't happen (fail with context)
      Assert.ok(
        !mentionAnchor,
        `mention anchor should be replaced (got: ${mentionAnchor?.outerHTML})`
      );
      Assert.ok(chip, "ai-website-chip should be rendered");

      // Validate via rendered DOM (stable, avoids Xray property visibility)
      await ContentTaskUtils.waitForCondition(
        () => !!chip.shadowRoot,
        "chip should have a shadowRoot"
      );

      const link = chip.shadowRoot.querySelector("a.chip");
      Assert.ok(link, "chip should render <a class='chip'>");
      Assert.ok(
        link.href.startsWith("https://www.google.com"),
        `chip link href should be google.com (got: ${link.href})`
      );

      const img = chip.shadowRoot.querySelector("img.chip-icon");
      Assert.ok(img, "chip should render <img class='chip-icon'>");
      const imgSrc = img.getAttribute("src");
      Assert.ok(
        imgSrc.startsWith("page-icon:https://www.google.com") ||
          imgSrc.endsWith("defaultFavicon.svg"),
        `chip img src should use page-icon or fallback favicon (got: ${imgSrc})`
      );

      const label = chip.shadowRoot.querySelector(".chip-label");
      Assert.ok(label, "chip should render .chip-label");
      Assert.equal(
        label.textContent.trim(),
        "Google",
        "chip label text should be Google"
      );

      el.remove();
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(
  async function test_user_message_website_mentions_url_length_validation() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", true]],
    });

    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:aichatcontent"
    );
    const browser = tab.linkedBrowser;

    try {
      await SpecialPowers.spawn(browser, [], async () => {
        if (content.document.readyState !== "complete") {
          await ContentTaskUtils.waitForEvent(content, "load");
        }

        await content.customElements.whenDefined("ai-chat-message");
        await content.customElements.whenDefined("ai-website-chip");

        const doc = content.document;

        // Test with empty URL - should not create chip
        const emptyMarkdown = `Check [Empty](mention:?href=) for info`;

        const el = doc.createElement("ai-chat-message");
        doc.body.appendChild(el);

        const elJS = el.wrappedJSObject || el;
        el.setAttribute("data-message-role", "user");
        elJS.message = emptyMarkdown;
        el.setAttribute("message", emptyMarkdown);

        // Wait for message container
        await ContentTaskUtils.waitForCondition(
          () => el.shadowRoot?.querySelector(".message-user"),
          () =>
            `Expected .message-user. shadowRoot=${
              el.shadowRoot ? el.shadowRoot.innerHTML : "<no shadowRoot>"
            }`
        );

        // Wait a bit for processing
        await new Promise(resolve => content.setTimeout(resolve, 100));

        const msg = el.shadowRoot.querySelector(".message-user");
        const chip = msg.querySelector("ai-website-chip");
        const mentionAnchor = msg.querySelector('a[href^="mention:"]');

        info("message-user HTML with empty URL: " + msg.innerHTML);

        // Empty URL should not create chip, but should leave the mention anchor
        Assert.ok(!chip, "ai-website-chip should not be created for empty URL");
        Assert.ok(mentionAnchor, "mention anchor should remain for empty URL");

        // Test with URL that's too long (>2048 chars) - should not create chip
        const longUrl = "https://example.com/" + "a".repeat(2030);
        const longMarkdown = `Check [TooLong](mention:?href=${longUrl}) for info`;

        elJS.message = longMarkdown;
        el.setAttribute("message", longMarkdown);

        // Wait a bit for processing
        await new Promise(resolve => content.setTimeout(resolve, 100));

        const longMsg = el.shadowRoot.querySelector(".message-user");
        const longChip = longMsg.querySelector("ai-website-chip");
        const longMentionAnchor = longMsg.querySelector('a[href^="mention:"]');

        info("message-user HTML with long URL: " + longMsg.innerHTML);

        // Too long URL should not create chip, but should leave the mention anchor
        Assert.ok(
          !longChip,
          "ai-website-chip should not be created for URL longer than 2048 chars"
        );
        Assert.ok(
          longMentionAnchor,
          "mention anchor should remain for URL longer than 2048 chars"
        );

        // Test with valid URL - should create chip
        const validMarkdown = `Check [Valid](mention:?href=https://www.mozilla.org) for info`;

        elJS.message = validMarkdown;
        el.setAttribute("message", validMarkdown);

        // Wait for chip to appear
        await ContentTaskUtils.waitForCondition(
          () => {
            const message = el.shadowRoot?.querySelector(".message-user");
            return message?.querySelector("ai-website-chip");
          },
          () => {
            const message = el.shadowRoot?.querySelector(".message-user");
            return `Expected ai-website-chip for valid URL. message-user=${
              message ? message.innerHTML : "<none>"
            }`;
          }
        );

        const updatedMsg = el.shadowRoot.querySelector(".message-user");
        const validChip = updatedMsg.querySelector("ai-website-chip");
        const validMentionAnchor = updatedMsg.querySelector(
          'a[href^="mention:"]'
        );

        info("message-user HTML with valid URL: " + updatedMsg.innerHTML);

        // Valid URL should create chip and remove mention anchor
        Assert.ok(validChip, "ai-website-chip should be created for valid URL");
        Assert.ok(
          !validMentionAnchor,
          "mention anchor should be replaced for valid URL"
        );

        el.remove();
      });
    } finally {
      BrowserTestUtils.removeTab(tab);
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function test_empty_links_render_as_plain_text() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      await content.customElements.whenDefined("ai-chat-message");

      const doc = content.document;

      // A markdown link with an empty destination (`[text]()`) is rendered by
      // markdown-it as `<a href="">text</a>`. It should be unwrapped to plain
      // text for both roles so it isn't shown as a dead, mislabeled link, while
      // a real link stays clickable.
      for (const role of ["assistant", "user"]) {
        const markdown = `An [empty link]() next to a [real link](https://example.com/).`;

        const el = doc.createElement("ai-chat-message");
        doc.body.appendChild(el);

        const elJS = el.wrappedJSObject || el;
        el.setAttribute("data-message-role", role);
        elJS.message = markdown;
        el.setAttribute("message", markdown);

        await ContentTaskUtils.waitForCondition(
          () => el.shadowRoot?.querySelector(`.message-${role}`),
          () =>
            `Expected .message-${role}. shadowRoot=${
              el.shadowRoot ? el.shadowRoot.innerHTML : "<no shadowRoot>"
            }`
        );

        const msg = el.shadowRoot.querySelector(`.message-${role}`);
        info(`message-${role} HTML: ${msg.innerHTML}`);

        const anchors = Array.from(msg.querySelectorAll("a"));

        // The empty link is gone; only the real link remains as an anchor.
        Assert.equal(
          anchors.length,
          1,
          `${role}: only the real link should remain an anchor`
        );
        Assert.equal(
          anchors[0].getAttribute("href"),
          "https://example.com/",
          `${role}: the real link keeps its href`
        );

        // The empty link's text is preserved as plain text in the message.
        Assert.ok(
          msg.textContent.includes("empty link"),
          `${role}: empty link text should be preserved`
        );

        el.remove();
      }
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

// The core of the streaming optimization: as more text streams in after a
// finished block, that block's DOM element must be reused, not rebuilt. This is
// what keeps a long reply from getting janky - and what stops a finished table
// (with its shadow DOM and ResizeObserver) from being torn down every chunk.
add_task(async function test_streaming_reuses_finished_blocks() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }
      await content.customElements.whenDefined("ai-chat-message");
      await content.customElements.whenDefined("ai-chat-table");

      const doc = content.document;
      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      // Xray wrappers can block Lit setters, so set the property AND attribute.
      const elJS = el.wrappedJSObject || el;
      el.setAttribute("data-message-role", "assistant");

      const TABLE = "| A | B |\n|---|---|\n| 1 | 2 |";
      const base = `Intro paragraph.\n\n${TABLE}\n\n`;

      async function stream(message, marker) {
        elJS.message = message;
        el.setAttribute("message", message);
        await ContentTaskUtils.waitForCondition(() => {
          const container = el.shadowRoot.querySelector(".message-assistant");
          return container && container.textContent.includes(marker);
        }, `streamed render should include "${marker}"`);
      }

      await stream(`${base}Tail`, "Tail");
      const introParagraph = el.shadowRoot.querySelector(
        ".message-assistant > p"
      );
      const table = el.shadowRoot.querySelector(
        ".message-assistant ai-chat-table"
      );
      Assert.ok(introParagraph, "intro paragraph should render");
      Assert.ok(table, "table should render");

      // Keep appending text after the (now finished) table.
      await stream(`${base}Tail grows`, "Tail grows");
      await stream(`${base}Tail grows longer`, "Tail grows longer");

      const introParagraphLater = el.shadowRoot.querySelector(
        ".message-assistant > p"
      );
      const tableLater = el.shadowRoot.querySelector(
        ".message-assistant ai-chat-table"
      );

      Assert.strictEqual(
        introParagraph,
        introParagraphLater,
        "the finished intro paragraph node should be reused, not rebuilt"
      );
      Assert.strictEqual(
        table,
        tableLater,
        "the finished table node should be reused across chunks, not rebuilt"
      );

      el.remove();
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

// Mid-stream a block can change type as later characters arrive (a paragraph
// becomes a table once its separator row lands; earlier text becomes a link once
// its reference definition streams in). Each transition must reach the correct
// final DOM.
add_task(async function test_streaming_block_transitions() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }
      await content.customElements.whenDefined("ai-chat-message");
      await content.customElements.whenDefined("ai-chat-table");

      const doc = content.document;
      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      const elJS = el.wrappedJSObject || el;
      el.setAttribute("data-message-role", "assistant");

      const set = message => {
        elJS.message = message;
        el.setAttribute("message", message);
      };
      const msg = () => el.shadowRoot.querySelector(".message-assistant");

      // Paragraph -> table once the separator row arrives.
      set("| A | B |");
      await ContentTaskUtils.waitForCondition(
        () => msg()?.querySelector("p"),
        "a header-only table row renders as a paragraph first"
      );
      set("| A | B |\n|---|---|\n| 1 | 2 |");
      await ContentTaskUtils.waitForCondition(
        () => msg()?.querySelector("ai-chat-table"),
        "table forms once the separator row arrives"
      );
      Assert.ok(
        !msg().querySelector(":scope > p"),
        "no stale paragraph left behind after becoming a table"
      );

      // Late reference definition turns earlier text into a link.
      set("See [docs][1] now.");
      await ContentTaskUtils.waitForCondition(
        () => msg()?.textContent.includes("[docs][1]"),
        "an undefined reference renders as literal text"
      );
      Assert.equal(
        msg().querySelectorAll("a[href]").length,
        0,
        "no anchor before the reference is defined"
      );
      set("See [docs][1] now.\n\n[1]: https://example.com");
      await ContentTaskUtils.waitForCondition(
        () => msg()?.querySelector("a[href]"),
        "earlier text becomes a link once its definition streams in"
      );
      Assert.ok(
        msg()
          .querySelector("a[href]")
          .getAttribute("href")
          .startsWith("https://example.com"),
        "the link points at the streamed-in definition"
      );

      el.remove();
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});
