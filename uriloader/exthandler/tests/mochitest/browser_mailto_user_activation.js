/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that the silent-launch shortcut for mailto (enabled by
// network.protocol-handler.external.mailto = true) now requires transient user
// activation and consumes it. Without activation, the navigation falls through
// to the external protocol permission dialog. See bug 299116.

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gExternalProtocolService",
  "@mozilla.org/uriloader/external-protocol-service;1",
  Ci.nsIExternalProtocolService
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "gHandlerService",
  "@mozilla.org/uriloader/handler-service;1",
  Ci.nsIHandlerService
);

// Origin used by the directory's other tests, so support-file / CSP behaviour
// matches and the silent launch loads in the same tab's browser.
const TEST_ORIGIN = "https://example.com";
const HANDLER_URL_PREFIX = TEST_ORIGIN + "/?url=";
const HANDLER_URI_TEMPLATE = HANDLER_URL_PREFIX + "%s";

const MAILTO_A = "mailto:a@example.com";
const MAILTO_B = "mailto:b@example.com";

let prevAlwaysAskBeforeHandling;
let prevPreferredAction;
let prevPreferredApplicationHandler;

add_setup(async function () {
  // mailto takes the silent-launch shortcut because this pref is set. It's the
  // default; assert it so the test is meaningful.
  ok(
    Services.prefs.getBoolPref(
      "network.protocol-handler.external.mailto",
      false
    ),
    "network.protocol-handler.external.mailto should be true"
  );

  let handler = gExternalProtocolService.getProtocolHandlerInfo("mailto", {});

  let app = Cc["@mozilla.org/uriloader/web-handler-app;1"].createInstance(
    Ci.nsIWebHandlerApp
  );
  app.name = "Test Mail Handler";
  app.uriTemplate = HANDLER_URI_TEMPLATE;

  prevAlwaysAskBeforeHandling = handler.alwaysAskBeforeHandling;
  prevPreferredAction = handler.preferredAction;
  prevPreferredApplicationHandler = handler.preferredApplicationHandler;

  // Configure mailto so the silent-launch path would launch our web handler
  // (and thus load HANDLER_URI_TEMPLATE in the tab), letting us detect it.
  handler.alwaysAskBeforeHandling = false;
  handler.preferredAction = Ci.nsIHandlerInfo.useHelperApp;
  handler.preferredApplicationHandler = app;
  gHandlerService.store(handler);
});

registerCleanupFunction(async function () {
  let handler = gExternalProtocolService.getProtocolHandlerInfo("mailto", {});
  handler.alwaysAskBeforeHandling = prevAlwaysAskBeforeHandling;
  handler.preferredAction = prevPreferredAction;
  handler.preferredApplicationHandler = prevPreferredApplicationHandler;
  gHandlerService.store(handler);
});

/**
 * Returns a promise that resolves when the tab's browser loads the web
 * handler URL, which only happens on a silent launch.
 *
 * @param {MozBrowser} browser - Browser to watch.
 */
function waitForSilentLaunch(browser) {
  return BrowserTestUtils.browserLoaded(browser, false, url =>
    url.startsWith(HANDLER_URL_PREFIX)
  );
}

/**
 * Asserts that no protocol permission dialog opens while the given promise is
 * pending. Resolves with the result of the promise (which should win the race).
 *
 * @param {MozBrowser} browser - Browser the dialog would belong to.
 * @param {Promise} winningPromise - The promise we expect to settle first.
 */
async function assertNoPermissionDialog(browser, winningPromise) {
  let dialogOpened = false;
  let dialogPromise = waitForProtocolPermissionDialog(browser, true).then(
    () => {
      dialogOpened = true;
    }
  );

  await winningPromise;
  ok(!dialogOpened, "No permission dialog should have been shown.");

  // Don't leave the dialog listener dangling.
  dialogPromise.catch(() => {});
}

