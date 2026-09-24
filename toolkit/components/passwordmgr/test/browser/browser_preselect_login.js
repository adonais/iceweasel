const TEST_ORIGIN = "https://example.org";
const ABOUT_LOGINS_ORIGIN = "about:logins";
const TEST_URL_PATH = `${TEST_ORIGIN}${DIRECTORY_PATH}form_basic_login.html`;

const LOGINS_DATA = [
  {
    origin: "https://aurl.com",
    username: "user1",
    password: "pass1",
    guid: Services.uuid.generateUUID().toString(),
  },
  {
    origin: TEST_ORIGIN,
    username: "user2",
    password: "pass2",
    guid: Services.uuid.generateUUID().toString(),
  },
  {
    origin: TEST_ORIGIN,
    username: "user3",
    password: "pass3",
    guid: Services.uuid.generateUUID().toString(),
  },
];

const waitForAppMenu = async () => {
  const appMenu = document.getElementById("appMenu-popup");
  const appMenuButton = document.getElementById("PanelUI-menu-button");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(appMenuButton),
    "App menu button should be visible."
  );

  let popupshown = BrowserTestUtils.waitForEvent(appMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(appMenuButton, {});
  await popupshown;
  Assert.equal(
    appMenu.state,
    "open",
    `Menu panel (${appMenu.id}) should be visible`
  );
};

const isExpectedLoginItemSelected = async ({ expectedGuid }) => {
  const loginList = content.document.querySelector("login-list").shadowRoot;

  await ContentTaskUtils.waitForCondition(
    () =>
      loginList.querySelector("login-list-item[aria-selected='true']")?.dataset
        ?.guid === expectedGuid,
    "Wait for login item to be selected"
  );

  Assert.equal(
    loginList.querySelector("login-list-item[aria-selected='true']")?.dataset
      ?.guid,
    expectedGuid,
    "Expected login is preselected"
  );
};

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["test.wait300msAfterTabSwitch", true]],
  });

  await Services.logins.addLogins(
    LOGINS_DATA.map(login => LoginTestUtils.testData.formLogin(login))
  );
});

add_task(async function test_about_logins_defaults_to_first_item() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:logins#random-guid",
    },
    async function (gBrowser) {
      await SpecialPowers.spawn(
        gBrowser,
        [{ expectedGuid: LOGINS_DATA[0].guid }],
        isExpectedLoginItemSelected
      );

      Assert.ok(
        true,
        "First item of the list is selected when random hash is supplied."
      );
    }
  );
});

add_task(
  async function test_gear_icon_opens_about_logins_with_preselected_login() {
    await BrowserTestUtils.withNewTab(
      {
        gBrowser,
        url: TEST_URL_PATH,
      },
      async function (browser) {
        const popup = document.getElementById("PopupAutoComplete");

        await openACPopup(popup, browser, "#form-basic-username");

        const secondLoginItem = popup.firstChild.getItemAtIndex(1);
        const secondLoginItemSecondaryAction = secondLoginItem
          .querySelector("autocomplete-row-item")
          .shadowRoot.querySelector("moz-button.secondary-action");

        Assert.ok(
          !secondLoginItemSecondaryAction.checkVisibility({
            checkVisibilityCSS: true,
          }),
          "Secondary action should not be visible initially"
        );

        await EventUtils.synthesizeKey("KEY_ArrowDown");
        await EventUtils.synthesizeKey("KEY_ArrowDown");

        await TestUtils.waitForCondition(
          () => secondLoginItem.attributes.selected,
          "Wait for second login to become active"
        );

        Assert.ok(
          secondLoginItemSecondaryAction.checkVisibility({
            checkVisibilityCSS: true,
          }),
          "Secondary action should be visible when item is active"
        );

        const aboutLoginsTabPromise = BrowserTestUtils.waitForNewTab(
          gBrowser,
          url => url.includes(ABOUT_LOGINS_ORIGIN),
          true
        );

        EventUtils.synthesizeMouseAtCenter(secondLoginItemSecondaryAction, {});
        const aboutLoginsTab = await aboutLoginsTabPromise;

        await SpecialPowers.spawn(
          aboutLoginsTab.linkedBrowser,
          [{ expectedGuid: LOGINS_DATA[2].guid }],
          isExpectedLoginItemSelected
        );

        await closePopup(popup);
        gBrowser.removeTab(aboutLoginsTab);
      }
    );
  }
);

