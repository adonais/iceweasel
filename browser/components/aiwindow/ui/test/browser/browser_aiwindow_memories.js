/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MemoriesSchedulers } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesSchedulers.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  registerCleanupFunction(() => {
    AIWindow.uninit();
    AIWindow.init(window);
  });
});

describe("MemoriesSchedulers scheduling from AIWindow", () => {
  let stub;

  beforeEach(() => {
    stub = sinon.stub(MemoriesSchedulers, "maybeRunAndSchedule");
  });

  afterEach(() => {
    stub.restore();
    if (AIWindow.isAIWindowActive(window)) {
      AIWindow.toggleAIWindow(window, false);
    }
  });

  describe("toggling the main window", () => {
    it("calls maybeRunAndSchedule once when toggling to AI Window", () => {
      AIWindow.toggleAIWindow(window, true);

      Assert.ok(stub.calledOnce, "called once on toggle to AI Window");
      Assert.ok(
        document.documentElement.hasAttribute("ai-window"),
        "ai-window attribute is set after toggle"
      );
    });

    it("does not call maybeRunAndSchedule when toggling to Classic", () => {
      AIWindow.toggleAIWindow(window, true);
      // Only the toggle-off below should be counted
      stub.resetHistory();

      AIWindow.toggleAIWindow(window, false);

      Assert.ok(stub.notCalled, "not called on toggle to Classic");
      Assert.ok(
        !document.documentElement.hasAttribute("ai-window"),
        "ai-window attribute is removed after toggle"
      );
    });
  });

  describe("initializing against a new window", () => {
    let testWin;

    beforeEach(async () => {
      AIWindow.uninit();
      AIWindow.init(window);
      testWin = await BrowserTestUtils.openNewBrowserWindow({
        private: false,
      });
    });

    afterEach(async () => {
      await BrowserTestUtils.closeWindow(testWin);
      AIWindow.uninit();
      testWin = null;
    });

    it("calls maybeRunAndSchedule during init when window is AI Window", async () => {
      testWin.document.documentElement.setAttribute("ai-window", "");

      AIWindow.uninit();
      AIWindow.init(testWin);
      await testWin.delayedStartupPromise;

      Assert.ok(stub.calledOnce, "called once during AI Window init");
    });

    it("does not call maybeRunAndSchedule during init when window is not AI Window", () => {
      AIWindow.uninit();
      AIWindow.init(testWin);

      Assert.ok(stub.notCalled, "not called during classic window init");
    });

    it("still calls maybeRunAndSchedule for a later AI window even if an earlier window init() saw wasn't one", async () => {
      // beforeEach already called init() against `window` (not an AI
      // window) without an intervening uninit() - simulates a cold start
      // where the first window init() sees isn't yet the real AI window.
      testWin.document.documentElement.setAttribute("ai-window", "");

      AIWindow.init(testWin);
      await testWin.delayedStartupPromise;

      Assert.ok(
        stub.calledOnce,
        "called for a later AI window despite an earlier non-AI window init()"
      );
    });
  });

  describe("firstrun completing after an AI Window toggle", () => {
    beforeEach(async () => {
      await SpecialPowers.pushPrefEnv({
        set: [["browser.smartwindow.firstrun.hasCompleted", false]],
      });
      AIWindow.uninit();
      AIWindow.init(window);
    });

    afterEach(async () => {
      AIWindow.uninit();
      await SpecialPowers.popPrefEnv();
      AIWindow.init(window);
    });

    it("calls maybeRunAndSchedule when firstrun completes", () => {
      Services.prefs.setBoolPref(
        "browser.smartwindow.firstrun.hasCompleted",
        true
      );

      Assert.ok(stub.calledOnce, "called once when firstrun completes");
    });

    it("does not call maybeRunAndSchedule when firstrun is set to false", () => {
      Services.prefs.setBoolPref(
        "browser.smartwindow.firstrun.hasCompleted",
        true
      );
      // Only the false-transition below should be counted.
      stub.resetHistory();

      Services.prefs.setBoolPref(
        "browser.smartwindow.firstrun.hasCompleted",
        false
      );

      Assert.ok(stub.notCalled, "not called when firstrun is set to false");
    });
  });
});
