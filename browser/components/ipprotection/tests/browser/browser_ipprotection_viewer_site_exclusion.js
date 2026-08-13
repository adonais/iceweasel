/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getSitePrincipal } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-utils.mjs"
);

const PERM_NAME = "ipp-vpn";
const DISABLE_VPN_EVENT = "IPProtection:UserDisableVPNForSite";
const ENABLE_VPN_EVENT = "IPProtection:UserEnableVPNForSite";

const REAL_SITE = "https://example.com";
const PDF_VIEWER_ORIGIN = "resource://pdf.js";
const JSON_VIEWER_ORIGIN = "resource://devtools";

function makePrincipal(uriSpec) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(uriSpec),
    {}
  );
}

/**
 * Verifies getSitePrincipal derives the principal from the URL bar URI rather
 * than the content document's principal. This matters for pages rendered
 * through Firefox's built-in pdf.js and JSON viewers, whose content
 * principal points at the resource:// viewer origin instead of the
 * underlying http(s) URL the user navigated to (Bug 2034088).
 */
add_task(async function test_getSitePrincipal_uses_url_bar_uri() {
  const realURI = Services.io.newURI(REAL_SITE + "/file.pdf");

  const pdfViewerPrincipal = makePrincipal(PDF_VIEWER_ORIGIN);
  const pdfGBrowser = {
    currentURI: realURI,
    contentPrincipal: pdfViewerPrincipal,
  };
  Assert.equal(
    getSitePrincipal(pdfGBrowser).origin,
    REAL_SITE,
    "getSitePrincipal returns the underlying site origin on pdf.js viewer pages"
  );

  const jsonViewerPrincipal = makePrincipal(JSON_VIEWER_ORIGIN);
  const jsonGBrowser = {
    currentURI: Services.io.newURI(REAL_SITE + "/data.json"),
    contentPrincipal: jsonViewerPrincipal,
  };
  Assert.equal(
    getSitePrincipal(jsonGBrowser).origin,
    REAL_SITE,
    "getSitePrincipal returns the underlying site origin on JSON viewer pages"
  );
});

add_task(async function test_getSitePrincipal_handles_missing_browser() {
  Assert.equal(
    getSitePrincipal(null),
    null,
    "getSitePrincipal returns null when gBrowser is missing"
  );
  Assert.equal(
    getSitePrincipal({ currentURI: null }),
    null,
    "getSitePrincipal returns null when there is no currentURI"
  );
});

/**
 * Verifies that privileged chrome:// URLs flow through getSitePrincipal as
 * non-system content principals, and that IPPExceptionsManager.canManage still
 * treats them as unmanageable so site-exclusion controls never appear over
 * chrome UI surfaces.
 *
 * The panel and toolbar button used to derive their principal from
 * gBrowser.contentPrincipal, which for chrome:// pages is the system principal
 * that canManage rejects via its isSystemPrincipal branch. After Bug 2034088
 * they use createContentPrincipal(currentURI, ...), and a chrome:// URL
 * produces a chrome-scoped content principal that is neither a system
 * principal nor schemeIs("about"). canManage was widened with a schemeIs
 * ("chrome") branch to keep these pages out of the VPN's site-exclusion UI.
 */
add_task(async function test_chrome_url_is_treated_as_privileged() {
  const CHROME_URL = "chrome://browser/content/browser.xhtml";
  const chromeGBrowser = {
    currentURI: Services.io.newURI(CHROME_URL),
    contentPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  };

  const principal = getSitePrincipal(chromeGBrowser);

  Assert.ok(
    principal,
    "getSitePrincipal returns a principal for chrome:// URLs"
  );
  Assert.ok(
    principal.schemeIs("chrome"),
    "Derived principal has the chrome: scheme"
  );
  Assert.ok(
    !principal.isSystemPrincipal,
    "Derived principal is not a system principal — the isSystemPrincipal branch would miss this"
  );
  Assert.ok(
    !principal.schemeIs("about"),
    "Derived principal does not match schemeIs('about') either"
  );

  Assert.ok(
    !IPPExceptionsManager.canManage(principal),
    "canManage should treat chrome:// URLs as unmanageable so the site-exclusion UI stays hidden"
  );
});

/**
 * Verifies that toggling the panel's site-exclusion control stores the
 * permission against the URL bar origin (the principal getSitePrincipal
 * derives), and that re-enabling clears it for the same origin. This is
 * the integration counterpart to the unit tests above.
 */
add_task(async function test_exclusion_toggle_stores_url_bar_origin() {
  const sandbox = sinon.createSandbox();
  Services.perms.removeByType(PERM_NAME);

  setupService({
    isReady: true,
  });

  sandbox.stub(IPPProxyManager, "state").value(IPPProxyStates.ACTIVE);

  let setExclusionSpy = sandbox.spy(IPPExceptionsManager, "setExclusion");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, REAL_SITE);

  let content = await openPanel({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
    },
  });

  Assert.ok(
    content.siteExclusionToggleEl,
    "Site exclusion toggle should be present"
  );

  // Disable VPN for site (add exclusion).
  let disableVPNPromise = BrowserTestUtils.waitForEvent(
    window,
    DISABLE_VPN_EVENT
  );
  content.siteExclusionToggleEl.click();
  await disableVPNPromise;

  Assert.ok(
    setExclusionSpy.calledOnce,
    "IPPExceptionsManager.setExclusion should be called once"
  );
  Assert.equal(
    setExclusionSpy.firstCall.args[0]?.origin,
    REAL_SITE,
    "setExclusion receives a principal whose origin matches the URL bar URL"
  );
  Assert.strictEqual(
    setExclusionSpy.firstCall.args[1],
    true,
    "setExclusion should be called with shouldExclude=true"
  );

  // Confirm the permission is registered on the real site.
  let permEntries = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(p => p.capability === Ci.nsIPermissionManager.DENY_ACTION);
  Assert.equal(permEntries.length, 1, "There should be one exclusion entry");
  Assert.equal(
    permEntries[0].principal.origin,
    REAL_SITE,
    "Permission is stored against the underlying site origin"
  );

  // Re-enable VPN for site (remove exclusion).
  let enableVPNPromise = BrowserTestUtils.waitForEvent(
    window,
    ENABLE_VPN_EVENT
  );
  content.siteExclusionToggleEl.click();
  await enableVPNPromise;

  Assert.equal(
    setExclusionSpy.secondCall.args[0]?.origin,
    REAL_SITE,
    "Re-enabling VPN removes the exclusion for the underlying site origin"
  );

  await closePanel();
  BrowserTestUtils.removeTab(tab);
  Services.perms.removeByType(PERM_NAME);
  sandbox.restore();
});
