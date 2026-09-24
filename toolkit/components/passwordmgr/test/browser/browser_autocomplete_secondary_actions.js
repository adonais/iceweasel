const TEST_ORIGIN = "https://example.org";
const TEST_URL_PATH = `${TEST_ORIGIN}${DIRECTORY_PATH}form_basic_login.html`;
const PREF = "browser.autocomplete.removeRecords.enabled";
const AC_L10N = new Localization(
  ["toolkit/main-window/autocomplete.ftl"],
  true
);

const LOGINS_DATA = [
  { origin: TEST_ORIGIN, username: "user1", password: "pass1" },
  { origin: TEST_ORIGIN, username: "user2", password: "pass2" },
];

add_setup(async () => {
  await Services.logins.addLogins(
    LOGINS_DATA.map(login => LoginTestUtils.testData.formLogin(login))
  );
});

// Every flyout delete dispatches a real reauthentication request. Stub it for
// the whole file so no task can raise a genuine OS auth prompt and wedge the
// browser.
let gReauthAuthorized = false;
let gReauthCalls = [];

add_setup(async () => {
  const { LoginHelper } = ChromeUtils.importESModule(
    "resource://gre/modules/LoginHelper.sys.mjs"
  );
  const original = LoginHelper.requestReauth;
  LoginHelper.requestReauth = async (...args) => {
    gReauthCalls.push(args);
    // A real prompt takes focus, which tears the dropdown down before it
    // resolves. Do the same so callers see the ordering they see in the wild.
    const popup = document.getElementById("PopupAutoComplete");
    if (popup.state != "closed") {
      popup.hidePopup();
      await TestUtils.waitForCondition(
        () => popup.state == "closed",
        "Wait for the dropdown to close before reauthentication resolves"
      );
    }
    return { isAuthorized: gReauthAuthorized, telemetryEvent: null };
  };
  registerCleanupFunction(() => {
    LoginHelper.requestReauth = original;
  });
});

function getSecondaryAction(popup, index) {
  const item = popup.firstChild.getItemAtIndex(index);
  const rowItem = item.querySelector("autocomplete-row-item");
  const button = rowItem.shadowRoot.querySelector(
    "moz-button.secondary-action"
  );
  return { item, rowItem, button };
}

async function selectRow(item, index) {
  for (let i = 0; i <= index; i++) {
    await EventUtils.synthesizeKey("KEY_ArrowDown");
  }
  await TestUtils.waitForCondition(
    () => item.hasAttribute("selected"),
    "Wait for the login row to become active"
  );
}

function waitForFlyout(itemLabel) {
  return TestUtils.waitForCondition(
    () =>
      [...document.querySelectorAll("menupopup")].find(
        m =>
          m.state == "open" &&
          [...m.querySelectorAll("menuitem")].some(
            mi => mi.getAttribute("label") === itemLabel
          )
      ),
    "Wait for the flyout menu to open"
  );
}

async function openFlyoutByKeyboard(item, rowItem) {
  await selectRow(item, 0);
  await EventUtils.synthesizeKey("KEY_Tab");
  await TestUtils.waitForCondition(
    () => rowItem.hasAttribute("subfocused"),
    "Wait for the secondary action to become sub-focused"
  );
  await EventUtils.synthesizeKey("KEY_Enter");
  return waitForFlyout(rowItem.actions.secondary.actions[0].label);
}

async function openFlyout(popup, button, label) {
  await TestUtils.waitForCondition(
    () => button.checkVisibility({ checkVisibilityCSS: true }),
    "Wait for the secondary action button to be visible"
  );
  // The click opens the flyout on mousedown, but a stray event can dismiss it
  // before it settles; re-click while the panel is still up (a missed click
  // would hit the row and close it) until the flyout sticks.
  const menupopup = await TestUtils.waitForCondition(() => {
    const found = [...popup.querySelectorAll("menupopup")].find(m =>
      [...m.querySelectorAll("menuitem")].some(
        mi => mi.getAttribute("label") === label
      )
    );
    if (found) {
      return found;
    }
    if (popup.state == "open") {
      EventUtils.synthesizeMouseAtCenter(button, {});
    }
    return false;
  }, "Wait for the flyout menu to open");

  if (menupopup.state != "open") {
    await BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  }
  return menupopup;
}

