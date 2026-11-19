/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { GenAI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/GenAI.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PLACE_SCRIPT = `
  function place(el, css, dy = 10) {
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    el.style.cssText = "position:absolute;background:#ccc;" + css +
      ";left:" + (r.left + scrollX) + "px;top:" + (r.bottom + dy + scrollY) + "px";
  }
`;

function pageWith(script, extraHtml = "") {
  const html = `<body style="margin:0"><p style="margin:100px 0 0 100px">select this text</p>${extraHtml}<script>${PLACE_SCRIPT}${script}<\/script></body>`;
  return "data:text/html," + encodeURIComponent(html);
}

// What the page does when the mouse is released.
const onMouseUp = (body, delay = 10) =>
  `document.addEventListener("mouseup", () => setTimeout(() => { ${body} }, ${delay}));`;
const ADD_MENU = `const el = document.createElement("div"); document.body.appendChild(el);`;

const PAGES = {
  injectedToolbar: pageWith(
    onMouseUp(`${ADD_MENU} place(el, "width:120px;height:30px");`)
  ),
  toolbarShownByStyle: pageWith(
    onMouseUp(
      `place(document.getElementById("menu"), "width:120px;height:30px");`
    ),
    `<div id="menu" style="display:none"></div>`
  ),
  lateToolbar: pageWith(
    onMouseUp(`${ADD_MENU} place(el, "width:120px;height:30px");`, 500)
  ),
  toolbarShownWhileSelecting: pageWith(`
    document.addEventListener("selectionchange", () => {
      ${ADD_MENU} place(el, "width:120px;height:30px");
    }, { once: true });
  `),
  farAwayElement: pageWith(
    onMouseUp(`${ADD_MENU} place(el, "width:120px;height:30px", 3000);`)
  ),
  bigOverlay: pageWith(
    onMouseUp(`${ADD_MENU} place(el, "width:2000px;height:2000px");`)
  ),
  noMenu: pageWith(""),
  invisibleToolbar: pageWith(
    onMouseUp(
      `${ADD_MENU} place(el, "width:120px;height:30px;visibility:hidden");`
    )
  ),
  transparentToolbar: pageWith(
    onMouseUp(`${ADD_MENU} place(el, "width:120px;height:30px;opacity:0");`)
  ),
  deeplyNestedMenu: pageWith(
    onMouseUp(`document.getElementById("deep").hidden = false;`),
    `<div style="position:absolute;left:100px;top:130px;width:120px;height:30px;background:#ccc"><div><div><div><div><div><div><div><div><div><div><span id="deep" hidden>menu</span></div></div></div></div></div></div></div></div></div></div></div>`
  ),
};

/**
 * Select the text on a page and report what the menu did.
 *
 * @param {string} url the page to select text on
 * @param {object} [options]
 * @param {object} [options.prefs] prefs to set on top of the defaults
 * @param {Function} [options.afterShown] awaited with the panel and the spy once the menu is open
 * @param {number} [options.holdBeforeRelease] ms to wait after selecting before the mouse is released
 * @returns {Promise<{shown: boolean, suppressed: boolean}>}
 */
async function selectOn(
  url,
  { prefs = {}, afterShown, holdBeforeRelease = 0 } = {}
) {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: Object.entries({
      "browser.highlightToSearch.featureGate": true,
      "browser.highlightToSearch.ignoredSites": "",
      "browser.highlightToSearch.detectPageMenus": true,
      "browser.ml.chat.provider": "",
      ...prefs,
    }),
  });
  const panel = document.getElementById("selection-shortcut-action-panel");
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");
  const result = {};

  try {
    await BrowserTestUtils.withNewTab(url, async browser => {
      await selectAllAndMouseUp(browser, { holdMs: holdBeforeRelease });
      await TestUtils.waitForCondition(
        () => spy.calledWith("GenAI:ShowShortcuts"),
        "The page's selection reached the parent"
      );
      result.shown = !spy.getCalls().some(call => call.args[1].pageMenu);
      if (result.shown) {
        await TestUtils.waitForCondition(
          () => panel.getAttribute("panelopen") === "true",
          "The menu opened"
        );
        await afterShown?.(panel, spy);
      }
      result.suppressed =
        !result.shown || spy.calledWith("GenAI:SuppressedShortcuts");
      result.panelState = panel.state;
      if (panel.state != "closed") {
        const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
        panel.hide();
        await hidden;
      }
    });
  } finally {
    spy.restore();
    await SpecialPowers.popPrefEnv();
  }
  return result;
}

const suppressedReasons = () =>
  (Glean.selectionMenu.suppressed.testGetValue() ?? []).map(
    e => e.extra.reason
  );

/**
 * Check that a floating element the page adds while the selection is being made
 * suppresses the menu.
 */
add_task(async function test_toolbar_shown_while_selecting_suppresses_menu() {
  const result = await selectOn(PAGES.toolbarShownWhileSelecting);
  Assert.ok(!result.shown, "The menu is not offered");
  Assert.ok(result.suppressed, "The parent was told why");
  Assert.equal(result.panelState, "closed", "The menu stays closed");
  Assert.deepEqual(
    suppressedReasons(),
    ["page_menu"],
    "The reason is recorded"
  );
});

/**
 * Check that a floating element the page shows long before the mouse is
 * released, such as a hover card, does not suppress the menu.
 */
