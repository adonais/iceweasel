/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/preferences/tests/head.js",
  this
);

let { Region } = ChromeUtils.importESModule(
  "resource://gre/modules/Region.sys.mjs"
);

async function clearPolicies() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson("");
}

async function getPromoCards() {
  await openPreferencesViaOpenPreferencesAPI("paneMoreFromMozilla", {
    leaveOpen: true,
  });

  let doc = gBrowser.contentDocument;
  let vpnPromoCard = doc.getElementById("mozilla-vpn");
  let monitorPromoCard = doc.getElementById("mozilla-monitor");
  let mobileCard = doc.getElementById("firefox-mobile");
  let relayPromoCard = doc.getElementById("firefox-relay");

  return {
    vpnPromoCard,
    monitorPromoCard,
    mobileCard,
    relayPromoCard,
  };
}

// Home Settings test helpers
/**
 * Opens the Home preferences page and waits for it to fully render.
 *
 * @returns {Promise<object>} Object containing the window, document, and tab references.
 */

async function mockDefaultFxAInstance() {
  /**
   * @typedef {object} MockFxAUtilityFunctions
   * @property {function():void} mock - Makes the dummy values default, creating
   *                             the illusion of a production FxA instance.
   * @property {function():void} unmock - Restores the true defaults, creating
   *                             the illusion of a custom FxA instance.
   */

  const defaultPrefs = Services.prefs.getDefaultBranch("");
  const userPrefs = Services.prefs.getBranch("");
  const realAuth = defaultPrefs.getCharPref("identity.fxaccounts.auth.uri");
  const realRoot = defaultPrefs.getCharPref("identity.fxaccounts.remote.root");
  const mockAuth = userPrefs.getCharPref("identity.fxaccounts.auth.uri");
  const mockRoot = userPrefs.getCharPref("identity.fxaccounts.remote.root");
  const mock = () => {
    defaultPrefs.setCharPref("identity.fxaccounts.auth.uri", mockAuth);
    defaultPrefs.setCharPref("identity.fxaccounts.remote.root", mockRoot);
    userPrefs.clearUserPref("identity.fxaccounts.auth.uri");
    userPrefs.clearUserPref("identity.fxaccounts.remote.root");
  };
  const unmock = () => {
    defaultPrefs.setCharPref("identity.fxaccounts.auth.uri", realAuth);
    defaultPrefs.setCharPref("identity.fxaccounts.remote.root", realRoot);
    userPrefs.setCharPref("identity.fxaccounts.auth.uri", mockAuth);
    userPrefs.setCharPref("identity.fxaccounts.remote.root", mockRoot);
  };

  mock();
  registerCleanupFunction(unmock);

  return { mock, unmock };
}

/**
 * Runs a test that checks the visibility of the Firefox Suggest preferences UI.
 * An initial Suggest enabled status is set and visibility is checked. Then a
 * Nimbus experiment is installed that enables or disables Suggest and
 * visibility is checked again. Finally the page is reopened and visibility is
 * checked again.
 *
 * @param {boolean} initialSuggestEnabled
 *   Whether Suggest should be enabled initially.
 * @param {object} initialExpected
 *   The expected visibility after setting the initial enabled status. It should
 *   be an object that can be passed to `assertSuggestVisibility()`.
 * @param {object} nimbusVariables
 *   An object mapping Nimbus variable names to values.
 * @param {object} newExpected
 *   The expected visibility after installing the Nimbus experiment. It should
 *   be an object that can be passed to `assertSuggestVisibility()`.
 * @param {string} pane
 *   The pref pane to open.
 */

function setupRegions(home, current) {
  Region._setHomeRegion(home || "");
  Region._setCurrentRegion(current || "");
}

function setLocale(language) {
  Services.locale.availableLocales = [language];
  Services.locale.requestedLocales = [language];
}

const initialHomeRegion = Region.home;

const initialCurrentRegion = Region.current;
