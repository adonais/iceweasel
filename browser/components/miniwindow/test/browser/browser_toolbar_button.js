/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CustomizableWidgets } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableWidgets.sys.mjs"
);
const { SELECTION_MODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/screenshots/ScreenshotsSelectionModes.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_widget_is_registered_and_palette_only() {
  let widget = CustomizableUI.getWidget("mini-window-button");
  Assert.ok(widget, "mini-window-button widget is registered");

  Assert.equal(
    CustomizableUI.getPlacementOfWidget("mini-window-button"),
    null,
    "mini-window-button has no default placement (palette-only)"
  );
});

add_task(async function test_on_command_starts_mini_window_mode() {
  let widgetDef = CustomizableWidgets.find(w => w.id === "mini-window-button");
  Assert.ok(widgetDef, "mini-window-button definition found");

  // The button asks for mini-window mode and leaves toggle() to decide whether
  // that opens the overlay, takes one over or closes it.
  let sandbox = sinon.createSandbox();
  let toggle = sandbox.stub(ScreenshotsUtils, "toggle");

  try {
    widgetDef.onCommand({ currentTarget: { documentGlobal: window } });
  } finally {
    sandbox.restore();
  }

  Assert.ok(toggle.calledOnce, "ScreenshotsUtils.toggle was called once");
  Assert.deepEqual(
    toggle.firstCall.args,
    [
      gBrowser.selectedBrowser,
      "MiniWindowToolbarButton",
      { mode: SELECTION_MODES.MINI_WINDOW },
    ],
    "asked for the selected browser in mini-window mode"
  );
});
