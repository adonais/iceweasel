/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_forceDiscarded_true_renderDiscarded_false() {
  // Create a tab and discard it
  let discardedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com");

  // Make sure the tab is loaded first
  await BrowserTestUtils.browserLoaded(discardedTab.linkedBrowser);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  await gBrowser.prepareDiscardBrowser(discardedTab);
  gBrowser.discardBrowser(discardedTab, {
    forceDiscard: true,
    renderDiscarded: false,
  });

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should have discarded-skip-on-close attribute"
  );

  // Clean up
  BrowserTestUtils.removeTab(discardedTab);
});

add_task(async function test_forceDiscarded_true() {
  // Create a tab and discard it
  let discardedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com");

  // Make sure the tab is loaded first
  await BrowserTestUtils.browserLoaded(discardedTab.linkedBrowser);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  // Discard the tab to set the "discarded" attribute
  await gBrowser.prepareDiscardBrowser(discardedTab);
  gBrowser.discardBrowser(discardedTab, { forceDiscard: true });

  ok(
    discardedTab.hasAttribute("discarded"),
    "Tab should have discarded attribute"
  );
  ok(
    discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should have discarded-skip-on-close attribute"
  );

  let restored = BrowserTestUtils.waitForEvent(discardedTab, "SSTabRestored");
  await BrowserTestUtils.switchTab(gBrowser, discardedTab);
  await restored;

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Restored tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Restored tab should not have discarded-skip-on-close attribute"
  );

  // Clean up
  BrowserTestUtils.removeTab(discardedTab);
});

add_task(async function test_default_options() {
  // Create a tab and discard it
  let discardedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com");

  // Make sure the tab is loaded first
  await BrowserTestUtils.browserLoaded(discardedTab.linkedBrowser);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  await gBrowser.prepareDiscardBrowser(discardedTab);
  gBrowser.discardBrowser(discardedTab);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  // Clean up
  BrowserTestUtils.removeTab(discardedTab);
});

add_task(async function test_forceDiscarded_false_renderDiscarded_true() {
  // Create a tab and discard it
  let discardedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com");

  // Make sure the tab is loaded first
  await BrowserTestUtils.browserLoaded(discardedTab.linkedBrowser);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  // Discard the tab to set the "discarded" attribute
  await gBrowser.prepareDiscardBrowser(discardedTab);
  gBrowser.discardBrowser(discardedTab, {
    forceDiscard: false,
    renderDiscarded: true,
  });

  ok(
    discardedTab.hasAttribute("discarded"),
    "Tab should have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  // Clean up
  BrowserTestUtils.removeTab(discardedTab);
});

add_task(async function test_forceDiscarded_false_skipOnClose_true() {
  // Create a tab and discard it
  let discardedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com");

  // Make sure the tab is loaded first
  await BrowserTestUtils.browserLoaded(discardedTab.linkedBrowser);

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    !discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should not have discarded-skip-on-close attribute"
  );

  // Discard the tab to set the "discarded" attribute
  await gBrowser.prepareDiscardBrowser(discardedTab);
  gBrowser.discardBrowser(discardedTab, {
    forceDiscard: false,
    skipOnClose: true,
  });

  ok(
    !discardedTab.hasAttribute("discarded"),
    "Tab should not have discarded attribute"
  );
  ok(
    discardedTab.hasAttribute("discarded-skip-on-close"),
    "Tab should have discarded-skip-on-close attribute"
  );

  // Clean up
  BrowserTestUtils.removeTab(discardedTab);
});