add_task(
  async function test_edit_button_keyboard_opens_about_logins_with_preselected_login() {
    for (const activationKey of ["KEY_Enter", " "]) {
      await BrowserTestUtils.withNewTab(
        {
          gBrowser,
          url: TEST_URL_PATH,
        },
        async function (browser) {
          const popup = document.getElementById("PopupAutoComplete");

          await openACPopup(popup, browser, "#form-basic-username");

          const secondLoginItem = popup.firstChild.getItemAtIndex(1);
          const secondLoginRowItem = secondLoginItem.querySelector(
            "autocomplete-row-item"
          );
          const secondaryAction = secondLoginRowItem.shadowRoot.querySelector(
            "moz-button.secondary-action"
          );

          await EventUtils.synthesizeKey("KEY_ArrowDown");
          await EventUtils.synthesizeKey("KEY_ArrowDown");
          await TestUtils.waitForCondition(
            () => secondLoginItem.hasAttribute("selected"),
            "Wait for second login to become active"
          );

          await EventUtils.synthesizeKey("KEY_Tab");
          await TestUtils.waitForCondition(
            () => secondLoginRowItem.hasAttribute("subfocused"),
            "Wait for edit button to become sub-focused via Tab"
          );

          Assert.ok(
            secondaryAction.checkVisibility({ checkVisibilityCSS: true }),
            "Secondary action should be visible when sub-focused"
          );

          const aboutLoginsTabPromise = BrowserTestUtils.waitForNewTab(
            gBrowser,
            url => url.includes(ABOUT_LOGINS_ORIGIN),
            true
          );

          await EventUtils.synthesizeKey(activationKey);
          const aboutLoginsTab = await aboutLoginsTabPromise;

          await SpecialPowers.spawn(
            aboutLoginsTab.linkedBrowser,
            [{ expectedGuid: LOGINS_DATA[2].guid }],
            isExpectedLoginItemSelected
          );

          await closePopup(popup);
          gBrowser.removeTab(aboutLoginsTab);
        }
      );
    }
  }
);

add_task(async function test_edit_button_subfocus_cleared_by_navigation() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");

      await openACPopup(popup, browser, "#form-basic-username");

      const secondLoginItem = popup.firstChild.getItemAtIndex(1);
      const secondLoginRowItem = secondLoginItem.querySelector(
        "autocomplete-row-item"
      );

      await EventUtils.synthesizeKey("KEY_ArrowDown");
      await EventUtils.synthesizeKey("KEY_ArrowDown");
      await TestUtils.waitForCondition(
        () => secondLoginItem.hasAttribute("selected"),
        "Wait for second login to become active"
      );

      await EventUtils.synthesizeKey("KEY_Tab");
      await TestUtils.waitForCondition(
        () => secondLoginRowItem.hasAttribute("subfocused"),
        "Edit button sub-focused after Tab"
      );

      await EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true });
      await TestUtils.waitForCondition(
        () => !secondLoginRowItem.hasAttribute("subfocused"),
        "Shift+Tab returns sub-focus to the row"
      );

      await EventUtils.synthesizeKey("KEY_Tab");
      await TestUtils.waitForCondition(
        () => secondLoginRowItem.hasAttribute("subfocused"),
        "Edit button sub-focused after Tab again"
      );

      await EventUtils.synthesizeKey("KEY_ArrowUp");
      await TestUtils.waitForCondition(
        () => !secondLoginRowItem.hasAttribute("subfocused"),
        "Arrow navigation clears sub-focus"
      );

      await closePopup(popup);
    }
  );
});

add_task(async function test_edit_button_subfocus_announced_to_a11y() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");

      await openACPopup(popup, browser, "#form-basic-username");

      const secondLoginItem = popup.firstChild.getItemAtIndex(1);
      const secondLoginRowItem = secondLoginItem.querySelector(
        "autocomplete-row-item"
      );

      const announced = [];
      const originalAnnounce = window.A11yUtils.announce;
      window.A11yUtils.announce = args => {
        announced.push(args);
        return originalAnnounce.call(window.A11yUtils, args);
      };

      try {
        await EventUtils.synthesizeKey("KEY_ArrowDown");
        await EventUtils.synthesizeKey("KEY_ArrowDown");
        await TestUtils.waitForCondition(
          () => secondLoginItem.hasAttribute("selected"),
          "Wait for second login to become active"
        );

        await EventUtils.synthesizeKey("KEY_Tab");
        await TestUtils.waitForCondition(
          () => secondLoginRowItem.hasAttribute("subfocused"),
          "Wait for edit button to become sub-focused via Tab"
        );

        const label = secondLoginRowItem.actions.secondary.label;
        Assert.ok(
          announced.some(args => args?.raw === label),
          "Sub-focusing the edit button announces its label to assistive technology"
        );
      } finally {
        window.A11yUtils.announce = originalAnnounce;
      }

      await closePopup(popup);
    }
  );
});

