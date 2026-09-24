/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.contextMenu.featureGate", true]],
  });

  // Add visits so that it can be autofilled.
  await PlacesTestUtils.addVisits([
    {
      uri: "https://example.com/",
      transition: PlacesUtils.history.TRANSITION_TYPED,
    },
  ]);
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
  });
});

add_task(async function basic() {
  const TEST_CASES = [
    {
      preferences: [["browser.tabs.loadInBackground", true]],
      openIn: "tab",
      expectedTarget: "tab",
      expectedOption: { background: true },
    },
    {
      preferences: [["browser.tabs.loadInBackground", false]],
      openIn: "tab",
      expectedTarget: "tab",
    },
    {
      preferences: [["browser.tabs.loadInBackground", true]],
      openIn: "container-tab",
      expectedTarget: "tab",
      expectedOption: { background: true, userContextId: 1 },
    },
    {
      preferences: [["browser.tabs.loadInBackground", false]],
      openIn: "container-tab",
      expectedTarget: "tab",
      expectedOption: { userContextId: 3 },
    },
    {
      openIn: "window",
      expectedTarget: "window",
    },
    {
      openIn: "private-window",
      expectedTarget: "window",
      expectedOption: { private: true },
    },
  ];

  for (let {
    preferences = [],
    openIn,
    expectedTarget,
    expectedOption = {},
  } of TEST_CASES) {
    info(`Test for ${JSON.stringify({ preferences, openIn, expectedOption })}`);

    info("Set preferences");
    await SpecialPowers.pushPrefEnv({ set: preferences });

    let onSuggestionOpen =
      expectedTarget == "tab"
        ? BrowserTestUtils.waitForNewTab(gBrowser, "https://example.com/")
        : BrowserTestUtils.waitForNewWindow({ url: "https://example.com/" });

    let menu = await openContextMenuOnFirstResult();
    let menuItem = menu.querySelector(`[data-open-in="${openIn}"]`);
    Assert.ok(menuItem, `Found the menu item for ${openIn}`);

    if (expectedOption.userContextId) {
      let subMenuItem = await openContainerSubMenuItem(
        menuItem,
        expectedOption.userContextId
      );
      subMenuItem.click();
    } else {
      menuItem.click();
    }

    let target = await onSuggestionOpen;
    switch (expectedTarget) {
      case "tab": {
        Assert.equal(Cu.getClassName(target, true), "XULElement");
        Assert.equal(target.localName, "tab");
        if (expectedOption.background) {
          Assert.notEqual(target, gBrowser.selectedTab);
        } else {
          await TestUtils.waitForCondition(
            () => target == gBrowser.selectedTab
          );
          Assert.equal(target, gBrowser.selectedTab);
        }

        if (expectedOption.userContextId) {
          Assert.equal(
            target.getAttribute("usercontextid"),
            expectedOption.userContextId
          );
          let openedEvent = Glean.containers.containerTabOpened
            .testGetValue()
            .at(-1);
          Assert.equal(
            openedEvent.extra.source,
            "urlbar_result_context_menu",
            "container_tab_opened reports the urlbar source"
          );
        } else {
          Assert.ok(!target.hasAttribute("usercontextid"));
        }
        BrowserTestUtils.removeTab(target);
        break;
      }
      case "window": {
        Assert.equal(Cu.getClassName(target, true), "Window");
        Assert.equal(
          PrivateBrowsingUtils.isWindowPrivate(target),
          !!expectedOption.private
        );
        target.close();
        break;
      }
    }
  }

  await PlacesUtils.history.clear();
});

// The three-dot button and a right-click open the same menu, and it holds the
// result's own commands as well as the ones that open it in a new target.
add_task(async function same_menu_from_both_triggers() {
  await PlacesTestUtils.addVisits(["https://example.com/"]);

  let resultIndex = await promiseResultWithMenuButton();
  let { element } = await UrlbarTestUtils.getDetailsOfResultAt(
    window,
    resultIndex
  );

  await UrlbarTestUtils.openResultMenu(window, { resultIndex, byMouse: true });
  let fromMenuButton = await promiseMenuDescription();
  gURLBar.view.resultMenu.hide(undefined, { force: true });

  let menu = await openContextMenu(element.row);
  let fromContextMenu = await promiseMenuDescription();
  menu.hide(undefined, { force: true });

  Assert.deepEqual(
    fromContextMenu,
    fromMenuButton,
    "Both triggers open the same menu"
  );
  Assert.deepEqual(
    fromMenuButton.filter(item => item.openIn),
    ["tab", "container-tab", "window", "private-window"].map(openIn => ({
      openIn,
    })),
    "The menu opens the result in a new target"
  );
  Assert.ok(
    fromMenuButton.some(item => item.command),
    "The menu keeps the result's own commands"
  );

  gURLBar.view.close();
  await PlacesUtils.history.clear();
});

// With the feature gate off, the three-dot menu holds only the result's own
// commands and a right-click opens nothing.
add_task(async function feature_gate_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.contextMenu.featureGate", false]],
  });
  await PlacesTestUtils.addVisits(["https://example.com/"]);

  let resultIndex = await promiseResultWithMenuButton();
  await UrlbarTestUtils.openResultMenu(window, { resultIndex, byMouse: true });
  let items = await promiseMenuDescription();
  Assert.ok(
    items.some(item => item.command),
    "The menu holds the result's own commands"
  );
  Assert.ok(
    items.every(item => !item.openIn),
    "The menu doesn't open the result in a new target"
  );
  gURLBar.view.resultMenu.hide(undefined, { force: true });

  gURLBar.view.close();
  await PlacesUtils.history.clear();
  await SpecialPowers.popPrefEnv();
});

