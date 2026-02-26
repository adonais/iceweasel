/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  SearchTestUtils: "resource://testing-common/SearchTestUtils.sys.mjs",
});

SearchTestUtils.init(this);

const SERVICE_EVENT_TYPE = "ContentSearchService";
const CLIENT_EVENT_TYPE = "ContentSearchClient";

var arrayBufferIconTested = false;
var plainURIIconTested = false;

function sendEventToContent(browser, data) {
  return SpecialPowers.spawn(
    browser,
    [CLIENT_EVENT_TYPE, data],
    (eventName, eventData) => {
      content.dispatchEvent(
        new content.CustomEvent(eventName, {
          detail: Cu.cloneInto(eventData, content),
        })
      );
    }
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtab.preload", false],
      ["browser.search.separatePrivateDefault.ui.enabled", true],
      ["browser.search.separatePrivateDefault", true],
    ],
  });

  await SearchTestUtils.installOpenSearchEngine({
    url: "chrome://mochitests/content/browser/browser/components/search/test/browser/testEngine.xml",
    setAsDefault: true,
  });

  await SearchTestUtils.installOpenSearchEngine({
    url: "chrome://mochitests/content/browser/browser/components/search/test/browser/testEngine_diacritics.xml",
    setAsDefaultPrivate: true,
  });

  await SearchTestUtils.installOpenSearchEngine({
    url: getRootDirectory(gTestPath) + "testEngine_chromeicon.xml",
  });

  // Install a WebExtension based engine to allow testing passing of plain
  // URIs (moz-extension://) to the content process.
  await SearchTestUtils.installSearchExtension({
    icons: {
      16: "favicon.ico",
    },
  });
});

add_task(async function test_GetEngine() {
  let { browser } = await addTab();
  let getPromise = await waitForTestMsg(browser, "Engine");
  sendEventToContent(browser, {
    type: "GetEngine",
  });
  let msg = await getPromise.donePromise;

  checkMsg(msg, {
    type: "Engine",
    data: {
      isPrivateEngine: false,
      engine: await constructEngineObj(await SearchService.getDefault()),
    },
  });
});

add_task(async function test_GetHandoffSearchModePrefs() {
  let { browser } = await addTab();
  let getPromise = await waitForTestMsg(browser, "HandoffSearchModePrefs");
  sendEventToContent(browser, {
    type: "GetHandoffSearchModePrefs",
  });
  let msg = await getPromise.donePromise;

  checkMsg(msg, {
    type: "HandoffSearchModePrefs",
    data: true,
  });
});

add_task(async function badImage() {
  let { browser } = await addTab();
  // If the bad image URI caused an exception to be thrown within ContentSearch,
  // then we'll hang waiting for the CurrentState responses triggered by the new
  // engine.  That's what we're testing, and obviously it shouldn't happen.
  let [engine, currentEngineMsg] = await waitForNewEngineAsDefault(
    browser,
    "contentSearchBadImage.xml"
  );
  let expectedCurrentState = await constructEngineObj(
    await SearchService.getDefault()
  );
  Assert.strictEqual(
    expectedCurrentState.iconData,
    "chrome://browser/skin/search-engine-placeholder.png",
    "Sanity check: icon of engine in expected state should be the placeholder: " +
      expectedCurrentState.iconData
  );
  checkMsg(currentEngineMsg, {
    type: "CurrentEngine",
    data: expectedCurrentState,
  });
  // Removing the engine triggers a final CurrentState message.  Wait for it so
  // it doesn't trip up subsequent tests.
  let statePromise = await waitForTestMsg(browser, "CurrentEngine");
  await SearchService.removeEngine(engine);
  await statePromise.donePromise;
});

function buffersEqual(actualArrayBuffer, expectedArrayBuffer) {
  let expectedView = new Int8Array(expectedArrayBuffer);
  let actualView = new Int8Array(actualArrayBuffer);
  for (let i = 0; i < expectedView.length; i++) {
    if (actualView[i] != expectedView[i]) {
      return false;
    }
  }
  return true;
}

