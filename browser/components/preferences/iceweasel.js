/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from extensionControlled.js */
/* import-globals-from preferences.js */

ChromeUtils.importESModule(
  "chrome://browser/content/preferences/config/about-iceweasel.mjs",
  { global: "current" }
);

ChromeUtils.defineLazyGetter(this, "ice_l10n", function () {
  return new Localization(["browser/preferences/preferences.ftl"], true);
});

const [chromepop, downloadpop, downloadneeded] = this.ice_l10n.formatValuesSync([
  "iceweasel-libportable-chrome-pop",
  "iceweasel-libportable-download-pop",
  "iceweasel-libportable-download-needed",
]);

function create_element (doc, type, attrs = {}) {
  let el = type.startsWith('html:') ? doc.createElementNS('http://www.w3.org/1999/xhtml', type) : doc.createXULElement(type);
  for (let key of Object.keys(attrs)) {
    if (key === 'innerHTML') {
      el.innerHTML = attrs[key].replace(/<br>/g, "");
    } else if (key.startsWith('on')) {
      el.addEventListener(key.slice(2).toLocaleLowerCase(), attrs[key]);
    } else {
      el.setAttribute(key, attrs[key]);
    }
  }
  return el;
}

if (Services.prefs.getBoolPref("browser.settings-redesign.enabled", false)) {
  if (!document.getElementById('iceweasel-chrome-box')) {
    document.body.appendChild(create_element(document, "html:div", {
      id: "iceweasel-chrome-box",
      innerHTML: chromepop,
      // 使用较高的Z轴, 1000, 确保fixed生效
      style: "color:white; background-color:#f44336; bottom:20px; right:30px; position:fixed; z-index:1000; border-radius:5px; box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2); padding:10px; font-size:18px; display: none;",
    }));
  }
  if (!document.getElementById('iceweasel-download-box')) {
    document.body.appendChild(create_element(document, "html:div", {
      id: "iceweasel-download-box",
      innerHTML: downloadpop,
      style: "color:white; background-color:#f44336; bottom:20px; right:30px; position:fixed; z-index:1000; border-radius:5px; box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2); padding:10px; font-size:18px; display: none;",
    }));
  }
  if (!document.getElementById('iceweasel-download-needed')) {
    document.body.appendChild(create_element(document, "html:div", {
      id: "iceweasel-download-needed",
      innerHTML: downloadneeded,
      style: "color:white; background-color:#f44336; bottom:20px; right:30px; position:fixed; z-index:1000; border-radius:5px; box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2); padding:10px; font-size:18px; display: none;",
    }));
  }
}

const gIceweaselPane = {
  _pane: null,
  inited: false,
  _observerAdded: false,

  // called when the document is first parsed
  async init() {
    if (this.inited) {
      return;
    }
    this.inited = true;
    this._pane = document.getElementById("paneIceweasel");
    initSettingGroup("icefeatures");
    if (AppConstants.platform === "win") {
        initSettingGroup("icelibportable");
    } else {
        initSettingGroup("icelibportable_linux");
    }
    initSettingGroup("icefooter");

    window.addEventListener("unload", () => this._removeObservers());

    // Notify observers that the UI is now ready
    Services.obs.addObserver(this, "iceweasel-pane-loaded");
    this._observerAdded = true;
  },

  _removeObservers() {
    if (this._observerAdded) {
      Services.obs.removeObserver(this, "iceweasel-pane-loaded");
      this._observerAdded = false;
    }
  },

};
