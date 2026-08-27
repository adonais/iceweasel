/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Denylists for the two messaging-system allowlists that can be extended
 * off-train through the `ms-action-allowlists` Remote Settings collection (see
 * MessagingSystemAllowlists.sys.mjs).
 *
 * Publishing a record to that collection grants a capability to every message
 * delivered through Nimbus without the code review that gates the in-tree
 * baseline lists. Entries here can never be granted that way - matching records
 * are discarded when the collection is read.
 *
 * This list only ever filters Remote Settings records. Consumers union the
 * baseline with what survives that filter, so an entry here has no effect if it
 * is also in the baseline, and it can never revoke a baseline entry. See
 * MessagingSystemAllowlists.sys.mjs for how the three lists resolve.
 *
 * To grant something listed here, add it to the baseline allowlist:
 * ALLOWED_ACTION_MESSAGE_ACTIONS in ASRouter.sys.mjs for actions, allowedPrefs
 * in SpecialMessageActions.setPref for prefs. Delete its entry here in the same
 * patch, since the baseline wins and the entry would no longer block anything.
 *
 * Removing an entry from this file widens what can be granted off-train and
 * should get security review.
 *
 * Deliberately absent, and grantable off-train by design: SET_PREF, bounded by
 * the pref lists below rather than by this one; the set-default actions; and the
 * pinning actions. These are the capabilities the collection exists to
 * experiment with.
 *
 */

/**
 * Special message action types that are not allowed for "action_only" template
 * messages through Remote Settings. These messages have no UI and fire as soon
 * as their trigger matches, so anything listed here would run without the user
 * seeing or agreeing to anything.
 */
export const BLOCKED_ACTION_ONLY_ACTIONS = new Set([
  // Installs code that is not part of the shipped browser.
  "INSTALL_ADDON_FROM_URL",

  // Renders message-supplied content whose buttons dispatch actions that never
  // pass through the action_only check.
  "SHOW_SPOTLIGHT",

  // Weakens a privacy or security posture, or silences the UI that would tell
  // the user about it. These also write prefs directly, bypassing SET_PREF's
  // allowlist.
  "DISABLE_DOH",
  "ACCEPT_DOH",
  "DISABLE_STP_DOORHANGERS",
  "DECLINE_DEFAULT_PDF_HANDLER",

  // Writes the homepage and newtab layout prefs through Services.prefs, so it
  // reaches prefs that SET_PREF's own allowlist would not grant.
  "CONFIGURE_HOMEPAGE",

  // Acts on the user's identity and starts a sign-in flow, enrolls them in a
  // service, or creates a profile.
  "SHOW_FIREFOX_ACCOUNTS",
  "FXA_SIGNIN_FLOW",
  "FXA_AIWINDOW_SIGNIN_FLOW",
  "IPPROTECTION_ENROLL",
  "CREATE_NEW_SELECTABLE_PROFILE",

  // Sends data off the device, or fabricates a record that the user consented
  // to something.
  "SUMMARIZE_PAGE",
  "SUBMIT_ONBOARDING_OPT_OUT_PING",
  "SET_TERMS_OF_USE_INTERACTED",
  "GET_REFERRAL_CODE",

  // Navigates the user or redirects their next search.
  "OPEN_URL",
  "SET_SEARCH_MODE",

  // Suppresses or removes parts of the browser, including messages the user is
  // meant to see, such as the terms of use notice.
  "BLOCK_MESSAGE",
  "DESTROY_UIWIDGET",
]);

/**
 * Pref branches that must never become writable by SET_PREF through Remote
 * Settings. Matched with startsWith, so an entry does not have to end at a dot.
 */
export const BLOCKED_SET_PREF_PREFIXES = [
  // Add-on and application update integrity.
  "app.update.",
  "extensions.",
  "xpinstall.",

  // Transport, name resolution, and certificate and sandbox policy.
  "network.proxy.",
  "network.dns.",
  "network.trr.",
  "network.protocol-handler.",
  "security.",
  "dom.security.",

  // Arbitrary code at startup, legacy privilege grants, and remote debugging.
  "general.config.",
  "capability.policy.",
  "javascript.options.",
  "devtools.debugger.remote-",

  // Enterprise policy and phishing/malware protection.
  "browser.policies.",
  "browser.safebrowsing.",

  // Blanket permission grants, e.g. permissions.default.camera.
  "permissions.default.",

  // Where the browser fetches configuration, experiments and messages from.
  // Granting any of these would let a record widen its own delivery channel.
  "services.settings.",
  "services.sync.",
  "app.normandy.",
  "messaging-system.rsexperimentloader.",
  "browser.newtabpage.activity-stream.asrouter.providers.",

  // Where data is sent, and the account it is tied to.
  "toolkit.telemetry.",
  "identity.fxaccounts.",

  // Stored credentials, data clearing, downloads and search configuration.
  "signon.",
  "privacy.sanitize.",
  "privacy.clearOnShutdown",
  "browser.download.",
  "browser.search.",
];

/**
 * Individual prefs that should not become writable by SET_PREF through Remote
 * Settings. These are cases where neighbouring prefs in the same branch are
 * legitimately grantable.
 */
export const BLOCKED_SET_PREFS = new Set([
  "browser.contentblocking.category",
  "datareporting.policy.dataSubmissionPolicyBypassNotification",
  "pdfjs.enableScripting",
  "privacy.resistFingerprinting",
  "privacy.trackingprotection.enabled",
  "privacy.trackingprotection.cryptomining.enabled",
  "privacy.trackingprotection.fingerprinting.enabled",
  "privacy.trackingprotection.socialtracking.enabled",
]);

export const MessagingSystemBlocklists = {
  /**
   * @param {string} type - A special message action type.
   * @returns {boolean} Whether the action may never be granted to
   *   "action_only" messages through Remote Settings.
   */
  isActionOnlyActionBlocked(type) {
    return BLOCKED_ACTION_ONLY_ACTIONS.has(type);
  },

  /**
   * @param {string} name - A pref name.
   * @returns {boolean} Whether the pref may never be made SET_PREF writable
   *   through Remote Settings.
   */
  isSetPrefBlocked(name) {
    return (
      BLOCKED_SET_PREFS.has(name) ||
      BLOCKED_SET_PREF_PREFIXES.some(prefix => name.startsWith(prefix))
    );
  },
};
