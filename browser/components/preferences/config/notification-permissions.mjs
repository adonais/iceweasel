/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  isTrailingDotPolicyDuplicate:
    "resource://gre/modules/PoliciesHelpers.sys.mjs",
  SitePermissions: "resource:///modules/SitePermissions.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "idnService", function () {
  return Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService);
});

ChromeUtils.defineLazyGetter(lazy, "collator", function () {
  return new Services.intl.Collator(undefined, { usage: "sort" });
});

export const NOTIFICATION_PERMISSION = "desktop-notification";

// Nimbus owns this pref, and it is only declared on Windows, so reading it with
// a false default doubles as the platform check. The companion
// `.helper.enabled` is the user's switch and is not read here.
const CLOSED_DELIVERY_AVAILABLE_PREF =
  "app.backgroundNotifications.helper.available";

/**
 * @typedef {object} NotificationSite
 * @property {string} origin The origin the decision is stored against.
 * @property {string} displayHost The host as shown to the user.
 * @property {number} capability One of the nsIPermissionManager actions.
 */

/**
 * Mirrors the filtering the notification permissions dialog applies in
 * `_addPermissionToList`, so both surfaces list the same origins.
 *
 * @param {nsIPermission} perm
 * @returns {boolean}
 */
function isDisplayable(perm) {
  return (
    // A row states either the allowed or the blocked label, so a capability
    // that is neither would be shown as a decision the user never made.
    (perm.capability === Services.perms.ALLOW_ACTION ||
      perm.capability === Services.perms.DENY_ACTION) &&
    // Checking expireType first keeps profiles without policy permissions from
    // loading PoliciesHelpers at all.
    !(
      perm.expireType === Services.perms.EXPIRE_POLICY &&
      lazy.isTrailingDotPolicyDuplicate(perm)
    ) &&
    lazy.SitePermissions.isSupportedPrincipal(perm.principal) &&
    // Skip private browsing session permissions.
    !(
      perm.principal.privateBrowsingId !==
        Services.scriptSecurityManager.DEFAULT_PRIVATE_BROWSING_ID &&
      perm.expireType === Services.perms.EXPIRE_SESSION
    )
  );
}

/**
 * The host to show for a permission, with a leading `www.` removed. Falls back
 * to the origin for the principals `isSupportedPrincipal` admits that have no
 * host, such as `file:`, where nsIPrincipal.host is empty or throws.
 *
 * @param {nsIPrincipal} principal
 * @returns {string}
 */
function displayHostFor(principal) {
  let host;
  try {
    host = principal.host;
  } catch (ex) {
    host = "";
  }
  if (!host) {
    return principal.origin;
  }
  return lazy.idnService.domainToDisplay(host).replace(/^www\./, "");
}

/**
 * @returns {nsIPermission[]} Every origin with a stored notification decision.
 */
export function getNotificationPermissions() {
  return Services.perms
    .getAllByTypes([NOTIFICATION_PERMISSION])
    .filter(isDisplayable);
}

/**
 * @returns {NotificationSite[]} Sorted by display host, locale-aware.
 */
export function getNotificationSites() {
  return getNotificationPermissions()
    .map(perm => ({
      origin: perm.principal.origin,
      displayHost: displayHostFor(perm.principal),
      capability: perm.capability,
    }))
    .sort(
      (a, b) =>
        lazy.collator.compare(a.displayHost, b.displayHost) ||
        // Origins differing only in scheme or port share a display host, so
        // without this their order would vary between refreshes.
        lazy.collator.compare(a.origin, b.origin)
    );
}

/**
 * Whether notifications can be delivered while Firefox is closed. Governs which
 * label the allowed state carries, and, once bug 2073606 lands, whether the
 * closed-delivery controls are rendered at all.
 *
 * @returns {boolean}
 */
export function isClosedDeliveryAvailable() {
  return Services.prefs.getBoolPref(CLOSED_DELIVERY_AVAILABLE_PREF, false);
}

/**
 * Whether a perm-changed subject is one this section displays. perm-changed
 * fires for every permission type, so observers need this guard.
 *
 * @param {nsISupports | null} subject Null when every permission was cleared.
 * @returns {boolean}
 */
export function isNotificationChange(subject) {
  if (!subject) {
    return true;
  }
  return (
    subject.QueryInterface(Ci.nsIPermission).type === NOTIFICATION_PERMISSION
  );
}
