/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const port = browser.runtime.connectNative("browser");

const APIS = {
  AddHistogram({ id, value }) {
    browser.test.addHistogram(id, value);
  },
  Eval({ code }) {
    // eslint-disable-next-line no-eval
    return eval(`(async () => {
      ${code}
    })()`);
  },
  GetRequestedLocales() {
    return browser.test.getRequestedLocales();
  },
  ClearUserPref({ pref }) {
    return browser.test.clearUserPref(pref);
  },
  GetLinkColor({ tab, selector }) {
    return browser.test.getLinkColor(tab.id, selector);
  },
  GetPidForTab({ tab }) {
    return browser.test.getPidForTab(tab.id);
  },
  WaitForContentTransformsReceived({ tab }) {
    return browser.test.waitForContentTransformsReceived(tab.id);
  },
  GetProfilePath() {
    return browser.test.getProfilePath();
  },
  GetAllBrowserPids() {
    return browser.test.getAllBrowserPids();
  },
  KillContentProcess({ pid }) {
    return browser.test.killContentProcess(pid);
  },
  GetPrefs({ prefs }) {
    return browser.test.getPrefs(prefs);
  },
  GetActive({ tab }) {
    return browser.test.getActive(tab.id);
  },
  RemoveAllCertOverrides() {
    browser.test.removeAllCertOverrides();
  },
  RestorePrefs({ oldPrefs }) {
    return browser.test.restorePrefs(oldPrefs);
  },
  SetPrefs({ oldPrefs, newPrefs }) {
    return browser.test.setPrefs(oldPrefs, newPrefs);
  },
  SetResolutionAndScaleTo({ tab, resolution }) {
    return browser.test.setResolutionAndScaleTo(tab.id, resolution);
  },
  FlushApzRepaints({ tab }) {
    return browser.test.flushApzRepaints(tab.id);
  },
  ZoomToFocusedInput({ tab }) {
    return browser.test.zoomToFocusedInput(tab.id);
  },
  PromiseAllPaintsDone({ tab }) {
    return browser.test.promiseAllPaintsDone(tab.id);
  },
  UsingGpuProcess() {
    return browser.test.usingGpuProcess();
  },
  KillGpuProcess() {
    return browser.test.killGpuProcess();
  },
  CrashGpuProcess() {
    return browser.test.crashGpuProcess();
  },
  ClearHSTSState() {
    return browser.test.clearHSTSState();
  },
  IsFissionRunning() {
    return browser.test.isFissionRunning();
  },
  TriggerCookieBannerDetected({ tab }) {
    return browser.test.triggerCookieBannerDetected(tab.id);
  },
  TriggerCookieBannerHandled({ tab }) {
    return browser.test.triggerCookieBannerHandled(tab.id);
  },
  TriggerTranslationsOffer({ tab }) {
    return browser.test.triggerTranslationsOffer(tab.id);
  },
  TriggerLanguageStateChange({ tab, languageState }) {
    return browser.test.triggerLanguageStateChange(tab.id, languageState);
  },
  SetHandlingUserInput({ tab, handlingUserInput }) {
    return browser.test.setHandlingUserInput(tab.id, handlingUserInput);
  },
  GetWebExtensionSchemaPermissionNames({ typeNames }) {
    return browser.test.getWebExtensionsSchemaPermissionNames(typeNames);
  },
  TeardownAlertsService() {
    return browser.test.teardownAlertsService();
  },
  NotifyUserGestureActivation({ tab }) {
    return browser.test.notifyUserGestureActivation(tab.id);
  },
  SaveTrackingDBEvents({ log }) {
    return browser.test.saveTrackingDBEvents(log);
  },
  ClearTrackingDB() {
    return browser.test.clearTrackingDB();
  },
  AddVirtualAuthenticator() {
    return browser.test.addVirtualAuthenticator();
  },
  RemoveVirtualAuthenticator({ authenticatorId }) {
    return browser.test.removeVirtualAuthenticator(authenticatorId);
  },
  SetupIPPAuthProvider({ options }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const encode = obj => btoa(JSON.stringify(obj));
    const proxyPassToken = [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({
        iat: nowSec + 1,
        nbf: nowSec,
        exp: nowSec + 24 * 60 * 60,
        sub: "proxy-pass-user-42",
        aud: "guardian-proxy",
        iss: "vpn.mozilla.org",
      }),
      "signature",
    ].join(".");
    return browser.test.setupIPPAuthProvider({ ...options, proxyPassToken });
  },
  SimulateIPPSignIn({ signedIn }) {
    return browser.test.simulateIPPSignIn(signedIn);
  },
  SetIPPProxyPassError({ error }) {
    return browser.test.setIPPProxyPassError(error);
  },
  SetIPPProxyUsage({ usage }) {
    return browser.test.setIPPProxyUsage(usage);
  },
  GetIPPProxyInfo() {
    return browser.test.getIPPProxyInfo();
  },
};

port.onMessage.addListener(async message => {
  const impl = APIS[message.type];
  apiCall(message, impl);
});

browser.runtime.onConnect.addListener(contentPort => {
  contentPort.onMessage.addListener(message => {
    message.args.tab = contentPort.sender.tab;

    const impl = APIS[message.type];
    apiCall(message, impl);
  });
});

function apiCall(message, impl) {
  const { id, args } = message;
  try {
    sendResponse(id, impl(args));
  } catch (error) {
    sendResponse(id, Promise.reject(error));
  }
}

function sendResponse(id, response) {
  Promise.resolve(response).then(
    value => sendSyncResponse(id, value),
    reason => sendSyncResponse(id, null, reason)
  );
}

function sendSyncResponse(id, response, exception) {
  port.postMessage({
    id,
    response: JSON.stringify(response),
    exception: exception && exception.toString(),
  });
}