/**
 * Assigns location.href from page script, so the navigation is triggered by the
 * page's own principal and carries no user activation. Assigning
 * content.location straight from a SpecialPowers sandbox would not do: the
 * sandbox is chrome and has no incumbent window, so LocationBase::Navigate
 * attributes the load to the system principal, which isn't gated.
 *
 * @param {MozBrowser} browser - Browser whose page should navigate.
 * @param {string} uri - URI to navigate to.
 */
function navigateFromPageScript(browser, uri) {
  return SpecialPowers.spawn(browser, [uri], target => {
    let script = content.document.createElement("script");
    script.textContent = `location.href = ${JSON.stringify(target)};`;
    content.document.body.appendChild(script);
  });
}

/**
 * Cancels (and waits for the close of) an open protocol permission dialog so
 * nothing is launched.
 *
 * @param {MozBrowser} browser - Browser the dialog belongs to.
 * @param {SubDialog} dialog - The open permission dialog.
 */
async function cancelPermissionDialog(browser, dialog) {
  let dialogClosedPromise = waitForProtocolPermissionDialog(browser, false);
  let dialogEl = getDialogElementFromSubDialog(dialog);
  dialogEl.cancelDialog();
  await dialogClosedPromise;
}

/**
 * With transient user activation (a real click on a mailto link), the mailto
 * navigation launches silently with no permission dialog.
 */
add_task(async function test_mailto_with_user_activation_launches_silently() {
  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    await SpecialPowers.spawn(browser, [MAILTO_A], uri => {
      let link = content.document.createElement("a");
      link.href = uri;
      link.id = "mailto-link";
      link.textContent = "mail me";
      // Give the link a known size/position so synthesizeMouseAtCenter hits it.
      link.style.cssText =
        "display:block;position:absolute;top:0;left:0;width:200px;height:50px;";
      content.document.body.appendChild(link);
    });

    let silentLaunchPromise = waitForSilentLaunch(browser);

    info("Synthesizing a real click on the mailto link.");
    await BrowserTestUtils.synthesizeMouseAtCenter("#mailto-link", {}, browser);

    await assertNoPermissionDialog(browser, silentLaunchPromise);
    ok(true, "Web handler URL loaded silently with user activation.");
  });
});

/**
 * Without transient user activation (a scripted location assignment), the
 * mailto navigation falls back to the permission dialog instead of launching.
 */
add_task(async function test_mailto_without_user_activation_prompts() {
  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    let dialogOpenPromise = waitForProtocolPermissionDialog(browser, true);

    info("Navigating to mailto without a user gesture.");
    await navigateFromPageScript(browser, MAILTO_A);

    let dialog = await dialogOpenPromise;
    ok(dialog, "Permission dialog shown without user activation.");

    // Cancel so nothing is launched.
    await cancelPermissionDialog(browser, dialog);
  });
});

/**
 * Core regression guard for bug 299116: a silent mailto launch must CONSUME the
 * transient user gesture activation, so a single gesture can't chain multiple
 * launches (the original infinite-loop concern from comment 0). The user-visible
 * effect of that consumption - a second, now activation-less navigation falling
 * back to the prompt - is covered by test_mailto_without_user_activation_prompts.
 *
 * We trigger the mailto from a same-origin iframe link click. Consumption walks
 * the whole top-level browsing context tree
 * (WindowContext::ConsumeTransientUserGestureActivation), so it clears the top
 * document's activation too. The iframe launch does not navigate the top
 * document (a web handler launched from a subframe opens elsewhere), so we can
 * read the top document's activation state afterwards and assert it was
 * consumed.
 */
