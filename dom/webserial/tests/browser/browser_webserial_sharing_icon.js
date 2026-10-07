/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_URL =
  "https://example.com/document-builder.sjs?html=<h1>Test serial worker sharing icon</h1>";
const BASE = "https://example.com/browser/dom/webserial/tests/browser/";
const BLANK_URL = BASE + "blank.html";
const WORKER_URL = BASE + "worker_open_close.js";

function isIconVisible() {
  return BrowserTestUtils.isVisible(
    document.getElementById("serial-sharing-icon")
  );
}

function waitForIconVisible(msg) {
  return TestUtils.waitForCondition(isIconVisible, msg);
}

function waitForIconHidden(msg) {
  return TestUtils.waitForCondition(() => !isIconVisible(), msg);
}

// Requests a port in the given browsing context (using autoselect, optionally
// narrowed by filters) and opens it, keeping it reachable as content.testPort.
async function requestAndOpenPort(bc, filters = []) {
  await SpecialPowers.spawn(bc, [filters], async aFilters => {
    content.navigator.serial.autoselectPorts = true;
    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    content.testPort = await content.navigator.serial.requestPort({
      filters: aFilters,
    });
    await content.testPort.open({ baudRate: 9600 });
  });
}

// Starts a worker in the given browser that opens the first granted port and
// resolves once it reports the port is open. The worker is kept reachable as
// content.testWorker.
async function openPortFromWorker(browser) {
  await SpecialPowers.spawn(browser, [WORKER_URL], async url => {
    const worker = new content.Worker(url);
    content.testWorker = worker;
    await new Promise((resolve, reject) => {
      worker.onmessage = e => {
        if (e.data.type === "opened") {
          resolve();
        } else if (e.data.type === "error") {
          reject(new Error(e.data.message));
        }
      };
      worker.onerror = e => reject(new Error(e.message));
      worker.postMessage("open");
    });
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.webserial.gated", false]],
  });

  registerCleanupFunction(() => {
    while (gBrowser.tabs.length > 1) {
      BrowserTestUtils.removeTab(gBrowser.selectedTab);
    }
  });
});

