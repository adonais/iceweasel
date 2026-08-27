/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Bug 1407366 - A test case for reassuring the size of the content viewport is
 *   rounded if the window is resized when letterboxing is enabled.
 *
 * A helpful note: if this test starts randomly failing; it may be because the
 * zoom level was not reset by an earlier-run test. See Bug 1407366 for an
 * example.
 */

const { RFPHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/RFPHelper.sys.mjs"
);

// A set of test cases which defines the width and the height of the outer window.
const TEST_CASES = [
  { width: 1250, height: 1000 },
  { width: 1500, height: 1050 },
  { width: 1120, height: 760 },
  { width: 800, height: 600 },
  { width: 640, height: 400 },
  { width: 500, height: 350 },
];

const DEFAULT_URL = TEST_PATH + "file_dummy.html";

const TEST_EXTENSION_DATA = {
  manifest: {
    name: "Test Extension",
  },
  files: {
    "test.html": "Test",
  },
};

function getPlatform() {
  const { OS } = Services.appinfo;
  if (OS == "WINNT") {
    return "win";
  } else if (OS == "Darwin") {
    return "mac";
  }
  return "linux";
}

async function waitForLetterboxing() {
  await TestUtils.topicObserved("test:letterboxing:update-size-finish");
}

function handleOSFuzziness(aContent, aTarget) {
  /*
   * On Windows, we observed off-by-one pixel differences that
   * couldn't be expained. When manually setting the window size
   * to try to reproduce it; it did not occur.
   */
  if (getPlatform() == "win") {
    return Math.abs(aContent - aTarget) <= 1;
  }
  return aContent == aTarget;
}

function checkForDefaultSetting(
  aContentWidth,
  aContentHeight,
  aRealWidth,
  aRealHeight
) {
  // We can get the rounded size by subtracting twice the margin.
  let targetWidth = RFPHelper.steppedSize(aRealWidth, true);
  let targetHeight = RFPHelper.steppedSize(aRealHeight);

  return {
    widthMatches: handleOSFuzziness(aContentWidth, targetWidth),
    heightMatches: handleOSFuzziness(aContentHeight, targetHeight),
    assert() {
      ok(
        this.widthMatches,
        `Default Dimensions: The content window width is correctly rounded into. ${aRealWidth}px -> ${aContentWidth}px should equal ${targetWidth}px`
      );
      ok(
        this.heightMatches,
        `Default Dimensions: The content window height is correctly rounded into. ${aRealHeight}px -> ${aContentHeight}px should equal ${targetHeight}px`
      );
    },
  };
}

function test_letterboxing_css_rule() {
  ok(
    RFPHelper.getLetterboxingDefaultRule(
      window.gBrowser.documentGlobal.document
    ),
    "We can find the letterboxing CSS rules to dynamically update."
  );
}

async function test_dynamical_window_rounding(aWindow, aURL, aCheckFunc) {
  // We need to wait for the updating the size for the newly opened tab, or it
  // will affect the following tests.
  let promiseForTheFirstRounding = waitForLetterboxing();

  info(`Open a content tab on ${aURL} for testing.`);
  let tab = await BrowserTestUtils.openNewForegroundTab(aWindow.gBrowser, aURL);

  info("Wait until the size is set for the opened tab.");
  await promiseForTheFirstRounding;

  let getContainerSize = aTab => {
    let browserContainer = aWindow.gBrowser.getBrowserContainer(
      aTab.linkedBrowser
    );
    return {
      containerWidth: browserContainer.clientWidth,
      containerHeight: browserContainer.clientHeight,
    };
  };

  for (let { width, height } of TEST_CASES) {
    let caseString = `Case ${width}x${height}:`;
    // Create a promise for waiting for the size update.
    let promiseRounding = waitForLetterboxing();

    let { containerWidth, containerHeight } = getContainerSize(tab);

    info(
      `${caseString} Resize the window and wait until resize event happened (currently ${containerWidth}x${containerHeight})`
    );
    await new Promise(resolve => {
      ({ containerWidth, containerHeight } = getContainerSize(tab));
      info(
        `${caseString} Resizing (currently ${containerWidth}x${containerHeight})`
      );

      // Resizing is asynchronous. On Linux an onresize can fire reporting an
      // earlier requested dimension (see 1407366#53); previously the test tried
      // to redo the resize when the browser container didn't match the
      // requested width, but under browser.nova.enabled the container can never
      // equal the requested outer width (the chrome consumes a different amount
      // of space), so that redo looped forever with no size change and timed
      // out (bug 2054792). We instead resolve on the first onresize and let the
      // waitForCondition below cope with stale/intermediate sizes by re-reading
      // both the container and the content until the rounding settles.
      aWindow.onresize = () => {
        ({ containerWidth, containerHeight } = getContainerSize(tab));
        info(
          `${caseString} Resized (currently ${containerWidth}x${containerHeight})`
        );
        resolve();
      };
      aWindow.resizeTo(width, height);
    });

    ({ containerWidth, containerHeight } = getContainerSize(tab));
    info(
      `${caseString} Waiting until sizes have been updated on browser element (currently ${containerWidth}x${containerHeight}).`
    );
    await promiseRounding;

    // The container and the content viewport can settle over more than one
    // layout pass (e.g. under browser.nova.enabled the content area sits in a
    // flex container whose size lags the window resize by a frame, so
    // letterboxing rounds more than once before reaching its final size; see
    // bug 2054792). Re-read the container on every iteration and compare it
    // against a freshly-read content size so both come from the same settled
    // layout generation, then wait for the rounding to reach its fixed point.
    info(`${caseString} Get innerWidth/Height from the content.`);
    let result;
    await TestUtils.waitForCondition(async () => {
      ({ containerWidth, containerHeight } = getContainerSize(tab));
      let { contentWidth, contentHeight } = await SpecialPowers.spawn(
        tab.linkedBrowser,
        [],
        () => {
          return {
            contentWidth: content.innerWidth,
            contentHeight: content.innerHeight,
          };
        }
      );

      info(
        `${caseString} Check the result (container ${containerWidth}x${containerHeight}, content ${contentWidth}x${contentHeight}).`
      );
      result = aCheckFunc(
        contentWidth,
        contentHeight,
        containerWidth,
        containerHeight
      );
      return result.widthMatches && result.heightMatches;
    }, "The content window is correctly rounded into.").catch(() => {});

    // Assert the final result once, so a case that never settles reports a
    // meaningful width/height mismatch rather than a bare timeout.
    result.assert();
  }

  BrowserTestUtils.removeTab(tab);
}

