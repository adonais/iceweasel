"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/gfx/layers/apz/test/mochitest/apz_test_utils.js",
  this
);

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/gfx/layers/apz/test/mochitest/apz_test_native_event_utils.js",
  this
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["general.autoScroll", true],
      ["middlemouse.contentLoadURL", false],
      ["test.events.async.enabled", true],
    ],
  });
});

function httpURL(filename) {
  const chromeURL = getRootDirectory(gTestPath) + filename;
  return chromeURL.replace(
    "chrome://mochitests/content/",
    "http://mochi.test:8888/"
  );
}

function getScrollY(context) {
  return SpecialPowers.spawn(context, [], () => content.scrollY);
}

async function doTest() {
  const pageUrl = httpURL("helper_test_autoscrolling_in_oop_frame.html");

  await BrowserTestUtils.withNewTab(pageUrl, async function (browser) {
    await promiseApzFlushedRepaintsInPopup(browser);

    const iframeContext = browser.browsingContext.children[0];
    await promiseApzFlushedRepaintsInPopup(iframeContext);

    const { screenX, screenY, viewId, presShellId } = await SpecialPowers.spawn(
      iframeContext,
      [],
      () => {
        const winUtils = SpecialPowers.getDOMWindowUtils(content);
        return {
          screenX: content.mozInnerScreenX * content.devicePixelRatio,
          screenY: content.mozInnerScreenY * content.devicePixelRatio,
          viewId: winUtils.getViewId(content.document.documentElement),
          presShellId: winUtils.getPresShellId(),
        };
      }
    );

    ok(
      iframeContext.startApzAutoscroll(
        screenX + 100,
        screenY + 50,
        viewId,
        presShellId
      ),
      "Started autscroll"
    );

    const scrollEventPromise = SpecialPowers.spawn(
      iframeContext,
      [],
      async () => {
        return new Promise(resolve => {
          content.addEventListener(
            "scroll",
            () => {
              dump("Got a scroll event in the iframe\n");
              resolve();
            },
            { once: true }
          );
        });
      }
    );

    // Send sequential mousemove events to cause autoscrolling.
    for (let i = 0; i < 10; i++) {
      await promiseNativeMouseEventWithAPZ({
        type: "mousemove",
        target: browser,
        offsetX: 100,
        offsetY: 50 + i * 10,
      });
    }

    // Flush APZ repaints and waits for MozAfterPaint to make sure the scroll has
    // been reflected on the main thread.
    const apzPromise = promiseApzFlushedRepaintsInPopup(browser);

    await Promise.all([apzPromise, scrollEventPromise]);

    const frameScrollY = await getScrollY(iframeContext);
    ok(frameScrollY > 0, "Autoscrolled the iframe");

    const rootScrollY = await getScrollY(browser);
    ok(rootScrollY == 0, "Didn't scroll the root document");

    iframeContext.stopApzAutoscroll(viewId, presShellId);
  });
}

add_task(async function test_autoscroll_in_oop_iframe() {
  await doTest();
});

add_task(async function test_autoscroll_in_oop_iframe_with_os_zoom() {
  await SpecialPowers.pushPrefEnv({ set: [["ui.textScaleFactor", 200]] });
  await doTest();
});

// The tests above start/stop autoscrolling by calling
// startApzAutoscroll()/stopApzAutoscroll() on the iframe's BrowsingContext
// directly, which never goes through AutoScrollChild/AutoScrollParent or
// MozBrowser.startScroll()/stopScroll(). This test instead drives
// autoscrolling with a real middle-click, so it actually exercises that
// actor/message path, in particular the routing of the "stop" request back
// to the iframe (rather than the tab's top-level document).
add_task(async function test_stopping_autoscroll_in_oop_iframe_stops_it() {
  if (
    AppConstants.platform == "linux" &&
    Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo).windowProtocol ==
      "wayland"
  ) {
    // Bug1857059: Synthesizing native mouse move events doesn't work on Wayland.
    ok(true, "Skipping test because this test doesn't work on wayland");
    return;
  }

  const pageUrl = httpURL("helper_test_autoscrolling_in_oop_frame.html");

  await BrowserTestUtils.withNewTab(pageUrl, async function (browser) {
    await promiseApzFlushedRepaintsInPopup(browser);

    const iframeContext = browser.browsingContext.children[0];
    await promiseApzFlushedRepaintsInPopup(iframeContext);

    let autoScroller;
    const waitForAutoScrollerOpen = BrowserTestUtils.waitForEvent(
      window,
      "popupshown",
      { capture: true },
      event => {
        if (event.originalTarget.id != "autoscroller") {
          return false;
        }
        autoScroller = event.originalTarget;
        autoScroller.getBoundingClientRect(); // Flush layout of the autoscroller
        return true;
      }
    );

    await promiseNativeMouseEventWithAPZ({
      type: "mousemove",
      target: browser,
      offsetX: 100,
      offsetY: 50,
    });
    await promiseNativeMouseEventWithAPZ({
      type: "mousedown",
      target: browser,
      offsetX: 100,
      offsetY: 50,
      button: 1, // middle click
    });
    await waitForAutoScrollerOpen;
    ok(true, "Autoscrolling was started via a real middle click");
    await promiseNativeMouseEventWithAPZ({
      type: "mouseup",
      target: browser,
      offsetX: 100,
      offsetY: 50,
      button: 1, // release implicit capture
    });

    // Move away from the start point so the iframe actually scrolls.
    const scrollEventPromise = SpecialPowers.spawn(iframeContext, [], () => {
      return new Promise(resolve =>
        content.addEventListener("scroll", () => resolve(), { once: true })
      );
    });
    for (let i = 0; i < 10; i++) {
      await promiseNativeMouseEventWithAPZ({
        type: "mousemove",
        target: browser,
        offsetX: 100,
        offsetY: 50 + i * 10,
      });
    }
    await scrollEventPromise;

    // Stop autoscrolling the way a user normally would.
    const waitForAutoScrollerClosed = BrowserTestUtils.waitForEvent(
      autoScroller,
      "popuphidden",
      { capture: true }
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await waitForAutoScrollerClosed;

    // If MozBrowser.stopScroll() routed the "stop" request (and the
    // stopApzAutoscroll() call) to the wrong BrowsingContext, e.g. the tab's
    // top-level one instead of the iframe's own, the iframe would never
    // learn that autoscrolling ended and would keep autoscrolling forever.
    // Give the (correctly routed) stop request some frames to be processed
    // before taking the first sample, then confirm scrolling has actually
    // settled.
    for (let i = 0; i < 15; i++) {
      await promiseFrame();
    }
    await promiseApzFlushedRepaintsInPopup(iframeContext);

    const scrollMaxY = await SpecialPowers.spawn(
      iframeContext,
      [],
      () => content.scrollMaxY
    );
    const scrollYRightAfterStop = await getScrollY(iframeContext);
    // Make sure the scroll offset hasn't yet reached to the bottom.
    isnot(scrollYRightAfterStop, scrollMaxY);

    for (let i = 0; i < 40; i++) {
      await promiseFrame();
    }
    await promiseApzFlushedRepaintsInPopup(iframeContext);
    const scrollYAfterWaiting = await getScrollY(iframeContext);

    is(
      scrollYAfterWaiting,
      scrollYRightAfterStop,
      "The iframe shouldn't keep autoscrolling after autoscroll has been stopped"
    );
  });
});