add_task(async function test_edit_icon_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { rowItem, button } = getSecondaryAction(popup, 0);

      Assert.equal(
        rowItem.actions.secondary.type,
        "edit",
        "Login row keeps the edit secondary action when the pref is off"
      );
      Assert.ok(
        button.iconSrc.endsWith("edit.svg"),
        "The secondary action shows the edit icon"
      );

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_flyout_when_pref_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);

      Assert.equal(
        rowItem.actions.secondary.type,
        "menupopup",
        "Login row shows the flyout secondary action when the pref is on"
      );
      Assert.ok(
        button.iconSrc.endsWith("more.svg"),
        "The secondary action shows the more icon"
      );

      await selectRow(item, 0);
      await TestUtils.waitForCondition(
        () => button.checkVisibility({ checkVisibilityCSS: true }),
        "Secondary action is visible when the row is active"
      );

      const [editAction, deleteAction] = rowItem.actions.secondary.actions;

      const menupopup = await openFlyout(popup, button, editAction.label);

      const labels = [...menupopup.querySelectorAll("menuitem")].map(mi =>
        mi.getAttribute("label")
      );
      Assert.deepEqual(
        labels,
        [editAction.label, deleteAction.label],
        "Flyout contains the Edit and Delete items"
      );

      Assert.ok(
        popup.contains(menupopup),
        "The flyout is hosted inside the autocomplete panel"
      );
      Assert.equal(popup.state, "open", "The autocomplete popup stays open");

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.hidePopup();
      await menuHidden;

      await TestUtils.waitForCondition(
        () => !popup.contains(menupopup),
        "The flyout menupopup is removed after closing"
      );
      Assert.equal(
        popup.state,
        "open",
        "The autocomplete popup remains open after the flyout closes"
      );

      // The flyout lives inside the panel, so its popup events bubble up to
      // the panel's own listeners and to AutoCompleteParent's. Neither may
      // mistake them for the panel itself opening or closing, otherwise the
      // actor tears itself down and every later secondary action no-ops.
      Assert.ok(
        popup.mPopupOpen,
        "The panel still considers itself open after the flyout closes"
      );
      const { AutoCompleteParent } = ChromeUtils.importESModule(
        "moz-src:///toolkit/actors/AutoCompleteParent.sys.mjs"
      );
      Assert.ok(
        AutoCompleteParent.getCurrentActor(),
        "The autocomplete actor is still current after the flyout closes"
      );

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_flyout_opens_via_keyboard() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      await EventUtils.synthesizeKey("KEY_Tab");
      await TestUtils.waitForCondition(
        () => rowItem.hasAttribute("subfocused"),
        "Wait for the secondary action to become sub-focused"
      );

      const editLabel = rowItem.actions.secondary.actions[0].label;
      await EventUtils.synthesizeKey("KEY_Enter");

      const menupopup = await TestUtils.waitForCondition(
        () =>
          [...document.querySelectorAll("menupopup")].find(m =>
            [...m.querySelectorAll("menuitem")].some(
              mi => mi.getAttribute("label") === editLabel
            )
          ),
        "Wait for the flyout to open from the keyboard"
      );

      Assert.equal(popup.state, "open", "The autocomplete popup stays open");

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.hidePopup();
      await menuHidden;

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