add_task(async function testSharingIconAppearsFromWorker() {
  info("Test that the serial sharing icon appears when a worker opens a port");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);

  // Request the port from the window context (requestPort is Window-only)
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.navigator.serial.autoselectPorts = true;
    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    await content.navigator.serial.requestPort();
  });

  let serialIcon = document.getElementById("serial-sharing-icon");
  ok(serialIcon, "Serial sharing icon element should exist");
  ok(
    !BrowserTestUtils.isVisible(serialIcon),
    "Serial sharing icon should not be visible before port is opened"
  );

  // Spawn a worker and have it open the port
  await openPortFromWorker(gBrowser.selectedBrowser);

  info("Waiting for serial sharing icon to become visible");
  await TestUtils.waitForCondition(() => {
    return BrowserTestUtils.isVisible(
      document.getElementById("serial-sharing-icon")
    );
  }, "Serial sharing icon should be visible when worker has port open");

  // Now close the port from the worker
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await new Promise((resolve, reject) => {
      content.testWorker.onmessage = e => {
        if (e.data.type === "closed") {
          resolve();
        } else if (e.data.type === "error") {
          reject(new Error(e.data.message));
        }
      };
      content.testWorker.postMessage("close");
    });
  });

  info("Waiting for serial sharing icon to become hidden");
  await TestUtils.waitForCondition(() => {
    return !BrowserTestUtils.isVisible(
      document.getElementById("serial-sharing-icon")
    );
  }, "Serial sharing icon should be hidden after worker closes port");

  // Clean up the worker
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.testWorker.terminate();
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconWithMultiplePorts() {
  info(
    "Test that the serial sharing icon stays visible when one of two open ports is closed"
  );

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);

  // Request two different ports using USB vendor/product filters.
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.navigator.serial.autoselectPorts = true;

    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    content.testPort1 = await content.navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x2341, usbProductId: 0x0043 }],
    });

    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    content.testPort2 = await content.navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0403, usbProductId: 0x6002 }],
    });
  });

  let serialIcon = document.getElementById("serial-sharing-icon");
  ok(
    !BrowserTestUtils.isVisible(serialIcon),
    "Serial sharing icon should not be visible before any port is opened"
  );

  // Open port 1
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort1.open({ baudRate: 9600 });
  });

  info(
    "Waiting for serial sharing icon to become visible after opening port 1"
  );
  await TestUtils.waitForCondition(() => {
    return BrowserTestUtils.isVisible(
      document.getElementById("serial-sharing-icon")
    );
  }, "Serial sharing icon should be visible when port 1 is open");

  // Open port 2
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort2.open({ baudRate: 9600 });
  });

  // Allow the sharing state notification for port 2 to be processed
  await TestUtils.waitForTick();

  ok(
    BrowserTestUtils.isVisible(document.getElementById("serial-sharing-icon")),
    "Serial sharing icon should still be visible when both ports are open"
  );

  // Close port 1 while port 2 remains open
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort1.close();
  });

  // Allow the sharing state notification for port 1 close to be processed
  await TestUtils.waitForTick();

  ok(
    BrowserTestUtils.isVisible(document.getElementById("serial-sharing-icon")),
    "Serial sharing icon should still be visible when port 2 is still open"
  );

  // Close port 2
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort2.close();
  });

  info(
    "Waiting for serial sharing icon to become hidden after closing both ports"
  );
  await TestUtils.waitForCondition(() => {
    return !BrowserTestUtils.isVisible(
      document.getElementById("serial-sharing-icon")
    );
  }, "Serial sharing icon should be hidden after both ports are closed");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconReopen() {
  info("Test that the icon reappears when a port is closed and reopened");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  await requestAndOpenPort(gBrowser.selectedBrowser);
  await waitForIconVisible("Icon should be visible after first open");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort.close();
  });
  await waitForIconHidden("Icon should be hidden after first close");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort.open({ baudRate: 9600 });
  });
  await waitForIconVisible("Icon should be visible again after reopen");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    await content.testPort.close();
  });
  await waitForIconHidden("Icon should be hidden after second close");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconHiddenOnDeviceDisconnect() {
  info("Test that the icon hides when an open port's device is unplugged");

  const DEVICE_ID = "test-sharing-disconnect";
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [DEVICE_ID], async id => {
    await content.navigator.serial.simulateDeviceConnection(
      id,
      "/dev/ttyUSB90",
      0x1111,
      0x2222
    );
    content.navigator.serial.autoselectPorts = true;
    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    content.testPort = await content.navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x1111, usbProductId: 0x2222 }],
    });
    await content.testPort.open({ baudRate: 9600 });
  });
  await waitForIconVisible("Icon should be visible while the port is open");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [DEVICE_ID], async id => {
    const disconnected = new Promise(resolve => {
      content.testPort.addEventListener("disconnect", resolve, { once: true });
    });
    await content.navigator.serial.simulateDeviceDisconnection(id);
    await disconnected;
  });
  await waitForIconHidden("Icon should be hidden after the device disconnects");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconHiddenOnNavigation() {
  info("Test that the icon hides when a page with an open port navigates away");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  await requestAndOpenPort(gBrowser.selectedBrowser);
  await waitForIconVisible("Icon should be visible while the port is open");

  BrowserTestUtils.startLoadingURIString(gBrowser.selectedBrowser, BLANK_URL);
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
  await waitForIconHidden("Icon should be hidden after navigating away");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconHiddenOnWorkerTerminate() {
  info("Test that the icon hides when a worker holding an open port is killed");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.navigator.serial.autoselectPorts = true;
    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    await content.navigator.serial.requestPort();
  });

  await openPortFromWorker(gBrowser.selectedBrowser);
  await waitForIconVisible(
    "Icon should be visible while the worker's port is open"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    content.testWorker.terminate();
  });
  await waitForIconHidden(
    "Icon should be hidden after terminating the worker without closing"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingIconHiddenOnIframeRemoval() {
  info(
    "Test that a port opened in an iframe shows the icon and hides on removal"
  );

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  let browser = gBrowser.selectedBrowser;

  await SpecialPowers.spawn(browser, [BLANK_URL], async url => {
    const iframe = content.document.createElement("iframe");
    iframe.src = url;
    const loaded = new Promise(resolve => {
      iframe.addEventListener("load", resolve, { once: true });
    });
    content.document.body.appendChild(iframe);
    await loaded;
  });

  // Granted ports are tracked per window, so the same-origin iframe requests
  // and opens its own port. The sharing state must be attributed to the
  // top-level browser.
  let iframeBC = browser.browsingContext.children[0];
  ok(iframeBC, "Iframe browsing context should exist");
  await requestAndOpenPort(iframeBC);
  await waitForIconVisible(
    "Icon should be visible while the iframe's port is open"
  );

  await SpecialPowers.spawn(browser, [], () => {
    content.document.querySelector("iframe").remove();
  });
  await waitForIconHidden("Icon should be hidden after the iframe is removed");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function testSharingStateIsPerTab() {
  info("Test that closing a port in one tab does not affect another tab");

  // Each tab must open a different device; a port can only be open once.
  let tabA = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  await requestAndOpenPort(tabA.linkedBrowser, [
    { usbVendorId: 0x2341, usbProductId: 0x0043 },
  ]);
  await waitForIconVisible("Icon should be visible for tab A");

  let tabB = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  await requestAndOpenPort(tabB.linkedBrowser, [
    { usbVendorId: 0x0403, usbProductId: 0x6002 },
  ]);
  await waitForIconVisible("Icon should be visible for tab B");

  await SpecialPowers.spawn(tabA.linkedBrowser, [], async () => {
    await content.testPort.close();
  });
  await TestUtils.waitForCondition(
    () => !tabA.linkedBrowser._sharingState?.serial,
    "Tab A sharing state should be cleared"
  );
  is(
    tabB.linkedBrowser._sharingState?.serial,
    "serial",
    "Tab B sharing state should be unaffected"
  );
  ok(isIconVisible(), "Icon should remain visible for the selected tab B");

  await BrowserTestUtils.switchTab(gBrowser, tabA);
  await waitForIconHidden("Icon should be hidden when switching to tab A");

  await BrowserTestUtils.switchTab(gBrowser, tabB);
  await waitForIconVisible(
    "Icon should be visible when switching back to tab B"
  );

  await SpecialPowers.spawn(tabB.linkedBrowser, [], async () => {
    await content.testPort.close();
  });
  await waitForIconHidden("Icon should be hidden after tab B closes its port");

  BrowserTestUtils.removeTab(tabB);
  BrowserTestUtils.removeTab(tabA);
});

add_task(async function testSharingHelperCountClampsAtZero() {
  info(
    "Test that a stray disconnect notification cannot make the count negative"
  );

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  let browser = gBrowser.selectedBrowser;

  function notify(connected) {
    let props = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
      Ci.nsIWritablePropertyBag2
    );
    props.setPropertyAsUint64("browserId", browser.browserId);
    props.setPropertyAsBool("connected", connected);
    Services.obs.notifyObservers(props, "serial-device-state-changed");
  }

  notify(false);
  notify(false);
  ok(!isIconVisible(), "Icon should stay hidden after stray disconnects");

  notify(true);
  ok(
    isIconVisible(),
    "A single connect after stray disconnects should show the icon"
  );

  notify(false);
  ok(!isIconVisible(), "Icon should be hidden after the matching disconnect");

  BrowserTestUtils.removeTab(tab);
});
