// Number of bits in the canvas that we randomize when canvas randomization is
// enabled.
const NUM_RANDOMIZED_CANVAS_BITS = 256;

/**
 * Compares two Uint8Arrays and returns the number of bits that are different.
 *
 * @param {Uint8ClampedArray} arr1 - The first Uint8ClampedArray to compare.
 * @param {Uint8ClampedArray} arr2 - The second Uint8ClampedArray to compare.
 * @returns {number} - The number of bits that are different between the two
 *                     arrays.
 */
function countDifferencesInUint8Arrays(arr1, arr2) {
  let count = 0;
  for (let i = 0; i < arr1.length; i++) {
    let diff = arr1[i] ^ arr2[i];
    while (diff > 0) {
      count += diff & 1;
      diff >>= 1;
    }
  }
  return count;
}

/**
 * Compares two ArrayBuffer objects to see if they are different.
 *
 * @param {ArrayBuffer} buffer1 - The first buffer to compare.
 * @param {ArrayBuffer} buffer2 - The second buffer to compare.
 * @returns {boolean} True if the buffers are different, false if they are the
 *                    same.
 */
function countDifferencesInArrayBuffers(buffer1, buffer2) {
  // compare the byte lengths of the two buffers
  if (buffer1.byteLength !== buffer2.byteLength) {
    return true;
  }

  // create typed arrays to represent the two buffers
  const view1 = new DataView(buffer1);
  const view2 = new DataView(buffer2);

  let differences = 0;
  // compare the byte values of the two typed arrays
  for (let i = 0; i < buffer1.byteLength; i++) {
    if (view1.getUint8(i) !== view2.getUint8(i)) {
      differences += 1;
    }
  }

  // the two buffers are the same
  return differences;
}

function isDataRandomizedFuzzy(name, data1, data2, isCompareOriginal) {
  let diffCnt = countDifferencesInUint8Arrays(data1, data2);
  info(`For ${name} there are ${diffCnt} bits are different.`);

  // The Canvas randomization adds at most 512 bits noise to the image data.
  // We compare the image data arrays to see if they are different and the
  // difference is within the range.

  // If we are compare two randomized arrays, the difference can be doubled.
  let expected = isCompareOriginal
    ? NUM_RANDOMIZED_CANVAS_BITS
    : NUM_RANDOMIZED_CANVAS_BITS * 2;

  // The number of difference bits should never bigger than the expected
  // number. It could be zero if the randomization is disabled.
  Assert.lessOrEqual(
    diffCnt,
    expected,
    "The number of noise bits is expected."
  );

  return diffCnt <= expected && diffCnt > 0;
}

function isDataRandomizedNotEqual(name, data1, data2) {
  return data1 !== data2;
}

function isDataRandomizedGreaterThanZero(name, data1, data2) {
  let diffCnt = countDifferencesInArrayBuffers(data1, data2);
  info(`For ${name} there are ${diffCnt} bits are different.`);
  return diffCnt > 0;
}

function promiseObserver(topic) {
  return new Promise(resolve => {
    let obs = (aSubject, aTopic) => {
      Services.obs.removeObserver(obs, aTopic);
      resolve(aSubject);
    };
    Services.obs.addObserver(obs, topic);
  });
}

/**
 *
 * Spawns a worker in the given browser and sends a callback function to it.
 * The result of the callback function is returned as a Promise.
 *
 * @param {object} browser - The browser context to spawn the worker in.
 * @param {Function} fn - The callback function to send to the worker.
 * @returns {Promise} A Promise that resolves to the result of the callback function.
 */
function runFunctionInWorker(browser, fn) {
  return SpecialPowers.spawn(browser, [fn.toString()], async callback => {
    // Create a worker.
    let worker = new content.Worker("worker.js");

    // Send the callback to the worker.
    return new content.Promise(resolve => {
      worker.onmessage = e => {
        resolve(e.data.result);
      };

      worker.postMessage({
        callback,
      });
    });
  });
}

/**
 *
 * Spawns a service worker in the given browser and sends a callback function to it.
 * The result of the callback function is returned as a Promise.
 *
 * @param {object} browser - The browser context to spawn the service worker in.
 * @param {Function} fn - The callback function to send to the service worker.
 * @returns {Promise} A Promise that resolves to the result of the callback function.
 */
function runFunctionInServiceWorker(browser, fn) {
  return SpecialPowers.spawn(browser, [fn.toString()], async callback => {
    // Create a service worker.
    const sw = await content.navigator.serviceWorker.register(
      "serviceWorkerTester.js",
      {
        scope: content.location.pathname,
      }
    );

    return new content.Promise(resolve => {
      content.navigator.serviceWorker.addEventListener("message", async e => {
        await sw.unregister();
        resolve(e.data.result);
      });

      content.navigator.serviceWorker.ready.then(registration => {
        registration.active.postMessage({
          callback,
        });
      });
    });
  });
}

/**
 *
 * Runs a callback against a fresh tab with the service worker test prefs and the
 * given prefs pushed. The tab, the site data it created and the pref
 * environment are torn down unconditionally, so a failing callback cannot leak
 * state into later tasks.
 *
 * @param {Array} prefs - Additional pref pairs to push for the callback.
 * @param {string} url - The page to load in the tab.
 * @param {Function} callback - Called with the tab's browser.
 * @returns {Promise} A Promise that resolves to the result of the callback.
 */