add_task(async function test_mailto_activation_consumed_no_chaining() {
  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    // Build a same-origin iframe containing a mailto link.
    await SpecialPowers.spawn(
      browser,
      [TEST_ORIGIN, MAILTO_A],
      async (origin, uri) => {
        let frame = content.document.createElement("iframe");
        frame.id = "child";
        let loaded = ContentTaskUtils.waitForEvent(frame, "load");
        frame.src = origin + "/";
        content.document.body.appendChild(frame);
        await loaded;

        await SpecialPowers.spawn(frame, [uri], innerUri => {
          let link = content.document.createElement("a");
          link.href = innerUri;
          link.id = "mailto-link";
          link.textContent = "mail me";
          link.style.cssText =
            "display:block;position:absolute;top:0;left:0;width:200px;height:50px;";
          content.document.body.appendChild(link);
        });
      }
    );

    // Before any interaction there is no activation to consume.
    let hasActivationBefore = await SpecialPowers.spawn(browser, [], () => {
      return SpecialPowers.wrap(content.document)
        .hasValidTransientUserGestureActivation;
    });
    ok(!hasActivationBefore, "No transient activation before the click.");

    info("Synthesizing a real click on the mailto link in the iframe.");
    let childBC = browser.browsingContext.children[0];
    await BrowserTestUtils.synthesizeMouseAtCenter("#mailto-link", {}, childBC);

    // The activation is consumed asynchronously in nsDocShell::OnLinkClickSync,
    // tree-wide. Wait until the top document reports no transient activation:
    // this is the consumption that prevents a single gesture from chaining
    // launches. The top document is not navigated by the iframe launch.
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () =>
          !SpecialPowers.wrap(content.document)
            .hasValidTransientUserGestureActivation,
        "Transient activation should be consumed by the silent mailto launch"
      );
    });
    ok(true, "Transient activation was consumed by the silent mailto launch.");
  });
});

/**
 * Only web content has to prove activation. Chrome-initiated loads never carry
 * it - nsIExternalProtocolService.loadURI takes aHasValidUserGestureActivation
 * as an optional argument that privileged callers leave unset - so gating them
 * would break in-product features like "Email Link", and hang any chrome page
 * whose load resolves through a protocol handler. Talos' pageloader is one:
 * it navigates the browser to ext+damp:/ext+twinopen: with the system
 * principal, so gating it stalled those suites on the permission dialog.
 */
add_task(async function test_system_principal_navigation_launches_silently() {
  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    let silentLaunchPromise = waitForSilentLaunch(browser);

    info("Navigating the browser to mailto from chrome, without a gesture.");
    browser.loadURI(Services.io.newURI(MAILTO_A), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });

    await assertNoPermissionDialog(browser, silentLaunchPromise);
    ok(true, "Web handler URL loaded silently for a chrome-initiated load.");
  });
});

/**
 * The same, for a direct nsIExternalProtocolService.loadURI call omitting the
 * activation argument, which is how chrome code that isn't navigating a browser
 * hands a URI to the OS (e.g. MailIntegration's "Email Link"). Those callers
 * pass no browsing context; we do, so the web handler load happens in this tab
 * and is observable.
 */
add_task(async function test_system_principal_load_uri_launches_silently() {
  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    let silentLaunchPromise = waitForSilentLaunch(browser);

    info("Calling loadURI with the system principal, without a gesture.");
    gExternalProtocolService.loadURI(
      Services.io.newURI(MAILTO_A),
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      browser.browsingContext
    );

    await assertNoPermissionDialog(browser, silentLaunchPromise);
    ok(true, "Web handler URL loaded silently for a system principal caller.");
  });
});

/**
 * With the pref disabled, the legacy behaviour applies: a scripted (no
 * activation) mailto navigation launches silently with no dialog.
 */
add_task(async function test_pref_disabled_legacy_silent_launch() {
  await SpecialPowers.pushPrefEnv({
    set: [["network.protocol-handler.prompt-without-user-activation", false]],
  });

  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async browser => {
    let silentLaunchPromise = waitForSilentLaunch(browser);

    info("Navigating to mailto without a gesture, pref disabled.");
    await navigateFromPageScript(browser, MAILTO_A);

    await assertNoPermissionDialog(browser, silentLaunchPromise);
    ok(true, "Web handler URL loaded silently with the pref disabled.");
  });

  await SpecialPowers.popPrefEnv();
});