// The action button must stay pinned to the row for as long as the flyout is
// open, not only while the row is hovered or selected.
add_task(async function test_action_button_persists_while_flyout_open() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      const editLabel = rowItem.actions.secondary.actions[0].label;
      const menupopup = await openFlyout(popup, button, editLabel);

      Assert.ok(
        rowItem.hasAttribute("menuopen"),
        "The row is marked open while the flyout is showing"
      );

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.hidePopup();
      await menuHidden;

      await TestUtils.waitForCondition(
        () => !rowItem.hasAttribute("menuopen"),
        "The open marker is cleared after the flyout closes"
      );

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

// Popup should route each item to its own action index through
// the parent's dispatch path.
add_task(async function test_flyout_actions_dispatch_by_index() {
  const { AutoCompleteParent } = ChromeUtils.importESModule(
    "moz-src:///toolkit/actors/AutoCompleteParent.sys.mjs"
  );
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      const calls = [];
      const original = AutoCompleteParent.prototype.selectAutoCompleteEntry;
      AutoCompleteParent.prototype.selectAutoCompleteEntry = function (
        ...args
      ) {
        calls.push(args);
        return original.apply(this, args);
      };

      try {
        const { actions } = rowItem.actions.secondary;
        Assert.equal(actions.length, 2, "Flyout has two actions");

        actions[0].action();
        Assert.deepEqual(
          calls.at(-1),
          [true, 0],
          "First flyout item dispatches secondary action index 0"
        );

        actions[1].action();
        Assert.deepEqual(
          calls.at(-1),
          [true, 1],
          "Second flyout item dispatches secondary action index 1"
        );
      } finally {
        AutoCompleteParent.prototype.selectAutoCompleteEntry = original;
      }

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

// Closing the autocomplete panel should tear down any flyout a row left open.
add_task(async function test_flyout_closes_with_panel() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      const editLabel = rowItem.actions.secondary.actions[0].label;
      const menupopup = await openFlyout(popup, button, editLabel);

      await closePopup(popup);

      await TestUtils.waitForCondition(
        () => !popup.contains(menupopup),
        "The flyout is removed when the autocomplete panel closes"
      );
      Assert.ok(
        !rowItem.hasAttribute("menuopen"),
        "The row's open marker is cleared when the panel closes"
      );
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_activating_flyout_item_keeps_panel_open() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem } = getSecondaryAction(popup, 0);
      const menupopup = await openFlyoutByKeyboard(item, rowItem);

      const menuitems = [...menupopup.querySelectorAll("menuitem")];
      for (const menuitem of menuitems) {
        Assert.equal(
          menuitem.getAttribute("closemenu"),
          "single",
          "Flyout items close only their own menu, not the popup chain"
        );
      }

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.activateItem(menuitems[0]);
      await menuHidden;

      Assert.equal(
        popup.state,
        "open",
        "The autocomplete panel stays open after a flyout item is activated"
      );

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_subfocus_tracks_the_flyout() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem } = getSecondaryAction(popup, 0);
      const menupopup = await openFlyoutByKeyboard(item, rowItem);

      Assert.ok(
        rowItem.hasAttribute("subfocused"),
        "The button keeps its focus indicator while the flyout is showing"
      );
      Assert.ok(
        rowItem.hasAttribute("menuopen"),
        "The row is marked open while the flyout is showing"
      );

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.hidePopup();
      await menuHidden;

      await TestUtils.waitForCondition(
        () => !rowItem.hasAttribute("subfocused"),
        "Wait for the sub-selection to drop when the flyout closes"
      );
      Assert.ok(
        !popup._secondaryActionFocused,
        "The panel and the row agree that the sub-selection is gone"
      );
      Assert.equal(popup.state, "open", "The autocomplete panel stays open");

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_secondary_action_menu_semantics() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      const { label } = rowItem.actions.secondary;

      Assert.ok(
        label.includes("user1"),
        `The button is named after the row it belongs to, got "${label}"`
      );

      const innerButton = button.shadowRoot.querySelector("#main-button");
      Assert.equal(
        innerButton.getAttribute("title"),
        label,
        "The button's accessible name comes from its title"
      );
      Assert.ok(
        !innerButton.hasAttribute("aria-label"),
        "The name is not duplicated across title and aria-label"
      );
      Assert.equal(
        innerButton.getAttribute("aria-haspopup"),
        "menu",
        "The button advertises that it opens a menu"
      );
      Assert.equal(
        innerButton.getAttribute("aria-expanded"),
        "false",
        "The button reports its menu as collapsed"
      );

      const menupopup = await openFlyoutByKeyboard(item, rowItem);

      Assert.equal(
        menupopup.getAttribute("aria-label"),
        label,
        "The flyout has an accessible name"
      );
      await TestUtils.waitForCondition(
        () => innerButton.getAttribute("aria-expanded") === "true",
        "Wait for the button to report its menu as expanded"
      );

      const menuHidden = BrowserTestUtils.waitForEvent(
        menupopup,
        "popuphiding"
      );
      menupopup.hidePopup();
      await menuHidden;

      await TestUtils.waitForCondition(
        () => innerButton.getAttribute("aria-expanded") === "false",
        "Wait for the button to report its menu as collapsed again"
      );

      await closePopup(popup);
    }
  );
  await SpecialPowers.popPrefEnv();
});

