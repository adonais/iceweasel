/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const AITAB_PREF = "browser.smartwindow.aitab.enabled";
const PAGE_NAME = "hotels_san_francisco_1.html";
const PAGE_URL = `about:aitab?page=${PAGE_NAME}`;

const PAGE_CONFIG = {
  header: {
    type: "header",
    eyebrow: "From your open tabs",
    title: "Hotels in Lisbon",
    subhead: "4 options gathered from your open tabs",
  },
  blocks: [
    { type: "text", layout: "summary", title: "What you are comparing" },
    { type: "table", layout: "comparison", title: "Nightly rates" },
    { layout: "summary", title: "A block with no type" },
  ],
  footer: {
    type: "footer",
    text: "Keep it going",
    buttons: [
      { text: "Open the booking site", href: "https://example.com/book" },
      { text: "Add a block", href: "app://views/add" },
    ],
  },
};

add_task(async function test_actor_registered_when_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });

  await BrowserTestUtils.withNewTab(PAGE_URL, browser => {
    Assert.ok(
      browser.browsingContext.currentWindowGlobal.getActor("AITab"),
      "AITab actor is registered"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_page_unavailable_when_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, false]] });

  Assert.throws(
    () =>
      Services.io.newChannelFromURI(
        Services.io.newURI(PAGE_URL),
        null,
        Services.scriptSecurityManager.getSystemPrincipal(),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_DOCUMENT
      ),
    /NS_ERROR_NOT_AVAILABLE/,
    "about:aitab cannot be loaded when the pref is off"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_unknown_page_reports_unavailable() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });

  await BrowserTestUtils.withNewTab(PAGE_URL, async browser => {
    await SpecialPowers.spawn(browser, [PAGE_NAME], async pageName => {
      await content.customElements.whenDefined("aitab-page");
      const page = content.document.querySelector("aitab-page").wrappedJSObject;

      await ContentTaskUtils.waitForCondition(
        () => page.status != "loading",
        "The page finishes its lookup"
      );

      Assert.equal(
        page.pageName,
        pageName,
        "The page name comes from the page URL"
      );
      Assert.equal(
        page.status,
        "unavailable",
        "A name with no stored page renders the unavailable state"
      );
      Assert.ok(
        content.document
          .querySelector("aitab-page")
          .shadowRoot.querySelector(".aitab-status"),
        "The unavailable message is rendered"
      );
    });
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_path_like_page_name_rejected() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });

  const pathLikeName = "../../../etc/passwd";

  await BrowserTestUtils.withNewTab(
    `about:aitab?page=${encodeURIComponent(pathLikeName)}`,
    async browser => {
      await SpecialPowers.spawn(browser, [pathLikeName], async name => {
        await content.customElements.whenDefined("aitab-page");
        const element = content.document.querySelector("aitab-page");
        const page = element.wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => page.status != "loading",
          "The page finishes its lookup"
        );

        Assert.equal(
          page.pageName,
          name,
          "Percent-encoding does not hide the path from the parent actor"
        );
        Assert.equal(
          page.status,
          "error",
          "A name shaped like a path is refused rather than looked up"
        );
        Assert.equal(
          element.shadowRoot.querySelector(".aitab-status")?.dataset.l10nId,
          "ai-tab-page-error",
          "The error message is rendered"
        );
        Assert.ok(
          !element.shadowRoot.querySelector(".aitab-sheet"),
          "No page is rendered"
        );
      });
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_missing_page_reports_unavailable() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });

  await BrowserTestUtils.withNewTab("about:aitab", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("aitab-page");
      const page = content.document.querySelector("aitab-page").wrappedJSObject;

      await ContentTaskUtils.waitForCondition(
        () => page.status != "loading",
        "The page finishes its lookup"
      );

      Assert.equal(page.pageName, null, "There is no page name in the URL");
      Assert.equal(
        page.status,
        "unavailable",
        "A URL with no page name renders the unavailable state"
      );
    });
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_renders_page_config() {
  await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });

  await BrowserTestUtils.withNewTab(PAGE_URL, async browser => {
    await SpecialPowers.spawn(browser, [PAGE_CONFIG], async config => {
      await content.customElements.whenDefined("aitab-page");
      const element = content.document.querySelector("aitab-page");
      const page = element.wrappedJSObject;

      await ContentTaskUtils.waitForCondition(
        () => page.status != "loading",
        "The page finishes its lookup"
      );

      page.page = Cu.cloneInto(config, content);
      page.status = "ready";
      await page.updateComplete;

      const { shadowRoot } = element;
      Assert.equal(
        shadowRoot.querySelector(".aitab-title").textContent,
        config.header.title,
        "The header title is rendered"
      );
      Assert.equal(
        content.document.title,
        config.header.title,
        "The document title follows the header title so history shows it"
      );
      Assert.deepEqual(
        [...shadowRoot.querySelectorAll(".aitab-block")].map(
          block => block.dataset.blockType
        ),
        ["text", "table"],
        "Every typed block gets a placeholder that keeps its type, and a block with no type is skipped"
      );

      const chips = [...shadowRoot.querySelectorAll(".aitab-chip")];
      Assert.equal(chips.length, 2, "Both footer buttons are rendered");
      Assert.equal(chips[0].localName, "a", "An https href becomes a link");
      Assert.equal(
        chips[0].target,
        "_blank",
        "The link opens in a new tab, leaving the generated page up"
      );
      Assert.equal(chips[1].localName, "span", "A non-http href stays inert");
    });
  });

  await SpecialPowers.popPrefEnv();
});
