/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function synthesizeMouseOver(element) {
  info("synthesize mouseover");
  let promise = BrowserTestUtils.waitForEvent(element, "mouseover");
  EventUtils.synthesizeMouseAtCenter(document.documentElement, {
    type: "mouseout",
  });
  EventUtils.synthesizeMouseAtCenter(element, { type: "mouseover" });
  EventUtils.synthesizeMouseAtCenter(element, { type: "mousemove" });
  return promise;
}

function synthesizeMouseOut(element) {
  info("synthesize mouseout");
  let promise = BrowserTestUtils.waitForEvent(element, "mouseout");
  EventUtils.synthesizeMouseAtCenter(element, { type: "mouseover" });
  EventUtils.synthesizeMouseAtCenter(element, { type: "mouseout" });
  EventUtils.synthesizeMouseAtCenter(document.documentElement, {
    type: "mousemove",
  });
  return promise;
}

async function expectTooltip(text) {
  if (!gURLBar._overflowing && !gURLBar._inOverflow) {
    info("waiting for overflow event");
    await BrowserTestUtils.waitForEvent(gURLBar.inputField, "overflow");
  }

  let element = gURLBar.inputField;

  // An HTML element gets the document's default tooltip, which is anonymous
  // content, so the event retargets to the root element and the tooltip is its
  // original target.
  let popupShownPromise = BrowserTestUtils.waitForEvent(window, "popupshown");
  await synthesizeMouseOver(element);
  info("awaiting for tooltip popup");
  let tooltip = (await popupShownPromise).originalTarget;

  is(element.getAttribute("title"), text, "title attribute has expected text");
  is(tooltip.getAttribute("label"), text, "tooltip shows expected text");

  await synthesizeMouseOut(element);
}

async function expectNoTooltip() {
  if (gURLBar._overflowing || gURLBar._inOverflow) {
    info("waiting for underflow event");
    await BrowserTestUtils.waitForEvent(gURLBar.inputField, "underflow");
  }

  let element = gURLBar.inputField;
  await synthesizeMouseOver(element);

  is(element.getAttribute("title"), null, "title attribute shouldn't be set");

  await synthesizeMouseOut(element);
}

add_task(async function () {
  window.windowUtils.disableNonTestMouseEvents(true);
  registerCleanupFunction(() => {
    window.windowUtils.disableNonTestMouseEvents(false);
  });

  // Ensure the URL bar is neither focused nor hovered before we start.
  gBrowser.selectedBrowser.focus();
  await synthesizeMouseOut(gURLBar.inputField);

  gURLBar.value = "short string";
  await expectNoTooltip();

  let longURL = "http://longurl.com/" + "foobar/".repeat(30);
  gURLBar.value = longURL;
  is(
    gURLBar.value,
    UrlbarTestUtils.trimURL(longURL),
    "Urlbar value has http:// stripped"
  );
  await expectTooltip(longURL);
});