async function test_customize_width_and_height(aWindow, aURL) {
  const test_dimensions = `120x80, 200x143, 335x255, 600x312, 742x447, 813x558,
                           990x672, 1200x733, 1470x858`;

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.resistFingerprinting.letterboxing.dimensions", test_dimensions],
    ],
  });

  let dimensions_set = test_dimensions.split(",").map(item => {
    let sizes = item.split("x").map(size => parseInt(size, 10));

    return {
      width: sizes[0],
      height: sizes[1],
    };
  });

  let checkDimension = (
    aContentWidth,
    aContentHeight,
    aRealWidth,
    aRealHeight
  ) => {
    let matchingArea = aRealWidth * aRealHeight;
    let minWaste = Number.MAX_SAFE_INTEGER;
    let targetDimensions = undefined;

    // Find the dimensions which waste the least content area.
    for (let dim of dimensions_set) {
      if (dim.width > aRealWidth || dim.height > aRealHeight) {
        continue;
      }

      let waste = matchingArea - dim.width * dim.height;

      if (waste >= 0 && waste < minWaste) {
        targetDimensions = dim;
        minWaste = waste;
      }
    }

    return {
      widthMatches: handleOSFuzziness(aContentWidth, targetDimensions.width),
      heightMatches: handleOSFuzziness(aContentHeight, targetDimensions.height),
      assert() {
        ok(
          this.widthMatches,
          `Custom Dimension: The content window width is correctly rounded into. ${aRealWidth}px -> ${aContentWidth}px should equal ${targetDimensions.width}`
        );
        ok(
          this.heightMatches,
          `Custom Dimension: The content window height is correctly rounded into. ${aRealHeight}px -> ${aContentHeight}px should equal ${targetDimensions.height}`
        );
      },
    };
  };

  await test_dynamical_window_rounding(aWindow, aURL, checkDimension);

  await SpecialPowers.popPrefEnv();
}

async function test_no_rounding(aWindow, aTab, aDetail) {
  // Make sure we are ready, first.
  await aWindow.promiseDocumentFlushed(() => {});
  // Check that inner and outer have the same size.
  let stack = aTab.linkedBrowser.closest(".browserStack");
  let outer = stack.getBoundingClientRect();
  let inner = aTab.linkedBrowser.getBoundingClientRect();
  is(
    outer.width,
    inner.width,
    `Outer and inner widths are the same for an exempt tab (${aDetail}).`
  );
  is(
    outer.height,
    inner.height,
    `Outer and inner heights are the same for an exempt tab (${aDetail}).`
  );
}

async function test_no_rounding_for(aWindow, aURL) {
  const resize = (width, height) => {
    let { promise, resolve } = Promise.withResolvers();
    aWindow.onresize = () => resolve();
    aWindow.resizeTo(width, height);
    return promise;
  };
  // First, resize the window to a size which is not rounded by default.
  await resize(750, 450);
  let tab = await BrowserTestUtils.openNewForegroundTab(aWindow.gBrowser, aURL);
  await test_no_rounding(aWindow, tab, aURL);
  // Resize the window to another size, so that the next call to this test will
  // need to resize. Trying to figure out whether we needed to resize led to
  // strange test timeouts.
  await resize(800, 500);
  BrowserTestUtils.removeTab(tab);
}

