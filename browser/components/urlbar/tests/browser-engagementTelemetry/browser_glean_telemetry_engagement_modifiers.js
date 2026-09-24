/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for the following data of engagement telemetry.
// - modifiers

add_setup(async function () {
  await setup();
});

add_task(async function modifiers_none() {
  await doTest(async () => {
    await openPopup("x");
    await doClick();

    await assertEngagementTelemetry([
      { engagement_type: "click", modifiers: "" },
    ]);
  });

  await doTest(async () => {
    await openPopup("x");
    await doEnter();

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "" },
    ]);
  });
});

add_task(async function modifiers_accel_click() {
  await doTest(async () => {
    await openPopup("x");
    await doClickInNewTab({ accelKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "click", modifiers: "accel" },
    ]);
  });
});

add_task(async function modifiers_accel_shift_click() {
  await doTest(async () => {
    await openPopup("x");
    await doClickInNewTab({ accelKey: true, shiftKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "click", modifiers: "accel,shift" },
    ]);
  });
});

add_task(async function modifiers_alt_enter() {
  await doTest(async () => {
    await openPopup("x");
    await doEnter({ altKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "alt" },
    ]);
  });
});

add_task(async function modifiers_altgraph_enter() {
  await doTest(async () => {
    await openPopup("x");
    await doEnter({ altGraphKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "altgraph" },
    ]);
  });
});

add_task(async function modifiers_alt_shift_enter() {
  await doTest(async () => {
    await openPopup("x");
    await doEnterInNewTab({ altKey: true, shiftKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "alt,shift" },
    ]);
  });
});

add_task(async function modifiers_accel_enter() {
  await doTest(async () => {
    await openPopup("example");
    await doEnter({ accelKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "accel" },
    ]);
  });

  await doTest(async () => {
    await openPopup("example");
    await doEnter({ accelKey: true, shiftKey: true });

    await assertEngagementTelemetry([
      { engagement_type: "enter", modifiers: "accel,shift" },
    ]);
  });
});

add_task(async function modifiers_no_event() {
  await doTest(async () => {
    await doPasteAndGo("www.example.com");

    await assertEngagementTelemetry([
      { engagement_type: "paste_go", modifiers: "" },
    ]);
  });

  await doTest(async () => {
    await doDropAndGo("example.com");

    await assertEngagementTelemetry([
      { engagement_type: "drop_go", modifiers: "" },
    ]);
  });
});

add_task(async function modifiers_go_button() {
  await doTest(async () => {
    await openPopup("x");
    const onNewTab = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
    EventUtils.synthesizeMouseAtCenter(gURLBar.goButton, { accelKey: true });
    const tab = await onNewTab;
    BrowserTestUtils.removeTab(tab);

    await assertEngagementTelemetry([
      { engagement_type: "go_button", modifiers: "accel" },
    ]);
  });
});

async function doClickInNewTab(modifiers) {
  const selected = UrlbarTestUtils.getSelectedRow(window);
  const onNewTab = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  EventUtils.synthesizeMouseAtCenter(selected, modifiers);
  const tab = await onNewTab;
  BrowserTestUtils.removeTab(tab);
}

async function doEnterInNewTab(modifiers) {
  const onNewTab = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  EventUtils.synthesizeKey("KEY_Enter", modifiers);
  const tab = await onNewTab;
  BrowserTestUtils.removeTab(tab);
}
