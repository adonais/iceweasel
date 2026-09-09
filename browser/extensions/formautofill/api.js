/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals ExtensionAPI, Services, XPCOMUtils */

const CACHED_STYLESHEETS = new WeakMap();

ChromeUtils.defineESModuleGetters(this, {
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
  EngineProcess: "chrome://global/content/ml/EngineProcess.sys.mjs",
  FormAutofill: "resource://autofill/FormAutofill.sys.mjs",
  FormAutofillParent: "resource://autofill/FormAutofillParent.sys.mjs",
  FormAutofillStatus: "resource://autofill/FormAutofillParent.sys.mjs",
  FormAutofillUtils: "resource://gre/modules/shared/FormAutofillUtils.sys.mjs",
  AutoCompleteParent: "moz-src:///toolkit/actors/AutoCompleteParent.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  this,
  "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  Ci.nsISubstitutingProtocolHandler
);

const RESOURCE_HOST = "formautofill";

function insertStyleSheet(domWindow, url) {
  let doc = domWindow.document;
  let styleSheetAttr = `href="${url}" type="text/css"`;
  let styleSheet = doc.createProcessingInstruction(
    "xml-stylesheet",
    styleSheetAttr
  );

  doc.insertBefore(styleSheet, doc.documentElement);

  if (CACHED_STYLESHEETS.has(domWindow)) {
    CACHED_STYLESHEETS.get(domWindow).push(styleSheet);
  } else {
    CACHED_STYLESHEETS.set(domWindow, [styleSheet]);
  }
}

/**
 * Ask the inference process whether the native ONNX runtime is available and
 * record the answer in a pref. The pref persists across sessions, so it can
 * be stale after an update or when a profile moves to another machine.
 * Refreshing it on idle at startup corrects a stale value before the user
 * reaches their first form.
 */
function refreshNativeOnnxRuntimeAvailability() {
  if (!FormAutofillUtils.isMLAutofillEnabled) {
    return;
  }

  // Assume the runtime is unavailable until the probe answers, so that a value
  // recorded by an earlier session can never be read back as a false positive.
  FormAutofillUtils.setNativeOnnxRuntimeAvailable(false);

  ChromeUtils.idleDispatch(async () => {
    FormAutofillUtils.setNativeOnnxRuntimeAvailable(
      await EngineProcess.requestIsNativeOnnxRuntimeAvailable()
    );
  });
}

function ensureCssLoaded(domWindow) {
  if (CACHED_STYLESHEETS.has(domWindow)) {
    // This window already has autofill stylesheets.
    return;
  }

  insertStyleSheet(domWindow, "chrome://formautofill/content/formautofill.css");
}

this.formautofill = class extends ExtensionAPI {
  /**
   * Adjusts and checks form autofill preferences during startup.
   */
  adjustAndCheckFormAutofillPrefs() {
    const addressAutofillAvailable = FormAutofill.isAutofillTypeAvailable(
      AutofillDataTypes.ADDRESS
    );
    const creditCardAutofillAvailable = FormAutofill.isAutofillTypeAvailable(
      AutofillDataTypes.CREDIT_CARD
    );

    // Reset the sync prefs in case the features were previously available
    // but aren't now.
    if (!creditCardAutofillAvailable) {
      Services.prefs.clearUserPref(
        "services.sync.engine.creditcards.available"
      );
    }
    if (!addressAutofillAvailable) {
      Services.prefs.clearUserPref("services.sync.engine.addresses.available");
    }

    if (!addressAutofillAvailable && !creditCardAutofillAvailable) {
      Services.prefs.clearUserPref("dom.forms.autocomplete.formautofill");
      Glean.formautofill.availability.set(false);
      return;
    }

    // This pref is used for web contents to detect the autocomplete feature.
    // When it's true, "element.autocomplete" will return tokens we currently
    // support -- otherwise it'll return an empty string.
    Services.prefs.setBoolPref("dom.forms.autocomplete.formautofill", true);
    Glean.formautofill.availability.set(true);

    // These "*.available" prefs determines whether the "addresses"/"creditcards" sync engine is
    // available (ie, whether it is shown in any UI etc) - it *does not* determine
    // whether the engine is actually enabled or not.
    if (addressAutofillAvailable) {
      Services.prefs.setBoolPref(
        "services.sync.engine.addresses.available",
        true
      );
    } else {
      Services.prefs.clearUserPref("services.sync.engine.addresses.available");
    }
    if (creditCardAutofillAvailable) {
      Services.prefs.setBoolPref(
        "services.sync.engine.creditcards.available",
        true
      );
    } else {
      Services.prefs.clearUserPref(
        "services.sync.engine.creditcards.available"
      );
    }
  }
  onStartup() {
    // We have to do this before actually determining if we're enabled, since
    // there are scripts inside of the core browser code that depend on the
    // FormAutofill JSMs being registered.
    let uri = Services.io.newURI("chrome/res/", null, this.extension.rootURI);
    resProto.setSubstitution(RESOURCE_HOST, uri);

    let aomStartup = Cc[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Ci.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(
      "manifest.json",
      null,
      this.extension.rootURI
    );
    this.chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "formautofill", "content/"],
    ]);

    this.adjustAndCheckFormAutofillPrefs();

    // Listen for the autocomplete popup message
    // or the form submitted message (which may trigger a
    // doorhanger) to lazily append our stylesheets related
    // to the autocomplete feature.
    AutoCompleteParent.addPopupStateListener(ensureCssLoaded);
    FormAutofillParent.addMessageObserver(this);
    this.onFormSubmitted = (data, window) => ensureCssLoaded(window);

    FormAutofillStatus.init();

    ChromeUtils.registerWindowActor("FormAutofill", {
      parent: {
        esModuleURI: "resource://autofill/FormAutofillParent.sys.mjs",
      },
      child: {
        esModuleURI: "resource://autofill/FormAutofillChild.sys.mjs",
        events: {
          focusin: { capture: true },
          "form-changed": { createActor: false },
          "form-submission-detected": { createActor: false },
        },
      },
      allFrames: true,
      safeForUntrustedWebProcess: true,
    });

    refreshNativeOnnxRuntimeAvailability();
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    resProto.setSubstitution(RESOURCE_HOST, null);

    this.chromeHandle.destruct();
    this.chromeHandle = null;

    ChromeUtils.unregisterWindowActor("FormAutofill");

    AutoCompleteParent.removePopupStateListener(ensureCssLoaded);
    FormAutofillParent.removeMessageObserver(this);

    for (let win of Services.wm.getEnumerator("navigator:browser")) {
      let cachedStyleSheets = CACHED_STYLESHEETS.get(win);

      if (!cachedStyleSheets) {
        continue;
      }

      while (cachedStyleSheets.length !== 0) {
        cachedStyleSheets.pop().remove();
      }
    }
  }
};