async function test_no_rounding_fullscreen(aWindow) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    aWindow.gBrowser,
    DEFAULT_URL
  );
  let { promise: focusPromise, resolve } = Promise.withResolvers();
  SimpleTest.waitForFocus(resolve, tab.linkedBrowser.documentGlobal);
  await focusPromise;
  let fullscreenPromise = BrowserTestUtils.waitForContentEvent(
    tab.linkedBrowser,
    "fullscreenchange"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.body.requestFullscreen();
  });
  await fullscreenPromise;
  await test_no_rounding(aWindow, tab, "fullscreen");
  fullscreenPromise = BrowserTestUtils.waitForContentEvent(
    tab.linkedBrowser,
    "fullscreenchange"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.exitFullscreen();
  });
  // Sometimes exiting from fullscreen on Windows take a lot of time, and it
  // interferes with the creation of the second window, making the test
  // timeout.
  await fullscreenPromise;
  BrowserTestUtils.removeTab(tab);
}

// Tests that the findbar opening and closing causes a size update.
async function test_findbar(aWindow) {
  // First, resize the window to a size which is not rounded.
  await new Promise(resolve => {
    aWindow.onresize = () => resolve();
    aWindow.resizeTo(701, 451);
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    aWindow.gBrowser,
    TEST_PATH + "file_dummy.html"
  );

  let promiseRounding = waitForLetterboxing();

  let findBarOpenPromise = BrowserTestUtils.waitForEvent(
    aWindow,
    "findbaropen"
  );
  EventUtils.synthesizeKey("F", { accelKey: true }, aWindow);
  await findBarOpenPromise;
  await promiseRounding;

  ok(true, "Size updated when findbar opened");

  promiseRounding = waitForLetterboxing();

  let findBarClosePromise = BrowserTestUtils.waitForEvent(
    aWindow,
    "findbarclose"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, aWindow);
  await findBarClosePromise;
  await promiseRounding;

  ok(true, "Size updated when findbar closed");

  BrowserTestUtils.removeTab(tab);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.wait300msAfterTabSwitch", true],
      ["privacy.resistFingerprinting.letterboxing", true],
      ["privacy.resistFingerprinting.letterboxing.testing", true],
    ],
  });
});

add_task(async function do_tests() {
  // Store the original window size before testing.
  let originalOuterWidth = window.outerWidth;
  let originalOuterHeight = window.outerHeight;

  test_letterboxing_css_rule();

  info("Run test for the default window rounding.");
  await test_dynamical_window_rounding(
    window,
    DEFAULT_URL,
    checkForDefaultSetting
  );
  await test_dynamical_window_rounding(
    window,
    "about:blank",
    checkForDefaultSetting
  );

  info("Run test for the window rounding with customized dimensions.");
  await test_customize_width_and_height(window, DEFAULT_URL);
  await test_customize_width_and_height(window, "about:blank");

  info("Run test for no letterboxing around tab with the chrome privilege.");
  await test_no_rounding_for(window, "about:config");

  info("Run test for no letterboxing around pdf.js.");
  await test_no_rounding_for(window, TEST_PATH + "file_pdf.pdf");

  info("Run test for no letterboxing around view-source: tab.");
  await test_no_rounding_for(window, `view-source:${DEFAULT_URL}`);

  info("Run test for no letterboxing around extension tabs.");
  let extension = ExtensionTestUtils.loadExtension(TEST_EXTENSION_DATA);
  await extension.startup();
  await test_no_rounding_for(
    window,
    `moz-extension://${extension.uuid}/test.html`
  );

  info("Run test for no letterboxing on fullscreen");
  await test_no_rounding_fullscreen(window);

  info("Run test for no findbar size leaks");
  await test_findbar(window);

  // Restore the original window size.
  window.outerWidth = originalOuterWidth;
  window.outerHeight = originalOuterHeight;

  // Testing that whether the dynamical rounding works for new windows.
  info("Opening a new window for repeating the tests there.");
  let win = await BrowserTestUtils.openNewBrowserWindow();

  info("Run test for the default window rounding in new window.");
  await test_dynamical_window_rounding(
    win,
    DEFAULT_URL,
    checkForDefaultSetting
  );
  await test_dynamical_window_rounding(
    win,
    "about:blank",
    checkForDefaultSetting
  );

  info(
    "Run test for the window rounding with customized dimensions in new window."
  );
  await test_customize_width_and_height(win, DEFAULT_URL);
  await test_customize_width_and_height(win, "about:blank");

  info(
    "Run test for no letterboxing around tab with the chrome privilege in new window."
  );
  await test_no_rounding_for(win, "about:config");

  info("Run test for no letterboxing around pdf.js in new window.");
  await test_no_rounding_for(win, TEST_PATH + "file_pdf.pdf");

  info("Run test for no letterboxing around view-source: tab in new window.");
  await test_no_rounding_for(win, `view-source:${DEFAULT_URL}`);

  info("Run test for no letterboxing around extension tabs in new window.");
  await test_no_rounding_for(
    win,
    `moz-extension://${extension.uuid}/test.html`
  );

  await test_findbar(win);

  await BrowserTestUtils.closeWindow(win);

  await extension.unload();
});