// Moving the pointer into the flyout takes it off the row, which clears the
// dropdown's selection. The flyout must restore it, otherwise AutoCompleteParent
// has no entry to dispatch the delete action for.
add_task(async function test_delete_works_after_pointer_leaves_row() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  gReauthAuthorized = true;
  gReauthCalls = [];
  let sawDialog = false;

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      const richlistbox = popup.richlistbox;

      await TestUtils.waitForCondition(() => {
        EventUtils.synthesizeMouseAtCenter(item, { type: "mousemove" });
        return richlistbox.hasAttribute("pointerselected");
      }, "Wait for the row to be selected by the pointer");
      Assert.equal(popup.selectedIndex, 0, "The hovered row is selected");

      const deleteLabel = rowItem.actions.secondary.actions[1].label;
      const menupopup = await openFlyout(popup, button, deleteLabel);
      const menuitem = [...menupopup.querySelectorAll("menuitem")].find(
        mi => mi.getAttribute("label") === deleteLabel
      );

      richlistbox.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
      );
      Assert.equal(
        popup.selectedIndex,
        -1,
        "The dropdown drops its selection once the pointer leaves the row"
      );

      const dialogClosed = BrowserTestUtils.promiseAlertDialog(
        null,
        undefined,
        {
          callback: win => {
            sawDialog = true;
            win.document.querySelector("dialog").getButton("cancel").click();
          },
        }
      );

      menupopup.activateItem(menuitem);
      await dialogClosed;

      Assert.equal(gReauthCalls.length, 1, "Reauthentication was requested");
      Assert.ok(
        sawDialog,
        "The delete action still resolves to the row the flyout belongs to"
      );

      await TestUtils.waitForCondition(
        () => popup.state == "open",
        "Wait for the dropdown to come back after the confirmation"
      );

      await closePopup(popup);
    }
  );
  gReauthAuthorized = false;
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_delete_reauthenticates_then_confirms() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  gReauthAuthorized = true;
  gReauthCalls = [];
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      const deleteLabel = rowItem.actions.secondary.actions[1].label;
      const menupopup = await openFlyout(popup, button, deleteLabel);
      const menuitem = [...menupopup.querySelectorAll("menuitem")].find(
        mi => mi.getAttribute("label") === deleteLabel
      );

      let dialogWin;
      const dialogClosed = BrowserTestUtils.promiseAlertDialog(
        null,
        undefined,
        {
          callback: async win => {
            dialogWin = win;
            const [title, message, confirmButton] = AC_L10N.formatValuesSync([
              { id: "autocomplete-remove-password-title" },
              { id: "autocomplete-remove-record-message" },
              { id: "autocomplete-remove-record-button" },
            ]);
            Assert.equal(
              win.document.getElementById("infoTitle").textContent,
              title,
              "The confirmation asks whether to remove the password"
            );
            Assert.equal(
              win.document.getElementById("infoBody").textContent,
              message,
              "The confirmation warns the action cannot be undone"
            );
            const dialog = win.document.querySelector("dialog");
            Assert.equal(
              dialog.getButton("accept").label,
              confirmButton,
              "The accept button is labelled Remove"
            );
            dialog.getButton("cancel").click();
          },
        }
      );

      menupopup.activateItem(menuitem);
      await dialogClosed;

      Assert.equal(gReauthCalls.length, 1, "Reauthentication was requested");
      Assert.equal(
        gReauthCalls[0][4],
        "delete_autocomplete",
        "Reauthentication is recorded against the autocomplete delete"
      );
      Assert.ok(dialogWin, "The confirmation dialog was shown");

      await TestUtils.waitForCondition(
        () => popup.state == "open",
        "Wait for the dropdown to come back after the confirmation"
      );
      Assert.equal(
        popup.state,
        "open",
        "The dropdown is restored once the confirmation is dismissed"
      );

      const logins = await Services.logins.getAllLogins();
      Assert.equal(
        logins.length,
        LOGINS_DATA.length,
        "Cancelling the confirmation leaves the login in place"
      );

      await closePopup(popup);
    }
  );
  gReauthAuthorized = false;
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_delete_skips_confirm_when_reauth_fails() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  gReauthAuthorized = false;
  gReauthCalls = [];
  let sawDialog = false;
  const observer = () => {
    sawDialog = true;
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL_PATH },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");
      await openACPopup(popup, browser, "#form-basic-username");

      const { item, rowItem, button } = getSecondaryAction(popup, 0);
      await selectRow(item, 0);

      const deleteLabel = rowItem.actions.secondary.actions[1].label;
      const menupopup = await openFlyout(popup, button, deleteLabel);
      const menuitem = [...menupopup.querySelectorAll("menuitem")].find(
        mi => mi.getAttribute("label") === deleteLabel
      );

      menupopup.activateItem(menuitem);
      await TestUtils.waitForCondition(
        () => gReauthCalls.length,
        "Wait for reauthentication to be requested"
      );
      await TestUtils.waitForTick();

      Assert.ok(!sawDialog, "No confirmation is shown when reauth is declined");

      await TestUtils.waitForCondition(
        () => popup.state == "open",
        "The dropdown comes back even when reauthentication is declined"
      );
      Assert.equal(
        popup.state,
        "open",
        "The dropdown is restored when reauthentication is declined"
      );

      await closePopup(popup);
    }
  );
  Services.obs.removeObserver(observer, "common-dialog-loaded");
  await SpecialPowers.popPrefEnv();
});
