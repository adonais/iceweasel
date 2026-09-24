/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const AITAB_PREF = "browser.smartwindow.aitab.enabled";
const UNKNOWN_SLUG = "unknown-slug";
const STORED_SLUG = "stored-slug";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AITabStore:
    "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs",
});

describe("about:aitab store integration", () => {
  let tab;

  beforeEach(async () => {
    tab = null;
    await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });
    await lazy.AITabStore.destroyDatabase();
  });

  afterEach(async () => {
    if (tab) {
      await BrowserTestUtils.removeTab(tab);
      tab = null;
    }
    await lazy.AITabStore.destroyDatabase();
    await SpecialPowers.popPrefEnv();
  });

  it("shows the unavailable state for an unknown slug", async () => {
    tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `about:aitab?page=${UNKNOWN_SLUG}`
    );

    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      await content.customElements.whenDefined("aitab-page");
      const element = content.document.querySelector("aitab-page");
      const page = element.wrappedJSObject;

      await ContentTaskUtils.waitForCondition(
        () => page.status != "loading",
        "The page finishes its store lookup"
      );
      await page.updateComplete;

      Assert.equal(
        page.status,
        "unavailable",
        "An unknown slug produces the unavailable state"
      );
      Assert.equal(page.page, null, "No page data is returned");
      Assert.equal(
        element.shadowRoot.querySelector(".aitab-status")?.dataset.l10nId,
        "ai-tab-page-unavailable",
        "The unavailable message is rendered"
      );
    });
  });

  describe("with a stored page", () => {
    let storedPage;

    beforeEach(async () => {
      storedPage = await lazy.AITabStore.create({
        convId: "stored-conversation",
        slug: STORED_SLUG,
        title: "Stored AI Tab",
        components: [
          {
            type: "text",
            layout: "summary",
            title: "Stored component",
          },
        ],
      });
    });

    it("loads the stored page through the actor pair", async () => {
      tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        `about:aitab?page=${STORED_SLUG}`
      );

      await SpecialPowers.spawn(
        tab.linkedBrowser,
        [storedPage],
        async expectedPage => {
          await content.customElements.whenDefined("aitab-page");
          const element = content.document.querySelector("aitab-page");
          const pageComponent = element.wrappedJSObject;

          await ContentTaskUtils.waitForCondition(
            () => pageComponent.status != "loading",
            "The page finishes its store lookup"
          );
          await pageComponent.updateComplete;

          Assert.equal(
            pageComponent.status,
            "ready",
            "The stored page reaches the ready state"
          );
          Assert.equal(
            pageComponent.page.slug,
            expectedPage.slug,
            "The requested page is returned"
          );
          Assert.equal(
            pageComponent.page.title,
            expectedPage.title,
            "The stored title is returned"
          );
          Assert.deepEqual(
            pageComponent.page.components,
            expectedPage.components,
            "The stored components are returned"
          );
          Assert.ok(
            element.shadowRoot.querySelector(".aitab-sheet"),
            "The page content is rendered"
          );
        }
      );
    });
  });
});