add_task(async function test_edit_button_hidden_for_pointer_selection() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      const popup = document.getElementById("PopupAutoComplete");

      await openACPopup(popup, browser, "#form-basic-username");

      const richlistbox = popup.firstChild;
      const firstLoginItem = richlistbox.getItemAtIndex(0);
      const secondLoginItem = richlistbox.getItemAtIndex(1);
      const secondLoginRowItem = secondLoginItem.querySelector(
        "autocomplete-row-item"
      );
      const secondaryAction = secondLoginRowItem.shadowRoot.querySelector(
        "moz-button.secondary-action"
      );
      const rowItemEl =
        secondLoginRowItem.shadowRoot.querySelector(".row-item");
      const noHighlight = "rgba(0, 0, 0, 0)";

      // Move the pointer over the first row so it is not over the second row we
      // select below (otherwise :host(:hover) would add its background).
      EventUtils.synthesizeMouseAtCenter(firstLoginItem, { type: "mousemove" });
      await TestUtils.waitForCondition(
        () =>
          firstLoginItem
            .querySelector("autocomplete-row-item")
            .hasAttribute("pointerselected"),
        "Wait for the first row to become pointer-selected"
      );

      // Keyboard selection shows the edit icon and the focus outline, but not
      // the background highlight (that is reserved for pointer hover).
      popup.selectedIndex = 1;
      await TestUtils.waitForCondition(
        () => secondLoginRowItem.selected,
        "Wait for the login to become keyboard-selected"
      );
      Assert.ok(
        !secondLoginRowItem.hasAttribute("pointerselected"),
        "Keyboard selection is not pointer-selected"
      );
      Assert.ok(
        secondaryAction.checkVisibility({ checkVisibilityCSS: true }),
        "Edit icon is visible for a keyboard-selected row"
      );
      Assert.notEqual(
        getComputedStyle(secondLoginRowItem).borderTopColor,
        noHighlight,
        "Focus outline is shown for a keyboard-selected row"
      );
      Assert.equal(
        getComputedStyle(rowItemEl).backgroundColor,
        noHighlight,
        "Background highlight is not shown for a keyboard-selected row"
      );

      // Pointer-select the second row while the pointer stays over the first.
      // Its edit icon and background highlight must not be shown by the selected
      // state alone (only on :hover), so they cannot linger when the list
      // scrolls out from under a stationary pointer (bug 2058133).
      popup._setSelectedIndex(1, true);
      await TestUtils.waitForCondition(
        () => secondLoginRowItem.hasAttribute("pointerselected"),
        "Wait for the second row to become pointer-selected"
      );
      Assert.ok(
        secondLoginRowItem.selected,
        "The pointer-selected row is still selected"
      );
      Assert.ok(
        !secondaryAction.checkVisibility({ checkVisibilityCSS: true }),
        "Edit icon is not shown by the pointer-selected state without hover"
      );
      Assert.equal(
        getComputedStyle(rowItemEl).backgroundColor,
        noHighlight,
        "Background highlight is not shown by the pointer-selected state without hover"
      );

      await closePopup(popup);
    }
  );
});

add_task(
  async function test_password_menu_opens_about_logins_with_preselected_login() {
    await BrowserTestUtils.withNewTab(
      {
        gBrowser,
        url: TEST_URL_PATH,
      },
      async function (_browser) {
        await waitForAppMenu();

        const appMenuPasswordsButton = document.getElementById(
          "appMenu-passwords-button"
        );

        const aboutLoginsTabPromise = BrowserTestUtils.waitForNewTab(
          gBrowser,
          url => url.includes(ABOUT_LOGINS_ORIGIN),
          true
        );

        EventUtils.synthesizeMouseAtCenter(appMenuPasswordsButton, {});

        const aboutLoginsTab = await aboutLoginsTabPromise;

        await SpecialPowers.spawn(
          aboutLoginsTab.linkedBrowser,
          [{ expectedGuid: LOGINS_DATA[1].guid }],
          isExpectedLoginItemSelected
        );

        gBrowser.removeTab(aboutLoginsTab);
      }
    );
  }
);

add_task(async function test_new_login_url_has_correct_hash() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:logins",
    },
    async function (gBrowser) {
      await SpecialPowers.spawn(gBrowser, [], async () => {
        const loginList =
          content.document.querySelector("login-list").shadowRoot;
        const createLoginButton = loginList
          .querySelector("create-login-button")
          .shadowRoot.querySelector("button");

        createLoginButton.click();

        await ContentTaskUtils.waitForCondition(
          () =>
            ContentTaskUtils.isVisible(
              loginList.querySelector("#new-login-list-item")
            ),
          "Wait for new login-list-item to become visible"
        );

        Assert.equal(
          content.location.hash,
          "",
          "Location hash should be empty"
        );
      });
    }
  );
});

add_task(async function test_no_logins_empty_url_hash() {
  await Services.logins.removeAllUserFacingLoginsAsync();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function () {
      await waitForAppMenu();

      const appMenuPasswordsButton = document.getElementById(
        "appMenu-passwords-button"
      );

      const aboutLoginsTabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        url => new URL(url).hash === "",
        true
      );

      EventUtils.synthesizeMouseAtCenter(appMenuPasswordsButton, {});

      const aboutLoginsTab = await aboutLoginsTabPromise;

      gBrowser.removeTab(aboutLoginsTab);
    }
  );
});
