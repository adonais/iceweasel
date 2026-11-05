/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { InternalTestingProfileMigrator } = ChromeUtils.importESModule(
  "moz-src:///browser/components/migration/InternalTestingProfileMigrator.sys.mjs"
);

const TEST_CONTENT = [
  {
    id: "AW_IMPORT_SETTINGS_EMBEDDED",
    content: {
      tiles: { type: "migration-wizard" },
      position: "split",
      progress_bar: true,
    },
  },
];

/**
 * Clicks the center of the element matching aSelector in the migration
 * wizard's shadow root.
 *
 * @param {browser} aBrowser
 *   The browser showing about:welcome.
 * @param {string} aSelector
 *   The selector of the element to click.
 * @param {Function} [aBeforeRelease]
 *   Awaited after the mouse button is pressed and before it is released.
 */
async function clickInWizard(aBrowser, aSelector, aBeforeRelease) {
  let send = type =>
    SpecialPowers.spawn(aBrowser, [aSelector, type], (selector, eventType) => {
      let shadow =
        content.document.querySelector(
          "migration-wizard"
        ).openOrClosedShadowRoot;
      EventUtils.synthesizeMouseAtCenter(
        shadow.querySelector(selector),
        { type: eventType },
        content
      );
    });
  await send("mousedown");
  await aBeforeRelease?.();
  await send("mouseup");
}

/**
 * Waits for two animation frames in the browser, so that a mouse release
 * has been handled.
 *
 * @param {browser} aBrowser
 *   The browser showing about:welcome.
 */
function waitForFrames(aBrowser) {
  return SpecialPowers.spawn(aBrowser, [], async () => {
    for (let i = 0; i < 2; i++) {
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }
  });
}

/**
 * Returns whether the browser selector's panel-list is showing.
 *
 * @param {browser} aBrowser
 *   The browser showing about:welcome.
 * @returns {Promise<boolean>}
 */
function isPanelListShowing(aBrowser) {
  return SpecialPowers.spawn(aBrowser, [], () => {
    let shadow =
      content.document.querySelector("migration-wizard").openOrClosedShadowRoot;
    return shadow.querySelector("panel-list").matches(":popover-open");
  });
}

/**
 * Tests that a single click on the browser selector of the embedded
 * migration wizard opens its list and keeps it open, and that the list
 * can then be used and closed with the mouse.
 */
add_task(async function test_selector_click_keeps_list_open() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.migrate.internal-testing.enabled", true]],
  });
  let sandbox = sinon.createSandbox();
  sandbox
    .stub(InternalTestingProfileMigrator.prototype, "getResources")
    .resolves([
      { type: MigrationUtils.resourceTypes.BOOKMARKS, migrate: () => {} },
    ]);

  await setAboutWelcomeMultiStage(JSON.stringify(TEST_CONTENT));
  let { cleanup, browser } = await openMRAboutWelcome();
  try {
    await SpecialPowers.spawn(browser, [], async () => {
      let wizard;
      await ContentTaskUtils.waitForCondition(() => {
        wizard = content.document.querySelector("migration-wizard");
        return (
          wizard?.openOrClosedShadowRoot
            ?.querySelector("#wizard-deck")
            ?.getAttribute("selected-view") === "page-selection"
        );
      }, "Waiting for the selection page.");
      // The wizard focuses the selector after showing the selection page, and
      // moving focus while the list is open would close it.
      let selector = wizard.openOrClosedShadowRoot.querySelector(
        "#browser-profile-selector"
      );
      if (!selector.matches(":focus")) {
        await ContentTaskUtils.waitForEvent(selector, "focus");
      }
    });

    // The list opens on mousedown, so release the mouse only once it shows.
    let waitForList = () =>
      TestUtils.waitForCondition(
        () => isPanelListShowing(browser),
        "Waiting for the list to show."
      );
    await clickInWizard(browser, "#browser-profile-selector", waitForList);
    await waitForFrames(browser);
    Assert.ok(
      await isPanelListShowing(browser),
      "The list is still showing after a click on the selector."
    );

    await clickInWizard(
      browser,
      `panel-item[key="${InternalTestingProfileMigrator.key}"]`
    );
    await TestUtils.waitForCondition(
      async () => !(await isPanelListShowing(browser)),
      "Waiting for the list to close after choosing an item."
    );
    let selectedKey = await SpecialPowers.spawn(browser, [], () => {
      let shadow =
        content.document.querySelector(
          "migration-wizard"
        ).openOrClosedShadowRoot;
      return shadow.querySelector("panel-item.selected").getAttribute("key");
    });
    Assert.equal(
      selectedKey,
      InternalTestingProfileMigrator.key,
      "Choosing an item selects it."
    );

    await clickInWizard(browser, "#browser-profile-selector", waitForList);
    await waitForFrames(browser);
    Assert.ok(
      await isPanelListShowing(browser),
      "The list opens again after another click on the selector."
    );
    await clickInWizard(browser, "#browser-profile-selector");
    await TestUtils.waitForCondition(
      async () => !(await isPanelListShowing(browser)),
      "Waiting for the list to close after clicking the selector again."
    );
  } finally {
    sandbox.restore();
    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
    await cleanup();
  }
});

/**
 * Tests that the browser selector of the embedded migration wizard can be
 * used with the keyboard.
 */
add_task(async function test_selector_keyboard() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.migrate.internal-testing.enabled", true]],
  });
  let sandbox = sinon.createSandbox();
  sandbox
    .stub(InternalTestingProfileMigrator.prototype, "getResources")
    .resolves([
      { type: MigrationUtils.resourceTypes.BOOKMARKS, migrate: () => {} },
    ]);

  await setAboutWelcomeMultiStage(JSON.stringify(TEST_CONTENT));
  let { cleanup, browser } = await openMRAboutWelcome();
  try {
    await SpecialPowers.spawn(browser, [], async () => {
      let wizard;
      await ContentTaskUtils.waitForCondition(() => {
        wizard = content.document.querySelector("migration-wizard");
        return (
          wizard?.openOrClosedShadowRoot
            ?.querySelector("#wizard-deck")
            ?.getAttribute("selected-view") === "page-selection"
        );
      }, "Waiting for the selection page.");
      let selector = wizard.openOrClosedShadowRoot.querySelector(
        "#browser-profile-selector"
      );
      if (!selector.matches(":focus")) {
        await ContentTaskUtils.waitForEvent(selector, "focus");
      }
    });

    let focusedInWizard = () =>
      SpecialPowers.spawn(browser, [], () => {
        let shadow =
          content.document.querySelector(
            "migration-wizard"
          ).openOrClosedShadowRoot;
        let focused = shadow.activeElement;
        return focused?.id || focused?.localName;
      });

    for (let key of ["KEY_Enter", " "]) {
      EventUtils.synthesizeKey(key);
      await TestUtils.waitForCondition(
        () => isPanelListShowing(browser),
        `Waiting for the list to show after pressing ${key}.`
      );
      await waitForFrames(browser);
      Assert.ok(
        await isPanelListShowing(browser),
        `The list stays open after pressing ${key}.`
      );

      EventUtils.synthesizeKey("KEY_ArrowDown");
      await TestUtils.waitForCondition(
        async () => (await focusedInWizard()) === "panel-item",
        "Waiting for an item to be focused."
      );

      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        async () => !(await isPanelListShowing(browser)),
        "Waiting for the list to close after pressing Escape."
      );
      Assert.equal(
        await focusedInWizard(),
        "browser-profile-selector",
        "Focus returns to the selector."
      );
    }
  } finally {
    sandbox.restore();
    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
    await cleanup();
  }
});
