/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// When autofill completes a value longer than the visible input, the field
// should stay scrolled to the start of the text so the origin remains visible,
// rather than scrolling to the end of the path.
//
// There is deliberately no RTL-domain case here. An IDN host is stored in
// Places as punycode, and all three autofill queries compare the typed string
// against that stored form without converting it, so an IDN host typed the way
// a user would type it never autofills at all (Bug 1566151).

const LONG_PATH = `/products/id=${"9".repeat(1000)}`;

add_setup(adaptiveAutofillSetup);

async function checkOriginInView(win, label) {
  await PlacesUtils.history.clear();
  await PlacesTestUtils.clearInputHistory();

  await seedAdaptiveHistory(`https://example.com${LONG_PATH}`, "exa");

  let urlbar = win.gURLBar;
  urlbar.focus();
  urlbar.value = "";
  EventUtils.sendString("exa", win);
  await UrlbarTestUtils.promiseSearchComplete(win);

  let result = await UrlbarTestUtils.getDetailsOfResultAt(win, 0);
  Assert.ok(result.autofill, `${label}: the first result should be autofill`);

  let input = urlbar.inputField;
  Assert.equal(
    win.getComputedStyle(input).direction,
    "ltr",
    `${label}: the autofilled value is ASCII, so the input resolves LTR`
  );
  Assert.greater(
    input.scrollWidth,
    input.clientWidth,
    `${label}: the autofilled value should overflow the input`
  );
  Assert.equal(
    input.scrollLeft,
    input.scrollLeftMin,
    `${label}: the input should be scrolled to the start of the text`
  );
  Assert.equal(
    input.selectionDirection,
    "backward",
    `${label}: the selection should be anchored at the end of the autofilled part`
  );

  await PlacesUtils.history.clear();
}

async function checkWithLocaleDirection(rtlUI) {
  await SpecialPowers.pushPrefEnv({
    set: [["intl.l10n.pseudo", rtlUI ? "bidi" : ""]],
  });

  let win = await BrowserTestUtils.openNewBrowserWindow();
  let label = rtlUI ? "RTL locale" : "LTR locale";
  Assert.equal(
    win.RTL_UI,
    rtlUI,
    `${label}: the window has the expected direction`
  );

  await checkOriginInView(win, label);

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
}

add_task(async function originStaysInViewLTRLocale() {
  await checkWithLocaleDirection(false);
});

add_task(async function originStaysInViewRTLLocale() {
  await checkWithLocaleDirection(true);
});