add_task(async function test_toolbar_shown_long_before_release_is_ignored() {
  const result = await selectOn(PAGES.toolbarShownWhileSelecting, {
    holdBeforeRelease: 600,
  });
  Assert.ok(result.shown, "The menu is offered");
  Assert.ok(!result.suppressed, "The menu is not suppressed");
  Assert.deepEqual(suppressedReasons(), [], "Nothing is recorded");
});

/**
 * Check that a floating element the page adds next to the selection suppresses
 * the menu before it is shown.
 */
add_task(async function test_injected_toolbar_suppresses_menu() {
  const result = await selectOn(PAGES.injectedToolbar);
  Assert.ok(!result.shown, "The menu is not offered");
  Assert.ok(result.suppressed, "The parent was told why");
  Assert.equal(result.panelState, "closed", "The menu stays closed");
  Assert.deepEqual(
    suppressedReasons(),
    ["page_menu"],
    "The reason is recorded"
  );
});

/**
 * Check that a toolbar already in the page, which the page only shows, is
 * noticed as well.
 */
add_task(async function test_toolbar_shown_by_style_suppresses_menu() {
  const result = await selectOn(PAGES.toolbarShownByStyle);
  Assert.ok(!result.shown, "The menu is not offered");
  Assert.deepEqual(
    suppressedReasons(),
    ["page_menu"],
    "The reason is recorded"
  );
});

/**
 * Check that a page menu that arrives after ours is shown hides ours.
 */
add_task(async function test_late_toolbar_hides_menu() {
  const result = await selectOn(PAGES.lateToolbar, {
    afterShown: async (panel, spy) => {
      await TestUtils.waitForCondition(
        () => spy.calledWith("GenAI:SuppressedShortcuts"),
        "The page's menu was noticed"
      );
      await TestUtils.waitForCondition(
        () => panel.state == "closed",
        "Our menu closed"
      );
    },
  });
  Assert.ok(result.shown, "The menu was shown first");
  Assert.equal(result.panelState, "closed", "Then it closed");
  Assert.deepEqual(
    suppressedReasons(),
    ["page_menu"],
    "The reason is recorded"
  );
});

/**
 * Check that a page menu is noticed however deep inside its floating container
 * the element the page changes is.
 */
add_task(async function test_deeply_nested_menu_suppresses_menu() {
  const result = await selectOn(PAGES.deeplyNestedMenu);
  Assert.ok(!result.shown, "The menu is not offered");
  Assert.deepEqual(
    suppressedReasons(),
    ["page_menu"],
    "The reason is recorded"
  );
});

/**
 * Check that elements that are far from the selection, invisible, or too big to
 * be a menu, do not suppress it.
 */
add_task(async function test_unrelated_elements_do_not_suppress_menu() {
  for (const [name, url] of [
    ["far from the selection", PAGES.farAwayElement],
    ["too big to be a menu", PAGES.bigOverlay],
    ["absent", PAGES.noMenu],
    ["invisible", PAGES.invisibleToolbar],
    ["fully transparent", PAGES.transparentToolbar],
  ]) {
    const result = await selectOn(url);
    Assert.ok(
      result.shown,
      `The menu is shown when the page element is ${name}`
    );
    Assert.deepEqual(suppressedReasons(), [], `Nothing is recorded (${name})`);
  }
});

/**
 * Check that the detection can be turned off, and only applies while the
 * feature gate is on.
 */
add_task(async function test_detection_follows_prefs() {
  let result = await selectOn(PAGES.injectedToolbar, {
    prefs: { "browser.highlightToSearch.detectPageMenus": false },
  });
  Assert.ok(result.shown, "The menu is shown with the detection turned off");

  result = await selectOn(PAGES.injectedToolbar, {
    prefs: {
      "browser.highlightToSearch.featureGate": false,
      "browser.ml.chat.shortcuts": true,
      "browser.ml.chat.shortcut.onboardingMouseoverCount": 2,
      "browser.ml.chat.provider": "http://localhost:8080",
    },
  });
  Assert.ok(
    result.shown,
    "The menu is shown for existing chatbot users while the feature gate is off"
  );
});

/**
 * Check that Smart Window is left alone, both when the page's menu is already
 * there and when it arrives after the menu is shown.
 */
add_task(async function test_smart_window_ignores_page_menus() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.detectPageMenus", true],
      ["browser.ml.chat.shortcuts.smartwindow", true],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    win.document.documentElement.setAttribute("ai-window", "");
    const panel = win.document.getElementById(
      "selection-shortcut-action-panel"
    );

    for (const url of [PAGES.injectedToolbar, PAGES.lateToolbar]) {
      await BrowserTestUtils.withNewTab(
        { gBrowser: win.gBrowser, url },
        async browser => {
          await selectAllAndMouseUp(browser, { win });
          await TestUtils.waitForCondition(
            () => panel.getAttribute("panelopen") === "true",
            "The menu opened in Smart Window"
          );
          await SpecialPowers.spawn(browser, [], async () => {
            await ContentTaskUtils.waitForCondition(
              () => content.document.querySelector("div"),
              "The page showed its menu"
            );
            await new Promise(resolve =>
              content.requestAnimationFrame(resolve)
            );
          });
          Assert.notEqual(panel.state, "closed", "The menu stays open");
          const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
          panel.hide();
          await hidden;
        }
      );
    }
    Assert.deepEqual(suppressedReasons(), [], "Nothing is recorded");
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});
