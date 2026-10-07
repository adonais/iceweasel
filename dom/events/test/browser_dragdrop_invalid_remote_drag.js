"use strict";

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const ATTACKER_URL =
  "https://example.com/browser/dom/events/test/file_empty.html";

let gMockDragService;

// Synthesize mouse events from the content process to trigger a drag,
// simulating an arbitrary drag invocation from the content process without
// any valid drag state in the parent process.
async function triggerInvalidDragFromContent(browser, marker) {
  await SpecialPowers.spawn(browser, [marker], async marker => {
    let source = content.document.createElement("div");
    source.draggable = true;
    source.style.cssText =
      "width: 100px; height: 100px; background-color: green";
    source.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", marker);
      event.dataTransfer.effectAllowed = "copy";
    });
    content.document.body.append(source);

    let dragStartPromise = new Promise(resolve => {
      source.addEventListener("dragstart", resolve, { once: true });
    });

    let event = { isSynthesized: false, button: 0, buttons: 1 };
    event.type = "mousedown";
    EventUtils.synthesizeMouse(source, 1, 1, event, content);

    event.type = "mousemove";
    EventUtils.synthesizeMouse(source, 3, 3, event, content);
    EventUtils.synthesizeMouse(source, 31, 31, event, content);

    // Intentionally not synthesizing a mouseup event to avoid drag session
    // being terminated from content process.

    await dragStartPromise;
  });
  // Wait for the drag to be processed.
  await SpecialPowers.spawn(browser, [], async () => {
    return new Promise(resolve => {
      SpecialPowers.executeSoon(resolve);
    });
  });
}

async function triggerChromeDrag(marker) {
  let node = document.createXULElement("toolbarbutton");
  node.setAttribute("label", "Chrome drag target");
  node.style.cssText = "min-width: 180px; min-height: 40px; background: orange";
  document.getElementById("navigator-toolbox").append(node);
  registerCleanupFunction(() => node.remove());

  node.addEventListener(
    "dragstart",
    event => {
      event.dataTransfer.setData("text/plain", marker);
      event.dataTransfer.setData("text/html", `<div>${marker}</div>`);
      event.dataTransfer.effectAllowed = "copy";
    },
    { once: true }
  );

  let event = { isSynthesized: false, button: 0, buttons: 1 };
  event.type = "mousedown";
  EventUtils.synthesizeMouse(node, 1, 1, event, window);

  event.type = "mousemove";
  EventUtils.synthesizeMouse(node, 3, 3, event, window);
  EventUtils.synthesizeMouse(node, 31, 31, event, window);

  let session = gMockDragService.getCurrentSession(window);
  ok(session, "Should have a drag session");

  let dataTransferSnapshot = {
    types: Array.from(session?.dataTransfer.types),
    plainText: session?.dataTransfer.getData("text/plain"),
    htmlText: session?.dataTransfer.getData("text/html"),
  };
  session?.endDragSession(true, 0);

  event.type = "mouseup";
  event.buttons = 0;
  // We intentionally turn off this a11y check, because the node is added for
  // testing purposes only, we don't need to do a11y checks on it.
  AccessibilityUtils.setEnv({ focusableRule: false });
  EventUtils.synthesizeMouse(node, 31, 31, event, window);
  AccessibilityUtils.resetEnv();

  return dataTransferSnapshot;
}

add_setup(function setupMockDragService() {
  let oldDragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
  let controller = oldDragService.getMockDragController();
  let cid = MockRegistrar.register(
    "@mozilla.org/widget/dragservice;1",
    controller.mockDragService
  );
  gMockDragService = controller.mockDragService;
  gMockDragService.neverAllowSessionIsSynthesizedForTests = true;
  registerCleanupFunction(() => MockRegistrar.unregister(cid));
});

add_task(async function test_invalid_remote_drag() {
  let attacker = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    ATTACKER_URL
  );
  registerCleanupFunction(async () => {
    BrowserTestUtils.removeTab(attacker);
  });

  let contentMarker = `Content-${crypto.randomUUID()}`;
  await triggerInvalidDragFromContent(attacker.linkedBrowser, contentMarker);

  let chromeMarker = `Chrome-${crypto.randomUUID()}`;
  let dataTransferSnapshot = await triggerChromeDrag(chromeMarker);

  info(`dataTransferSnapshot=${JSON.stringify(dataTransferSnapshot)}`);
  is(
    dataTransferSnapshot.plainText,
    chromeMarker,
    "Check plain text data in parent drag session"
  );
  is(
    dataTransferSnapshot.htmlText,
    `<div>${chromeMarker}</div>`,
    "Check HTML text data in parent drag session"
  );
  SimpleTest.isDeeply(
    dataTransferSnapshot.types,
    ["text/plain", "text/html"],
    "Check data types in parent drag session"
  );
});