function arrayBufferEqual(actualArrayBuffer, expectedArrayBuffer) {
  ok(actualArrayBuffer instanceof ArrayBuffer, "Actual value is ArrayBuffer.");
  ok(
    expectedArrayBuffer instanceof ArrayBuffer,
    "Expected value is ArrayBuffer."
  );
  Assert.equal(
    actualArrayBuffer.byteLength,
    expectedArrayBuffer.byteLength,
    "Array buffers have the same length."
  );
  ok(
    buffersEqual(actualArrayBuffer, expectedArrayBuffer),
    "Buffers are equal."
  );
}

function checkArrayBuffers(actual, expected) {
  if (actual instanceof ArrayBuffer) {
    arrayBufferEqual(actual, expected);
  }
  if (typeof actual == "object") {
    for (let i in actual) {
      checkArrayBuffers(actual[i], expected[i]);
    }
  }
}

function checkMsg(actualMsg, expectedMsgData) {
  SimpleTest.isDeeply(actualMsg, expectedMsgData, "Checking message");

  // Engines contain ArrayBuffers which we have to compare byte by byte and
  // not as Objects (like SimpleTest.isDeeply does).
  checkArrayBuffers(actualMsg, expectedMsgData);
}

async function waitForTestMsg(browser, type) {
  // We call SpecialPowers.spawn twice because we must let the first one
  // complete so that the listener is added before we return from this function.
  // In the second one, we wait for the signal that the expected message has
  // been received.
  await SpecialPowers.spawn(
    browser,
    [SERVICE_EVENT_TYPE, type],
    async (childEvent, childType) => {
      function listener(event) {
        if (event.detail.type != childType) {
          return;
        }

        content.eventDetails = event.detail;
        content.removeEventListener(childEvent, listener, true);
      }
      // Ensure any previous details are cleared, so that we don't
      // get the wrong ones by mistake.
      content.eventDetails = undefined;
      content.addEventListener(childEvent, listener, true);
    }
  );

  let donePromise = SpecialPowers.spawn(browser, [type], async childType => {
    await ContentTaskUtils.waitForCondition(
      () => {
        return !!content.eventDetails;
      },
      "Expected " + childType + " event"
    );
    return content.eventDetails;
  });

  return { donePromise };
}

async function waitForNewEngineAsDefault(browser, basename) {
  info("Waiting for engine to be added: " + basename);

  // Wait for the search events triggered by adding the new engine.
  // There are two events triggerd by engine-added and engine-loaded
  let statePromise = await waitForTestMsg(browser, "CurrentEngine");

  let engine = await SearchTestUtils.installOpenSearchEngine({
    url: getRootDirectory(gTestPath) + basename,
  });
  await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);

  return [engine, await statePromise.donePromise];
}

async function addTab() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab"
  );
  registerCleanupFunction(() => gBrowser.removeTab(tab));

  return { browser: tab.linkedBrowser };
}

var currentStateObj = async function (hiddenEngine = "") {
  let state = {
    engines: [],
    currentEngine: await constructEngineObj(await SearchService.getDefault()),
    currentPrivateEngine: await constructEngineObj(
      await SearchService.getDefaultPrivate()
    ),
  };
  for (let engine of await SearchService.getVisibleEngines()) {
    let uri = await engine.getIconURL(16);
    state.engines.push({
      name: engine.name,
      iconData: await iconDataFromURI(uri),
      hidden: engine.name == hiddenEngine,
      isConfigEngine: engine.isConfigEngine,
    });
  }
  return state;
};

async function constructEngineObj(engine) {
  let uriFavicon = await engine.getIconURL(16);
  return {
    name: engine.name,
    iconData: await iconDataFromURI(uriFavicon),
    isConfigEngine: engine.isConfigEngine,
  };
}

async function iconDataFromURI(uri) {
  if (!uri) {
    return "chrome://browser/skin/search-engine-placeholder.png";
  }

  if (!uri.startsWith("data:") && !uri.startsWith("blob:")) {
    plainURIIconTested = true;
    return uri;
  }

  try {
    const response = await fetch(uri);
    const mimeType = response.headers.get("Content-Type") || "";
    const data = await response.arrayBuffer();
    arrayBufferIconTested = true;
    return { icon: data, mimeType };
  } catch (err) {
    console.error("Fetch error: ", err);
    return "chrome://browser/skin/search-engine-placeholder.png";
  }
}
