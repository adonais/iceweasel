/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { buildBrowserContextPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);

const { SecurityProperties } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/SecurityProperties.sys.mjs"
);

const { sanitizeUntrustedContent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);

const { getRemoteClient } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

async function openContextTab(title) {
  const { url, server } = serveHTML(`<!doctype html><title>${title}</title>`);
  let tab;
  try {
    tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url, true);
    await TestUtils.waitForCondition(
      () => tab.label === title,
      `Waiting for tab label: ${title}`
    );
  } catch (e) {
    if (tab) {
      BrowserTestUtils.removeTab(tab);
    }
    await new Promise(resolve => server.stop(resolve));
    throw e;
  }

  return {
    tab,
    url,
    label: tab.label,
    async cleanup() {
      BrowserTestUtils.removeTab(tab);
      await new Promise(resolve => server.stop(resolve));
    },
  };
}

add_setup(async function verify_browser_context_records_are_available() {
  const records = await getRemoteClient().get();

  Assert.ok(
    records.some(
      record =>
        record.kind === "module" &&
        record.feature === "browser-context" &&
        record.module === "tab" &&
        record.model === "generic"
    ),
    "Real Remote Settings provides the browser-context tab module"
  );
  Assert.ok(
    records.some(
      record =>
        record.kind === "module" &&
        record.feature === "browser-context" &&
        record.module === "mentions" &&
        record.model === "generic"
    ),
    "Real Remote Settings provides the browser-context mentions module"
  );
});

add_task(async function test_returns_null_with_no_context() {
  const securityProperties = new SecurityProperties();
  const out = await buildBrowserContextPrompt("generic", {
    contextMentions: [],
    securityProperties,
  });
  securityProperties.commit();

  Assert.equal(out, null, "No prompt is returned without tab or mentions");
  Assert.ok(
    !securityProperties.privateData,
    "No privateData flag is committed without tab or mentions"
  );
});

add_task(async function test_renders_current_tab_and_selected_tab_context() {
  const mentionedTab = await openContextTab("Mentioned Test Page");
  const currentTab = await openContextTab("Browser Context Test Page");

  try {
    const securityProperties = new SecurityProperties();
    const out = await buildBrowserContextPrompt("generic", {
      contextMentions: [
        {
          type: "currentTab",
          url: currentTab.url,
          label: currentTab.label,
        },
        {
          type: "tab",
          url: mentionedTab.url,
          label: mentionedTab.label,
        },
      ],
      securityProperties,
    });
    securityProperties.commit();

    Assert.ok(out, "A browser-context prompt is returned");
    Assert.ok(
      out.includes(`URL: ${currentTab.url}`),
      "The current tab URL is rendered"
    );
    Assert.ok(
      out.includes(
        `Page title: "Browser Context Test Page" (Untrusted webpage data)`
      ),
      "The current tab title is rendered as untrusted page data"
    );
    Assert.ok(
      out.includes(`- URL: ${mentionedTab.url}`),
      "The selected tab URL is rendered"
    );
    Assert.ok(
      out.includes(`Title: "Mentioned Test Page" (Untrusted webpage data)`),
      "The selected tab title is rendered as untrusted page data"
    );
    Assert.ok(
      !out.includes("{url}") &&
        !out.includes("{title}") &&
        !out.includes("{contextUrls}"),
      "Remote Settings prompt placeholders are rendered"
    );
    Assert.ok(
      securityProperties.privateData,
      "privateData is committed when tab context is included"
    );
  } finally {
    await currentTab.cleanup();
    await mentionedTab.cleanup();
  }
});

add_task(async function test_renders_selected_tabs_without_current_tab() {
  const mentionedTab = await openContextTab("Only Mentioned Test Page");

  try {
    const securityProperties = new SecurityProperties();
    const out = await buildBrowserContextPrompt("generic", {
      contextMentions: [
        {
          type: "tab",
          url: mentionedTab.url,
          label: mentionedTab.label,
        },
      ],
      securityProperties,
    });

    Assert.ok(out, "A mentions-only browser-context prompt is returned");
    Assert.ok(
      !out.includes("This is my active tab:"),
      "The active-tab fragment is omitted without current tab context"
    );
    Assert.ok(
      out.includes(`- URL: ${mentionedTab.url}`),
      "The selected tab URL is rendered"
    );
    Assert.ok(
      out.includes(
        `Title: "Only Mentioned Test Page" (Untrusted webpage data)`
      ),
      "The selected tab title is rendered as untrusted page data"
    );
  } finally {
    await mentionedTab.cleanup();
  }
});

add_task(async function test_renders_tab_group_members_under_their_group() {
  const out = await buildBrowserContextPrompt("generic", {
    contextMentions: [
      { type: "tabGroup", groupId: "group-id", label: "Group label" },
      {
        type: "tab",
        url: "https://example.com/ungrouped",
        label: "Ungrouped tab",
      },
      {
        type: "tab",
        url: "https://example.com/member",
        label: "Member tab",
        groupId: "group-id",
        groupLabel: "Group label",
      },
    ],
    securityProperties: new SecurityProperties(),
  });

  Assert.ok(
    out.includes(
      `- Tab group: ${sanitizeUntrustedContent("Group label")}\n` +
        `  - URL: https://example.com/member\n` +
        `    Title: ${sanitizeUntrustedContent("Member tab")}`
    ),
    "A group member is nested under its sanitized group label"
  );
  Assert.ok(
    out.includes(`\n- URL: https://example.com/ungrouped`),
    "A mention without a group is not indented"
  );
  Assert.ok(!out.includes("group-id"), "The group id does not reach the model");
});

add_task(async function test_renders_an_unnamed_tab_group() {
  const out = await buildBrowserContextPrompt("generic", {
    contextMentions: [
      {
        type: "tab",
        url: "https://example.com/member",
        label: "Member tab",
        groupId: "group-id",
        groupLabel: "",
      },
    ],
    securityProperties: new SecurityProperties(),
  });

  Assert.ok(
    out.includes(`- Tab group\n  - URL: https://example.com/member`),
    "An unnamed group is rendered without a label"
  );
});
