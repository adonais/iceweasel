/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  MessagingSystemBlocklists,
  BLOCKED_ACTION_ONLY_ACTIONS,
  BLOCKED_SET_PREFS,
  BLOCKED_SET_PREF_PREFIXES,
} = ChromeUtils.importESModule(
  "resource://messaging-system/lib/MessagingSystemBlocklists.sys.mjs"
);

add_task(function test_blocked_action_only_actions() {
  for (const type of [
    "INSTALL_ADDON_FROM_URL",
    "SHOW_SPOTLIGHT",
    "OPEN_URL",
    "CONFIGURE_HOMEPAGE",
    "FXA_SIGNIN_FLOW",
    "SUMMARIZE_PAGE",
  ]) {
    Assert.ok(
      MessagingSystemBlocklists.isActionOnlyActionBlocked(type),
      `${type} is blocked for action_only messages`
    );
  }

  for (const type of [
    // Both in-tree baseline entries must stay grantable.
    "CONFIRM_LAUNCH_ON_LOGIN",
    "PIN_FIREFOX_TO_TASKBAR",
    // Grantable by design, bounded by the SET_PREF blocklists instead.
    "SET_PREF",
    // Grantable by design, bounded by _isAllowedActionOnlyMessageAction, which
    // allows it only as the top level action and validates its children.
    "MULTI_ACTION",
    // Grantable by design. These are the kinds of actions the collection exists
    // to experiment with.
    "SET_DEFAULT_BROWSER",
    "PIN_AND_DEFAULT",
    "SET_DEFAULT_PDF_HANDLER",
    "SET_DEFAULT_PROTOCOL_HANDLER",
    "PIN_FIREFOX_TO_START_MENU",
    "PIN_TASKBAR_TAB",
    "CREATE_TASKBAR_TAB",
    "CANCEL",
    "OPEN_FIREFOX_VIEW",
    "SOMETHING_UNKNOWN",
  ]) {
    Assert.ok(
      !MessagingSystemBlocklists.isActionOnlyActionBlocked(type),
      `${type} is not blocked`
    );
  }
});

add_task(function test_blocked_set_prefs() {
  for (const name of [
    // Exact entries.
    "pdfjs.enableScripting",
    "privacy.trackingprotection.enabled",
    // One pref per blocked prefix, to catch a prefix that never matches.
    "app.update.auto",
    "extensions.autoDisableScopes",
    "xpinstall.signatures.required",
    "network.proxy.type",
    "network.dns.disablePrefetch",
    "network.trr.mode",
    "network.protocol-handler.expose.mailto",
    "security.enterprise_roots.enabled",
    "dom.security.https_only_mode",
    "general.config.filename",
    "capability.policy.default.Window.alert",
    "javascript.options.wasm",
    "devtools.debugger.remote-enabled",
    "browser.policies.perUserDir",
    "browser.safebrowsing.malware.enabled",
    "permissions.default.camera",
    "services.settings.server",
    "services.sync.username",
    "app.normandy.api_url",
    "messaging-system.rsexperimentloader.collection_id",
    "browser.newtabpage.activity-stream.asrouter.providers.cfr",
    "toolkit.telemetry.server",
    "identity.fxaccounts.autoconfig.uri",
    "signon.rememberSignons",
    "privacy.sanitize.sanitizeOnShutdown",
    "privacy.clearOnShutdown_v2.cookiesAndStorage",
    "browser.download.dir",
    "browser.search.suggest.enabled",
  ]) {
    Assert.ok(
      MessagingSystemBlocklists.isSetPrefBlocked(name),
      `${name} is blocked for SET_PREF`
    );
  }

  for (const name of [
    // Prefs the in-tree baseline allows, which must not be shadowed.
    "browser.aboutwelcome.didSeeFinalScreen",
    "browser.newtabpage.activity-stream.remote-renderer.enabled",
    "browser.startup.homepage",
    "browser.toolbars.bookmarks.visibility",
    "messaging-system.askForFeedback",
    "datareporting.healthreport.uploadEnabled",
    "privacy.trackingprotection.allow_list.baseline.enabled",
    "termsofuse.acceptedVersion",
    "sidebar.verticalTabs",
    "foo.pref",
  ]) {
    Assert.ok(
      !MessagingSystemBlocklists.isSetPrefBlocked(name),
      `${name} is not blocked`
    );
  }
});

add_task(function test_no_redundant_prefix_entries() {
  for (const name of BLOCKED_SET_PREFS) {
    Assert.ok(
      !BLOCKED_SET_PREF_PREFIXES.some(prefix => name.startsWith(prefix)),
      `${name} is not already covered by a blocked prefix`
    );
  }
  Assert.greater(BLOCKED_ACTION_ONLY_ACTIONS.size, 0);
});
