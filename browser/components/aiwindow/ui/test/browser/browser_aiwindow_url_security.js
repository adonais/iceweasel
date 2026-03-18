/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Browser tests for AI Window URL security validation.
 *
 * Tests the push-based URL validation flow where:
 * 1. Trusted URLs are pushed to ai-chat-message via trustedUrls property
 * 2. ai-chat-message renders markdown and processes links synchronously
 * 3. Links matching trustedUrls get href enabled; others are disabled
 *
 * These tests verify the security invariants at the component boundary:
 * - Fail-closed: links disabled by default
 * - Trusted links enabled when URL is in trustedUrls array
 * - Untrusted links remain disabled
 *
 * Note: Uses wrappedJSObject to bypass Xray wrappers that can prevent
 * Lit property setters from firing in mochitest environment.
 */

/**
 * Test 1: Verify fail-closed default behavior.
 *
 * When trustedUrls is empty (default), all http/https links should
 * be rendered without href attribute, making them non-clickable.
 */
add_task(async function test_fail_closed_default() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.ml.security.enabled", true],
    ],
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

      const doc = content.document;

      function getRoot(el) {
        return el.shadowRoot ?? el;
      }

      await content.customElements.whenDefined("ai-chat-message");

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      const elJS = el.wrappedJSObject || el;

      elJS.role = "assistant";
      el.setAttribute("role", "assistant");
      elJS.messageId = "test-fail-closed";
      el.setAttribute("data-message-id", "test-fail-closed");
      elJS.trustedUrls = SpecialPowers.Cu.cloneInto([], content);
      elJS.message =
        "Check out [Example](https://example.com) and [Test](https://test.com).";
      el.setAttribute(
        "message",
        "Check out [Example](https://example.com) and [Test](https://test.com)."
      );

      await ContentTaskUtils.waitForCondition(() => {
        const div = getRoot(el).querySelector(".message-assistant");
        return (
          div && div.querySelectorAll(".untrusted-link-label").length === 2
        );
      }, "Both untrusted link labels should be rendered");

      const assistantDiv = getRoot(el).querySelector(".message-assistant");

      const anchors = [...assistantDiv.querySelectorAll("a[href]")];
      Assert.equal(anchors.length, 2, "Should have 2 disclosure anchors");

      for (const anchor of anchors) {
        Assert.equal(
          anchor.textContent,
          anchor.getAttribute("href"),
          "Disclosure anchor text should match its href"
        );
      }

      el.remove();
    });
  } finally {
    await BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Test 2: Verify trusted and untrusted links are handled correctly.
 *
 * When trustedUrls contains some URLs:
 * - Matching URLs should have href enabled (clickable)
 * - Non-matching URLs should have href removed (not clickable)
 */
add_task(async function test_trusted_and_untrusted_links() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.ml.security.enabled", true],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  const trustedUrl = "https://trusted.example.com/page";
  const untrustedUrl = "https://untrusted.example.com/page";

  try {
    await SpecialPowers.spawn(
      browser,
      [trustedUrl, untrustedUrl],
      async (trusted, untrusted) => {
        if (content.document.readyState !== "complete") {
          await ContentTaskUtils.waitForEvent(content, "load");
        }

        const doc = content.document;

        function getRoot(el) {
          return el.shadowRoot ?? el;
        }

        await content.customElements.whenDefined("ai-chat-message");

        const el = doc.createElement("ai-chat-message");
        doc.body.appendChild(el);

        const elJS = el.wrappedJSObject || el;

        // Set trustedUrls BEFORE message so it's available during first render
        // Use SpecialPowers.Cu.cloneInto to properly pass array across compartment boundary
        const trustedArray = SpecialPowers.Cu.cloneInto([trusted], content);
        elJS.trustedUrls = trustedArray;
        elJS.role = "assistant";
        el.setAttribute("role", "assistant");
        elJS.messageId = "test-trusted-untrusted";
        el.setAttribute("data-message-id", "test-trusted-untrusted");
        elJS.message = `Visit [Trusted](${trusted}) or [Untrusted](${untrusted}).`;
        el.setAttribute(
          "message",
          `Visit [Trusted](${trusted}) or [Untrusted](${untrusted}).`
        );

        await ContentTaskUtils.waitForCondition(() => {
          const div = getRoot(el).querySelector(".message-assistant");
          return div && div.querySelectorAll("a[href]").length === 2;
        }, "Both clickable anchors should be rendered");

        const assistantDiv = getRoot(el).querySelector(".message-assistant");

        const trustedAnchor = assistantDiv.querySelector(
          `a[href="${trusted}"]`
        );
        Assert.ok(trustedAnchor, "Trusted anchor should exist");
        Assert.equal(
          trustedAnchor.textContent,
          "Trusted",
          "Trusted anchor should have original text"
        );

        const untrustedLabel = assistantDiv.querySelector(
          ".untrusted-link-label"
        );
        Assert.ok(untrustedLabel, "Untrusted link label should exist");
        Assert.equal(
          untrustedLabel.textContent,
          "Untrusted",
          "Untrusted label should have original text"
        );

        const disclosureAnchor = assistantDiv.querySelector(
          `a[href="${untrusted}"]`
        );
        Assert.ok(disclosureAnchor, "Disclosure anchor should exist");
        Assert.equal(
          disclosureAnchor.textContent,
          untrusted,
          "Disclosure anchor text should show the URL"
        );

        el.remove();
      }
    );
  } finally {
    await BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Test 3: Verify trust updates trigger re-render with correct link states.
 *
 * When trustedUrls is updated to a new array instance, the component
 * should re-render and update link states accordingly.
 */
add_task(async function test_trust_update_triggers_rerender() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.ml.security.enabled", true],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  const testUrl = "https://example.com/article";

  try {
    await SpecialPowers.spawn(browser, [testUrl], async url => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      const doc = content.document;

      function getRoot(el) {
        return el.shadowRoot ?? el;
      }

      await content.customElements.whenDefined("ai-chat-message");

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      const elJS = el.wrappedJSObject || el;

      // Initial render with empty trustedUrls
      const emptyArray = SpecialPowers.Cu.cloneInto([], content);
      elJS.trustedUrls = emptyArray;
      elJS.role = "assistant";
      el.setAttribute("role", "assistant");
      elJS.messageId = "test-trust-update";
      el.setAttribute("data-message-id", "test-trust-update");
      elJS.message = `Read this [Article](${url}).`;
      el.setAttribute("message", `Read this [Article](${url}).`);

      // Wait for untrusted link formatting
      await ContentTaskUtils.waitForCondition(() => {
        const div = getRoot(el).querySelector(".message-assistant");
        if (!div) {
          return false;
        }
        return div.querySelector(".untrusted-link-label");
      }, "Initial render should show untrusted link label");

      let assistantDiv = getRoot(el).querySelector(".message-assistant");

      Assert.ok(
        assistantDiv.querySelector(".untrusted-link-label"),
        "Link should show untrusted label initially (fail-closed)"
      );

      // Update trustedUrls to include the URL (new array instance)
      const updatedArray = SpecialPowers.Cu.cloneInto([url], content);
      elJS.trustedUrls = updatedArray;

      await ContentTaskUtils.waitForCondition(() => {
        const div = getRoot(el).querySelector(".message-assistant");
        if (!div) {
          return false;
        }
        return !div.querySelector(".untrusted-link-label");
      }, "Re-render should remove untrusted label");

      assistantDiv = getRoot(el).querySelector(".message-assistant");
      const anchor = assistantDiv.querySelector("a");

      Assert.ok(
        anchor.hasAttribute("href"),
        "Link should be enabled after trust update"
      );
      Assert.equal(
        anchor.getAttribute("href"),
        url,
        "Link href should match trusted URL"
      );
      Assert.equal(
        anchor.textContent,
        "Article",
        "Trusted link should have original text"
      );

      el.remove();
    });
  } finally {
    await BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Test 4: Verify fragment URLs match their base URL.
 *
 * When trustedUrls contains a base URL (without fragment), links
 * with fragments pointing to the same page should be enabled.
 * This tests the fragment-stripping normalization.
 */
add_task(async function test_fragment_urls_match_base() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.ml.security.enabled", true],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  const baseUrl = "https://example.com/article";
  const fragmentUrl = "https://example.com/article#section-2";

  try {
    await SpecialPowers.spawn(
      browser,
      [baseUrl, fragmentUrl],
      async (base, withFragment) => {
        if (content.document.readyState !== "complete") {
          await ContentTaskUtils.waitForEvent(content, "load");
        }

        const doc = content.document;

        function getRoot(el) {
          return el.shadowRoot ?? el;
        }

        await content.customElements.whenDefined("ai-chat-message");

        const el = doc.createElement("ai-chat-message");
        doc.body.appendChild(el);

        const elJS = el.wrappedJSObject || el;

        // trustedUrls contains base URL (no fragment)
        // Message contains URL with fragment - should still match
        const baseArray = SpecialPowers.Cu.cloneInto([base], content);
        elJS.trustedUrls = baseArray;
        elJS.role = "assistant";
        el.setAttribute("role", "assistant");
        elJS.messageId = "test-fragment-match";
        el.setAttribute("data-message-id", "test-fragment-match");
        elJS.message = `Jump to [Section 2](${withFragment}) for details.`;
        el.setAttribute(
          "message",
          `Jump to [Section 2](${withFragment}) for details.`
        );

        await ContentTaskUtils.waitForCondition(() => {
          const div = getRoot(el).querySelector(".message-assistant");
          if (!div) {
            return false;
          }
          return div.querySelector("a");
        }, "Anchor should be rendered");

        const assistantDiv = getRoot(el).querySelector(".message-assistant");
        const anchor = assistantDiv.querySelector("a");

        Assert.ok(anchor, "Anchor should exist");
        Assert.ok(
          anchor.hasAttribute("href"),
          "Anchor should have href (fragment matched base URL)"
        );
        Assert.equal(
          anchor.getAttribute("href"),
          base,
          "Anchor href should have fragment stripped to prevent exfiltration"
        );

        el.remove();
      }
    );
  } finally {
    await BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Test 5 (Integration Smoke): Verify URL trust validation in a real AI Window.
 * via the actor chain and enable links in rendered messages.
 *
 * This test exercises the real push chain:
 * - Binds the actor to the conversation via setConversation
 * - Seeds URL into the session ledger
 * - Ledger change event triggers push from parent to child
 * - Child dispatches event to ai-chat-content
 * - ai-chat-message validates links against the pushed trusted URLs
 *
 * Note: This does NOT exercise @mention seeding from the smartbar.
 * TODO: Bug 2016847 - Add full @mention-to-render integration test.
 */
add_task(async function test_aiwindow_component_trust_smoke() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.ml.security.enabled", true],
      ["browser.smartwindow.checkSecurityFlags", true],
    ],
  });

  const restoreSignIn = skipSignIn();

  const trustedUrl = "https://trusted.example.com/page";
  const untrustedUrl = "https://untrusted.example.com/page";

  const { getSecurityOrchestrator } = ChromeUtils.importESModule(
    "chrome://global/content/ml/security/SecurityOrchestrator.sys.mjs"
  );

  let win;
  let testConversationId;
  try {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    // Register session and get ledger (don't seed yet, wait for actor binding)
    testConversationId = "test-integration-conv-" + Date.now();
    const orchestrator = await getSecurityOrchestrator();
    const ledger = orchestrator.registerSession(testConversationId);

    info(`Registered session ${testConversationId}`);

    // Bind actor to conversation and seed URL to trigger push chain
    let innerBC = await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-window");

      const aiWindowElement = content.document.querySelector("ai-window");
      Assert.ok(aiWindowElement, "ai-window element should exist");

      await ContentTaskUtils.waitForCondition(() => {
        const container =
          aiWindowElement.shadowRoot?.querySelector("#browser-container");
        return container?.querySelector("browser");
      }, "Browser container should have browser element");

      const nestedBrowser =
        aiWindowElement.shadowRoot.querySelector("#aichat-browser");
      Assert.ok(nestedBrowser, "Nested aichat-browser should exist");
      return nestedBrowser.browsingContext;
    });

    if (innerBC.currentURI.spec != "about:aichatcontent") {
      // If the inner browser hasn't loaded yet, wait for it to load about:aichatcontent
      await BrowserTestUtils.browserLoaded(innerBC, {
        wantLoad: "about:aichatcontent",
      });
      innerBC = browser.browsingContext.children[0];
    }
    Assert.equal(
      innerBC.currentURI.spec,
      "about:aichatcontent",
      "Inner browser should load chat content"
    );
    Assert.equal(
      innerBC.currentRemoteType,
      "privilegedabout",
      "Inner browser should have privilegedabout remote type."
    );
    await SpecialPowers.spawn(innerBC, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document?.querySelector("ai-chat-content");
      }, "ai-chat-content should exist in nested browser");

      const innerDoc = content.document;
      const chatContent = innerDoc.querySelector("ai-chat-content");
      Assert.ok(chatContent, "ai-chat-content should exist");

      await ContentTaskUtils.waitForCondition(() => {
        try {
          const chatContentJS = chatContent.wrappedJSObject || chatContent;
          return chatContentJS.shadowRoot?.querySelector(
            ".chat-content-wrapper"
          );
        } catch {
          return false;
        }
      }, "ai-chat-content shadow DOM should be rendered");
    });

    // Bind actor to the test conversation
    const actor = innerBC.currentWindowGlobal.getActor("AIChatContent");
    actor.setConversation(testConversationId);

    // Seed the URL from chrome - triggers the push chain:
    // ledger.seedConversation -> "change" event -> parent pushes -> child receives
    ledger.seedConversation([trustedUrl]);

    info(`Seeded URL ${trustedUrl} into conversation ${testConversationId}`);

    // Dispatch message and verify links
    await SpecialPowers.spawn(
      innerBC,
      [trustedUrl, untrustedUrl, testConversationId],
      async (trusted, untrusted, convId) => {
        const innerDoc = content.document;
        const chatContent = innerDoc.querySelector("ai-chat-content");
        const chatContentJS = chatContent.wrappedJSObject || chatContent;

        // Wait for trustedUrls to arrive via the actor push chain
        await ContentTaskUtils.waitForCondition(() => {
          return chatContentJS.trustedUrls?.length > 0;
        }, "trustedUrls should be pushed via actor chain");

        const testMessageId = "test-integration-msg";
        const eventDetail = Cu.cloneInto(
          {
            role: "assistant",
            ordinal: 0,
            id: testMessageId,
            content: {
              body: `Visit [Trusted](${trusted}) or [Untrusted](${untrusted}).`,
            },
            memoriesApplied: [],
            tokens: { search: [] },
            webSearchQueries: [],
            followUpSuggestions: [],
            convId,
          },
          content
        );

        const messageEvent = new content.CustomEvent(
          "aiChatContentActor:message",
          {
            detail: eventDetail,
            bubbles: true,
          }
        );

        chatContent.dispatchEvent(messageEvent);

        await ContentTaskUtils.waitForCondition(() => {
          const msg = chatContent.shadowRoot?.querySelector(
            `ai-chat-message[data-message-id="${testMessageId}"]`
          );
          if (!msg) {
            return false;
          }
          const assistantDiv = (msg.shadowRoot ?? msg).querySelector(
            ".message-assistant"
          );
          return (
            assistantDiv?.querySelectorAll("a[href]").length === 2 &&
            assistantDiv?.querySelector(".untrusted-link-label")
          );
        }, "Message with trusted anchor, untrusted label, and disclosure anchor should render");

        const messageEl = chatContent.shadowRoot.querySelector(
          `ai-chat-message[data-message-id="${testMessageId}"]`
        );
        const assistantDiv = (messageEl.shadowRoot ?? messageEl).querySelector(
          ".message-assistant"
        );

        const trustedAnchor = assistantDiv.querySelector(
          `a[href="${trusted}"]`
        );
        Assert.ok(trustedAnchor, "Trusted anchor should exist");
        Assert.equal(
          trustedAnchor.textContent,
          "Trusted",
          "Trusted anchor should have original text"
        );

        const untrustedLabel = assistantDiv.querySelector(
          ".untrusted-link-label"
        );
        Assert.ok(untrustedLabel, "Untrusted link label should exist");
        Assert.equal(
          untrustedLabel.textContent,
          "Untrusted",
          "Untrusted label text should match"
        );

        const disclosureAnchor = assistantDiv.querySelector(
          `a[href="${untrusted}"]`
        );
        Assert.ok(
          disclosureAnchor,
          "Disclosure anchor should exist for untrusted URL"
        );
        Assert.equal(
          disclosureAnchor.textContent,
          untrusted,
          "Disclosure anchor should show the URL"
        );
      }
    );
  } finally {
    if (testConversationId) {
      try {
        const orchestrator = await getSecurityOrchestrator();
        orchestrator.cleanupSession(testConversationId);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    restoreSignIn();
    await SpecialPowers.popPrefEnv();
  }
});
