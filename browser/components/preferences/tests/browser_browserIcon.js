/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { CustomIconManager, ICON_CATALOG } = ChromeUtils.importESModule(
  "moz-src:///browser/components/shell/CustomIconManager.sys.mjs"
);

const PREF_ICON_ID = "browser.shell.customIcon.id";

// Fake default-browser / taskbar-pin state, flipped by the stubs in the unlock
// task. The Bonus icons unlock only when both are true.
let gIsDefault = false;
let gIsPinned = false;

/**
 * Stub CustomIconManager.apply()/revert() so they only drive the icon pref
 * (no OS calls). Returns the sinon sandbox; caller restores it.
 */
function stubCustomIconManager() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(CustomIconManager, "apply").callsFake(async id => {
    Services.prefs.setStringPref(PREF_ICON_ID, id);
  });
  sandbox.stub(CustomIconManager, "revert").callsFake(async () => {
    Services.prefs.clearUserPref(PREF_ICON_ID);
  });
  return sandbox;
}

/**
 * Synthesize a click on a visual picker's child picker item with the matching
 * value.
 *
 * @param {Element} control The control element (setting-control's controlEl).
 * @param {string} value
 * @returns {Promise<void>}
 */
async function selectPickerValue(control, value) {
  info(`Attempting to click on picker item with value ${value}`);
  let [option] = control.childElements.filter(el => el.value == value);
  ok(option, `Found option for value ${value}`);
  await option.scrollIntoView({ behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(option, {}, option.documentGlobal);
}

/**
 * Open about:preferences on the Appearance pane with the feature enabled and
 * CustomIconManager stubbed, run a callback, then clean up.
 *
 * @param {(ctx: {doc: Document, win: Window, sandbox: object}) => Promise<void>} fn
 */
async function withBrowserIconUI(fn) {
  // Enable the feature before opening the page so preferences.js registers the
  // sub-pane during init.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shell.customIcon.enabled", true]],
  });
  Services.prefs.clearUserPref(PREF_ICON_ID);
  let sandbox = stubCustomIconManager();
  let tab = await openPrefsTab("appearance");
  let win = tab.linkedBrowser.contentWindow;
  let doc = win.document;
  try {
    await fn({ doc, win, sandbox });
  } finally {
    sandbox.restore();
    Services.prefs.clearUserPref(PREF_ICON_ID);
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
}

// The Appearance readout reflects the active icon: its label and thumbnail
// follow the icon pref, and the default state uses the branding icon.
add_task(async function test_appearance_readout_reflects_pref() {
  await withBrowserIconUI(async ({ win }) => {
    let control = await settingControlRenders("current-browser-icon", win);
    let readout = control.controlEl;

    is(
      readout.getAttribute("data-l10n-id"),
      "appearance-browser-icon-default",
      "Readout labelled Default when no custom icon is set"
    );
    ok(
      ICON_CATALOG.default.preview.endsWith("icon64.png"),
      "Default preview uses icon64 for high-density displays"
    );
    is(
      readout.iconSrc,
      ICON_CATALOG.default.preview,
      "Readout shows the default branding icon"
    );

    // Switching the pref to another icon updates label + thumbnail.
    Services.prefs.setStringPref(PREF_ICON_ID, "retro2004");
    await readout.updateComplete;
    is(
      readout.getAttribute("data-l10n-id"),
      ICON_CATALOG.retro2004.l10nId,
      "Readout updates to the Retro 2004 icon"
    );
    is(
      readout.iconSrc,
      ICON_CATALOG.retro2004.preview,
      "Readout thumbnail is the Retro 2004 preview"
    );
  });
});

// The Momo icon carries a description in its Fluent message; the readout
// moz-box-item should surface it (Fluent applies .description automatically
// because moz-box-item declares description as a localizable attribute).
add_task(async function test_appearance_readout_shows_momo_description() {
  await withBrowserIconUI(async ({ win }) => {
    let control = await settingControlRenders("current-browser-icon", win);
    let readout = control.controlEl;

    Services.prefs.setStringPref(PREF_ICON_ID, "momo");
    await TestUtils.waitForCondition(
      () => readout.getAttribute("data-l10n-id") === ICON_CATALOG.momo.l10nId,
      "Readout updates to the Momo icon"
    );
    await TestUtils.waitForCondition(
      () => readout.description,
      "Momo description is localized onto the readout"
    );
    ok(
      readout.description.includes("@heyheymomodraws"),
      "Readout shows Momo's author credit description"
    );
  });
});

// The sub-pane splits icons into Basic and Bonus pickers, and choosing an icon
// drives CustomIconManager.apply()/revert() with the right id.
add_task(async function test_subpane_pickers_apply_and_revert() {
  await withBrowserIconUI(async ({ doc, win }) => {
    let paneChange = waitForPaneChange("browserIcon", win);
    doc.location.hash = "browserIcon";
    await paneChange;

    let basicControl = await settingControlRenders(
      "customBrowserIconBasic",
      win
    );
    let bonusControl = await settingControlRenders(
      "customBrowserIconBonus",
      win
    );
    let basic = basicControl.controlEl;
    let bonus = bonusControl.controlEl;

    let basicValues = [...basic.querySelectorAll("moz-visual-picker-item")].map(
      item => item.value
    );
    let bonusValues = [...bonus.querySelectorAll("moz-visual-picker-item")].map(
      item => item.value
    );

    Assert.deepEqual(
      basicValues,
      ["default", "retro2004", "retro2017", "pride", "minimal"],
      "Basic picker offers the default plus the non-gated icons"
    );
    Assert.deepEqual(
      bonusValues,
      ["kit", "pixelated", "momo"],
      "Bonus picker offers the gated icons"
    );

    // Choosing a Basic icon applies it.
    await selectPickerValue(basic, "retro2004");
    await TestUtils.waitForCondition(
      () => CustomIconManager.apply.calledWith("retro2004"),
      "apply('retro2004') called when a Basic icon is chosen"
    );

    // Choosing the default reverts.
    await selectPickerValue(basic, "default");
    await TestUtils.waitForCondition(
      () => CustomIconManager.revert.called,
      "revert() called when the Default option is chosen"
    );
  });
});

// The gated Bonus icons stay locked until the browser is both the default and
// pinned to the taskbar.
add_task(async function test_bonus_icons_unlock_on_default_and_pin() {
  gIsDefault = false;
  gIsPinned = false;

  await withBrowserIconUI(async ({ doc, win }) => {
    let sandbox = sinon.createSandbox();
    // The sub-pane reads the default-browser and taskbar-pin state through
    // getShellService(); override it with a fake that reports our fake state and
    // flips it when the buttons act, so the unlock gate never touches the OS.
    sandbox.stub(win, "getShellService").returns({
      isDefaultBrowser: () => gIsDefault,
      setDefaultBrowser: () => {
        gIsDefault = true;
      },
      pinToTaskbar: () => {
        gIsPinned = true;
      },
      shellService: {
        isCurrentAppPinnedToTaskbar: () => Promise.resolve(gIsPinned),
      },
    });

    try {
      let paneChange = waitForPaneChange("browserIcon", win);
      doc.location.hash = "browserIcon";
      await paneChange;

      let bonusControl = await settingControlRenders(
        "customBrowserIconBonus",
        win
      );
      let bonus = bonusControl.controlEl;
      let bonusItems = () => [
        ...bonus.querySelectorAll("moz-visual-picker-item"),
      ];

      let promo = await settingControlRenders(
        "customBrowserIconRequirement",
        win
      );
      let unlockedPromo = await settingControlRenders(
        "customBrowserIconUnlocked",
        win
      );
      let setDefaultButton = await settingControlRenders(
        "browserIconSetDefaultButton",
        win
      );
      let pinButton = await settingControlRenders("browserIconPinButton", win);

      // Locked: every Bonus option is disabled, the requirement promo shows,
      // and both action buttons are offered.
      ok(
        bonusItems().every(item => item.disabled),
        "Bonus options are disabled while locked"
      );
      ok(
        !BrowserTestUtils.isHidden(promo),
        "Requirement promo shown while locked"
      );
      ok(
        BrowserTestUtils.isHidden(unlockedPromo),
        "Unlocked promo hidden while locked"
      );
      ok(
        !BrowserTestUtils.isHidden(setDefaultButton),
        "Set-default button shown while not default"
      );
      ok(
        !BrowserTestUtils.isHidden(pinButton),
        "Pin button shown while not pinned"
      );

      // Becoming default is not enough on its own: the icons stay locked and
      // only the (now satisfied) set-default button drops away. Click the button
      // element directly (rather than by screen coordinates) so a mid-transition
      // pane layout can't move it out from under a synthesized mouse event; the
      // setting-group's delegated handler keys off the event target's `.control`
      // back-reference, so wait for the button to finish rendering first.
      await setDefaultButton.controlEl.updateComplete;
      setDefaultButton.controlEl.click();
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isHidden(setDefaultButton),
        "Set-default button hides once the browser is default"
      );
      ok(gIsDefault, "Clicking set-default made the browser default");
      ok(
        bonusItems().every(item => item.disabled),
        "Bonus options remain disabled while still not pinned"
      );
      ok(
        !BrowserTestUtils.isHidden(promo),
        "Requirement promo still shown while not pinned"
      );
      ok(
        !BrowserTestUtils.isHidden(pinButton),
        "Pin button still shown while not pinned"
      );

      // Pinning satisfies the last condition: the icons unlock and the promo
      // (with its buttons) goes away.
      await pinButton.controlEl.updateComplete;
      pinButton.controlEl.click();
      await TestUtils.waitForCondition(
        () => bonusItems().every(item => !item.disabled),
        "Bonus options enable once default and pinned"
      );
      ok(gIsPinned, "Clicking pin pinned the browser to the taskbar");
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isHidden(promo),
        "Requirement promo hidden once unlocked"
      );
      ok(
        !BrowserTestUtils.isHidden(unlockedPromo),
        "Unlocked promo shown once unlocked"
      );
    } finally {
      sandbox.restore();
    }
  });
});