async function withServiceWorkerTab(prefs, url, callback) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.serviceWorkers.enabled", true],
      ["dom.serviceWorkers.testing.enabled", true],
      ["dom.serviceWorkers.exemptFromPerDomainMax", true],
      ...prefs,
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);
  try {
    return await callback(tab.linkedBrowser);
  } finally {
    await BrowserTestUtils.removeTab(tab);
    await new Promise(resolve => {
      Services.clearData.deleteData(Ci.nsIClearDataService.CLEAR_ALL, () =>
        resolve()
      );
    });
    await SpecialPowers.popPrefEnv();
  }
}

/**
 *
 * Reports whether a timestamp is rounded to the expected precision. The epsilon
 * is absolute because for ms-since-epoch values a double's precision is around
 * 1/5 of a microsecond, where a relative comparison is below one ulp. Mirrors
 * the helper of the same name in
 * browser/components/resistfingerprinting/test/browser/head.js.
 *
 * @param {number} value - The timestamp to check, in milliseconds.
 * @param {number} expectedPrecision - The expected resolution, in milliseconds.
 * @returns {boolean} Whether the value is rounded to that resolution.
 */
function isTimeValueRounded(value, expectedPrecision) {
  const nearestExpected =
    Math.round(value / expectedPrecision) * expectedPrecision;
  if (value === nearestExpected) {
    return true;
  }

  if (Math.abs(value - nearestExpected) < 0.0005) {
    return true;
  }

  // A sub-millisecond resolution cannot be observed through a value that only
  // has millisecond resolution, such as Date.now().
  if (
    Math.round(expectedPrecision) != expectedPrecision &&
    Math.round(value) == value
  ) {
    return (
      Math.floor(nearestExpected) == value ||
      Math.ceil(nearestExpected) == value
    );
  }

  return false;
}

const TEST_EMPTY_PAGE =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "empty.html";
const TEST_FIRST_PARTY_CONTEXT_PAGE =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.net"
  ) + "testPage.html";
const TEST_THIRD_PARTY_CONTEXT_PAGE =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "scriptExecPage.html";

/**
 * Executes provided callbacks in both first and third party contexts.
 *
 * @param {string} name - Name of the test.
 * @param {Function} firstPartyCallback - The callback to be executed in the first-party context.
 * @param {Function} thirdPartyCallback - The callback to be executed in the third-party context.
 * @param {Function} [cleanupFunction] - A cleanup function to be called after the tests.
 * @param {Array} [extraPrefs] - Optional. An array of preferences to be set before running the test.
 */
function runTestInFirstAndThirdPartyContexts(
  name,
  firstPartyCallback,
  thirdPartyCallback,
  cleanupFunction,
  extraPrefs
) {
  add_task(async _ => {
    info("Starting test `" + name + "' in first and third party contexts");

    await SpecialPowers.flushPrefEnv();

    if (extraPrefs && Array.isArray(extraPrefs) && extraPrefs.length) {
      await SpecialPowers.pushPrefEnv({ set: extraPrefs });
    }

    info("Creating a new tab");
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      TEST_FIRST_PARTY_CONTEXT_PAGE
    );

    info("Creating a 3rd party content and a 1st party popup");
    let firstPartyPopupPromise = BrowserTestUtils.waitForNewTab(
      gBrowser,
      TEST_THIRD_PARTY_CONTEXT_PAGE,
      true
    );

    let thirdPartyBC = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [TEST_THIRD_PARTY_CONTEXT_PAGE],
      async url => {
        let ifr = content.document.createElement("iframe");

        await new content.Promise(resolve => {
          ifr.onload = resolve;

          ifr.src = url;
          content.document.body.appendChild(ifr);
        });

        content.open(url);

        return ifr.browsingContext;
      }
    );
    let firstPartyTab = await firstPartyPopupPromise;
    let firstPartyBrowser = firstPartyTab.linkedBrowser;

    info("Sending code to the 3rd party content and the 1st party popup");
    let runningCallbackTask = async obj => {
      return new content.Promise(resolve => {
        content.postMessage({ callback: obj.callback }, "*");

        content.addEventListener("message", function msg(event) {
          // This is the event from above postMessage.
          if (event.data.callback) {
            return;
          }

          if (event.data.type == "finish") {
            content.removeEventListener("message", msg);
            resolve();
            return;
          }

          if (event.data.type == "ok") {
            ok(event.data.what, event.data.msg);
            return;
          }

          if (event.data.type == "info") {
            info(event.data.msg);
            return;
          }

          ok(false, "Unknown message");
        });
      });
    };

    let firstPartyTask = SpecialPowers.spawn(
      firstPartyBrowser,
      [
        {
          callback: firstPartyCallback.toString(),
        },
      ],
      runningCallbackTask
    );

    let thirdPartyTask = SpecialPowers.spawn(
      thirdPartyBC,
      [
        {
          callback: thirdPartyCallback.toString(),
        },
      ],
      runningCallbackTask
    );

    await Promise.all([firstPartyTask, thirdPartyTask]);

    info("Removing the tab");
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(firstPartyTab);
  });

  add_task(async _ => {
    info("Cleaning up.");
    if (cleanupFunction) {
      await cleanupFunction();
    }
  });
}