add_task(async function toolbar_context_menu() {
  let TEST_TARGETS = [
    ".searchmode-switcher",
    "#trust-icon-container",
    "#identity-box",
  ];

  await BrowserTestUtils.withNewTab("https://example.com/", async () => {
    // Make search mode switcher visible.
    document.querySelector(".searchmode-switcher").focus();

    for (let target of TEST_TARGETS) {
      info(`Test for ${target}`);
      let element = document.querySelector(target);
      let onPopupShown = BrowserTestUtils.waitForEvent(document, "popupshown");
      EventUtils.synthesizeMouseAtCenter(element, {
        type: "contextmenu",
        button: 2,
      });
      let { target: popup } = await onPopupShown;
      Assert.equal(popup.id, "toolbar-context-menu");
      popup.hidePopup();
    }
  });
});

add_task(async function no_context_menu() {
  let TEST_DATA = [
    {
      featureGate: false,
      target: ".urlbarView-row",
    },
    {
      featureGate: false,
      target: ".urlbar-background",
    },
    {
      featureGate: true,
      target: ".urlbar-background",
    },
  ];

  for (let { featureGate, target } of TEST_DATA) {
    info(`Test for ${JSON.stringify({ featureGate, target })}`);
    await SpecialPowers.pushPrefEnv({
      set: [["browser.urlbar.contextMenu.featureGate", featureGate]],
    });

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      value: "exa",
      window,
      fireInputEvent: true,
    });

    let onContextMenu = BrowserTestUtils.waitForEvent(window, "contextmenu");
    let menuShown = false;
    let menuListener = () => {
      menuShown = true;
    };
    window.addEventListener("showing", menuListener, true);

    document.querySelector(target).dispatchEvent(
      new PointerEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        view: window,
      })
    );

    info("Waiting for context menu");
    let event = await onContextMenu;
    Assert.ok(event.defaultPrevented);

    Assert.ok(!menuShown);
    window.removeEventListener("showing", menuListener, true);

    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function keep_view_open_on_context_menu_mousedown() {
  let menu = await openContextMenuOnFirstResult();
  Assert.ok(
    gURLBar.view.isOpen,
    "The view should remain open after the context menu is shown"
  );

  info("Mouse down on a context menu item");
  EventUtils.synthesizeMouseAtCenter(
    menu.querySelector('[data-open-in="tab"]'),
    { type: "mousedown" }
  );

  Assert.ok(
    gURLBar.view.isOpen,
    "The view stays open after a mousedown on the context menu"
  );

  menu.hide(undefined, { force: true });
  gURLBar.view.close();
});

// Returns the menu's items as the command or open-in target each one picks, in
// the order they are shown, separators included.
async function promiseMenuDescription() {
  let menu = gURLBar.view.resultMenu;
  await TestUtils.waitForCondition(
    () => menu.children.length,
    "Waiting for the menu to be populated"
  );
  return [...menu.children].map(item => {
    if (item.localName == "hr") {
      return "separator";
    }
    let { command, openIn } = item.dataset;
    return command ? { command } : { openIn };
  });
}

// Searches for "example" and returns the index of a result that has a menu
// button, which is also a result the menu can open in a new target.
async function promiseResultWithMenuButton() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "example",
    window,
    fireInputEvent: true,
  });
  for (let i = 0; i < UrlbarTestUtils.getResultCount(window); i++) {
    let { element, url } = await UrlbarTestUtils.getDetailsOfResultAt(
      window,
      i
    );
    if (url && element.row.hasAttribute("has-menu-button")) {
      return i;
    }
  }
  throw new Error("No result with a menu button");
}

async function openContextMenu(row) {
  info("Open the context menu");
  let menu = gURLBar.view.resultMenu;
  let onShown = BrowserTestUtils.waitForEvent(menu, "shown");
  EventUtils.synthesizeMouseAtCenter(row, {
    button: 2,
    type: "mousedown",
  });
  EventUtils.synthesizeMouseAtCenter(row, {
    button: 2,
    type: "contextmenu",
  });
  await onShown;

  return menu;
}

async function openContextMenuOnFirstResult() {
  info("Open urlbar results");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "exa",
    window,
    fireInputEvent: true,
  });
  let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  return openContextMenu(element.row);
}

// Opens the submenu of the given item, the same way hovering it does, and
// returns the submenu panel.
async function openContainerSubMenu(menuItem) {
  let onShown = BrowserTestUtils.waitForEvent(menuItem.submenuPanel, "shown");
  menuItem.dispatchEvent(
    new MouseEvent("mouseenter", { view: menuItem.ownerGlobal })
  );
  await onShown;
  return menuItem.submenuPanel;
}

async function openContainerSubMenuItem(menuItem, userContextId) {
  let subMenu = await openContainerSubMenu(menuItem);
  let subMenuItem = subMenu.querySelector(
    `[data-usercontextid="${userContextId}"]`
  );
  Assert.ok(subMenuItem, `Found the container item for ${userContextId}`);
  await TestUtils.waitForCondition(
    () => subMenuItem.textContent,
    "Waiting for the container item to be labeled"
  );
  return subMenuItem;
}
