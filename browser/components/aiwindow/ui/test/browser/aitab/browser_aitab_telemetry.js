/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AITabStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs"
);
const { resetHeadingFontForTesting } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabHeadingFont.sys.mjs"
);

const AITAB_PREF = "browser.smartwindow.aitab.enabled";
const READY_SLUG = "view_page";

const READY_PAGE = {
  convId: "conv-view",
  slug: READY_SLUG,
  title: "View",
  components: {
    surface: {
      components: [
        { id: "root", component: "Page", header: "hdr", children: [] },
        {
          id: "hdr",
          component: "Header",
          title: "View",
          references: {
            items: [{ title: "Example", href: "https://example.com/source" }],
          },
        },
      ],
      dataModel: {},
    },
  },
};

describe("AI Tab telemetry", () => {
  beforeEach(async () => {
    resetHeadingFontForTesting();
    await SpecialPowers.pushPrefEnv({ set: [[AITAB_PREF, true]] });
  });

  afterEach(async () => {
    await SpecialPowers.popPrefEnv();
  });

  it("records an unavailable view when the address has no page name", async () => {
    Services.fog.testResetFOG();
    await BrowserTestUtils.withNewTab("about:smartpage", async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        await content.customElements.whenDefined("aitab-page");
        const page =
          content.document.querySelector("aitab-page").wrappedJSObject;
        await ContentTaskUtils.waitForCondition(
          () => page.status != "loading",
          "The page finishes its lookup"
        );
      });
      await TestUtils.waitForCondition(
        () => Glean.smartWindow.aitabView.testGetValue()?.length,
        "The view event is recorded"
      );
    });

    const events = Glean.smartWindow.aitabView.testGetValue();
    Assert.equal(events.length, 1, "One view is recorded");
    Assert.equal(events[0].extra.outcome, "unavailable");
    Assert.equal(events[0].extra.font, "unavailable");
  });

  it("records an unavailable view when the page is not stored", async () => {
    Services.fog.testResetFOG();
    await BrowserTestUtils.withNewTab(
      "about:smartpage?page=missing_page",
      async browser => {
        await SpecialPowers.spawn(browser, [], async () => {
          await content.customElements.whenDefined("aitab-page");
          const page =
            content.document.querySelector("aitab-page").wrappedJSObject;
          await ContentTaskUtils.waitForCondition(
            () => page.status != "loading",
            "The page finishes its lookup"
          );
          Assert.equal(
            page.status,
            "unavailable",
            "A missing row leaves the page unavailable"
          );
        });
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.aitabView.testGetValue()?.length,
          "The view event is recorded"
        );
      }
    );

    const view = Glean.smartWindow.aitabView.testGetValue()[0].extra;
    Assert.equal(view.outcome, "unavailable");
    Assert.equal(view.font, "unavailable");
  });

  describe("a stored page", () => {
    beforeEach(async () => {
      await AITabStore.destroyDatabase();
      await AITabStore.create(READY_PAGE);
      Services.fog.testResetFOG();
    });

    afterEach(async () => {
      await AITabStore.destroyDatabase();
    });

    it("records a ready view", async () => {
      await BrowserTestUtils.withNewTab(
        `about:smartpage?page=${READY_SLUG}`,
        async browser => {
          await waitForReadyPage(browser);
          await TestUtils.waitForCondition(
            () =>
              Glean.smartWindow.aitabView.testGetValue()?.[0]?.extra.outcome ==
              "ready",
            "The ready view is recorded"
          );
          Assert.equal(
            Glean.smartWindow.aitabView.testGetValue()[0].extra.font,
            "unavailable",
            "No heading font bytes leaves the face uninstalled"
          );
        }
      );
    });

    it("records link clicks", async () => {
      await BrowserTestUtils.withNewTab(
        `about:smartpage?page=${READY_SLUG}`,
        async browser => {
          await waitForReadyPage(browser);
          const actor =
            browser.browsingContext.currentWindowGlobal.getActor("AITab");
          Services.fog.testResetFOG();

          await actor.receiveMessage({
            name: "AITab:OpenLink",
            data: { url: "javascript:alert(1)" },
          });
          Assert.ok(
            !Glean.smartWindow.aitabLinkClick.testGetValue(),
            "A non-http link is not recorded"
          );

          const opened = BrowserTestUtils.waitForNewTab(
            gBrowser,
            "https://example.com/source"
          );
          await SpecialPowers.spawn(browser, [], async () => {
            const page = content.document.querySelector("aitab-page");
            const header = page.shadowRoot.querySelector("aitab-header");
            await ContentTaskUtils.waitForCondition(
              () =>
                header.shadowRoot
                  .querySelector("ai-grouped-chip-container")
                  ?.shadowRoot.querySelector("smartwindow-panel-list"),
              "The header reference renders"
            );
            header.shadowRoot
              .querySelector("ai-grouped-chip-container")
              .shadowRoot.querySelector("smartwindow-panel-list")
              .dispatchEvent(
                new content.CustomEvent("item-selected", {
                  bubbles: true,
                  composed: true,
                  detail: Cu.cloneInto(
                    { id: "https://example.com/source" },
                    content
                  ),
                })
              );
          });
          const sourceTab = await opened;

          await actor.receiveMessage({
            name: "AITab:OpenLink",
            data: {
              url: "https://example.com/source",
              preferSwitchToTab: true,
              component_type: "Header",
            },
          });
          const clicks = Glean.smartWindow.aitabLinkClick.testGetValue();
          Assert.equal(
            clicks.length,
            2,
            "The open and the later switch are recorded"
          );
          Assert.equal(clicks[0].extra.component_type, "Header");
          Assert.equal(clicks[0].extra.result, "new");
          Assert.equal(clicks[1].extra.result, "switch");
          BrowserTestUtils.removeTab(sourceTab);

          const loose = BrowserTestUtils.waitForNewTab(
            gBrowser,
            "https://example.com/loose"
          );
          await SpecialPowers.spawn(browser, [], async () => {
            content.document.documentElement.dispatchEvent(
              new content.CustomEvent("AITab:OpenLink", {
                bubbles: true,
                composed: true,
                detail: Cu.cloneInto(
                  { url: "https://example.com/loose" },
                  content
                ),
              })
            );
          });
          BrowserTestUtils.removeTab(await loose);
          const looseClicks = Glean.smartWindow.aitabLinkClick.testGetValue();
          Assert.equal(
            looseClicks.length,
            3,
            "A click outside a block is recorded"
          );
          Assert.equal(looseClicks[2].extra.component_type, "unknown");
          Assert.equal(looseClicks[2].extra.result, "new");
        }
      );
    });

    it("records one delete", async () => {
      await BrowserTestUtils.withNewTab(
        `about:smartpage?page=${READY_SLUG}`,
        async browser => {
          await waitForReadyPage(browser);
          const actor =
            browser.browsingContext.currentWindowGlobal.getActor("AITab");
          Services.fog.testResetFOG();
          await actor.receiveMessage({ name: "AITab:DeletePage" });
          await actor.receiveMessage({ name: "AITab:DeletePage" });
          Assert.equal(
            Glean.smartWindow.aitabDelete.testGetValue().length,
            1,
            "Only a delete that removes a stored page is recorded"
          );
        }
      );
    });
  });
});

async function waitForReadyPage(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    await content.customElements.whenDefined("aitab-page");
    const page = content.document.querySelector("aitab-page").wrappedJSObject;
    await ContentTaskUtils.waitForCondition(
      () => page.status == "ready",
      "The stored page renders"
    );
  });
}
