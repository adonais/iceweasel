/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests which URIs nsINavHistoryService.canAddURI accepts, in particular the
// about: pages that are stored despite the scheme being disallowed.

const AITAB_PREF = "browser.smartwindow.aitab.enabled";

add_setup(function setup() {
  Services.prefs.setBoolPref(AITAB_PREF, true);
  registerCleanupFunction(() => Services.prefs.clearUserPref(AITAB_PREF));
});

const ADDABLE = [
  "http://example.com/",
  "https://example.com/",
  "about:smartpage",
  "about:smartpage?page=hotels_san_francisco_1.html",
  "about:smartpage?page=hotels_san_francisco_1.html#section",
  // about: module names are matched lowercased, so this is the same page.
  "about:SmartPage",
];

const NOT_ADDABLE = [
  "about:config",
  "about:smartpages",
  "about:blank",
  "chrome://browser/content/browser.xhtml",
  "resource://gre-resources/hiddenWindowMac.html",
  "data:,Hello%2C%20World!",
  "javascript:alert('hello world!');",
  "view-source:http://example.com/",
];

add_task(function test_canAddURI() {
  for (let spec of ADDABLE) {
    Assert.ok(
      PlacesUtils.history.canAddURI(Services.io.newURI(spec)),
      `${spec} can be stored`
    );
  }

  for (let spec of NOT_ADDABLE) {
    Assert.ok(
      !PlacesUtils.history.canAddURI(Services.io.newURI(spec)),
      `${spec} cannot be stored`
    );
  }
});

add_task(function test_canAddURI_smartpage_disabled() {
  Services.prefs.setBoolPref(AITAB_PREF, false);

  Assert.ok(
    !PlacesUtils.history.canAddURI(
      Services.io.newURI("about:smartpage?page=hotels_san_francisco_1.html")
    ),
    "about:smartpage is not stored while the feature is off"
  );

  Services.prefs.setBoolPref(AITAB_PREF, true);
});

add_task(function test_canAddURI_maxUrlLength() {
  Services.prefs.setIntPref("browser.history.maxUrlLength", 32);

  Assert.ok(
    !PlacesUtils.history.canAddURI(
      Services.io.newURI(`about:smartpage?page=${"a".repeat(64)}.html`)
    ),
    "about:smartpage is still subject to the maximum URL length"
  );

  Services.prefs.clearUserPref("browser.history.maxUrlLength");
});
