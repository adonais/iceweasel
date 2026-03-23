/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from extensionControlled.js */
/* import-globals-from preferences.js */

Preferences.addAll([
  // Automatically Update Extensions
  { id: "extensions.update.enabled", type: "bool" },
  { id: "extensions.update.autoUpdateDefault", type: "bool" },
  // Clipboard autocopy/paste
  { id: "clipboard.autocopy", type: "bool" },
  { id: "middlemouse.paste", type: "bool" },
  // IPv6
  { id: "network.dns.disableIPv6", type: "bool" },
  // disable javascipt
  { id: "javascript.enabled", type: "bool" },
  // Pin tabs to taskbar
  { id: "browser.taskbarTabs.enabled", type: "bool" },
  // handoff to urlbar
  { id: "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar", type: "bool" },
  // compactmode
  { id: "browser.compactmode.show", type: "bool" },
  // lastclose
  { id: "browser.tabs.closeWindowWithLastTab", type: "bool" },
  // officialtips
  { id: "officialtips.show", type: "bool" },
  // load userChrome.css
  { id: "toolkit.legacyUserProfileCustomizations.stylesheets", type: "bool" },
]);

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
    // Set all event listeners on checkboxes
    setBoolSyncListeners(
      "iceweasel-extension-update-checkbox",
      ["extensions.update.autoUpdateDefault", "extensions.update.enabled"],
      [true,                                  true                       ],
    );
    setBoolSyncListeners(
      "iceweasel-autocopy-checkbox",
      ["clipboard.autocopy", "middlemouse.paste"],
      [true,                 true               ],
    );
    setBoolSyncListeners(
      "iceweasel-ipv6-checkbox",
      ["network.dns.disableIPv6"],
      [false,                   ],
    );
    setBoolSyncListeners(
      "iceweasel-javascript-checkbox",
      ["javascript.enabled"     ],
      [false,                   ],
    );
    setBoolSyncListeners(
      "iceweasel-taskbartabs-checkbox",
      ["browser.taskbarTabs.enabled"],
      [false,                       ],
    );
    setBoolSyncListeners(
      "iceweasel-searchhand-checkbox",
      ["browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar"],
      [true,                                                                 ],
    );
    setBoolSyncListeners(
      "iceweasel-tabcompactmode-checkbox",
      ["browser.compactmode.show"],
      [true,                     ],
    );
    setBoolSyncListeners(
      "iceweasel-lastclose-checkbox",
      ["browser.tabs.closeWindowWithLastTab"],
      [false,                               ],
    );
    setBoolSyncListeners(
      "iceweasel-tips-checkbox",
      ["officialtips.show"],
      [true,              ],
    );
    setBoolSyncListeners(
      "iceweasel-styling-checkbox",
      ["toolkit.legacyUserProfileCustomizations.stylesheets"],
      [true,                                                ],
    );

    // libportable option
    setUpcheckSyncListeners("iceweasel-libportable-upcheck-checkbox");
    setBosskeySyncListeners("iceweasel-libportable-bosskey-checkbox");
    setOntabSyncListeners("iceweasel-libportable-ontabs-checkbox");
    setUboSyncListeners("iceweasel-libportable-ubo-checkbox");
    setChromeSyncListeners("iceweasel-libportable-chrome-checkbox");
    setDownloadSyncListeners("iceweasel-libportable-download-checkbox");

    // Set event listener on open profile directory button
    setEventListener("iceweasel-open-profile", "command", openProfileDirectory);
    // Set event listener on open Github button
    setEventListener("iceweasel-config-link", "click", openGithub);
    // Set event listener on restart
    setEventListener("iceweasel-restart-profile", "click", openRestart);

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

function iniSafeGet(ini, section, key) {
  try {
    return ini.getString(section, key);
  } catch (e) {
    return null;
  }
}

function optionlibportable(msg, value) {
  const upck = AppConstants.platform === "win" ? "upcheck.exe" : "upcheck";
  let exe = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  exe.append(upck);
  if (exe.exists()) {
    let process = Cc["@mozilla.org/process/util;1"]
                   .createInstance(Ci.nsIProcess);
    let arg = ["-msg"];
    arg.push(Services.appinfo.processID);
    arg.push(msg);
    arg.push(value ? "1" : "0");
    process.init(exe);
    process.startHidden = true;
    process.noShell = true;
    process.run(false, arg, arg.length);
  }
}

function setUpcheckSyncListeners(checkboxid) {
  const element = document.getElementById(checkboxid);
  if (element) {
    let up = iniRead("General", "Update");
    if (up != null) {
      if (parseInt(up) > 0) {
        if (!element.checked) {
          element.checked = true;
        }
      } else {
        element.checked = false;
      }
      setEventListener(checkboxid, "click", onUpcheckSyncListeners);
    }
  }
}

function setUboSyncListeners(checkboxid) {
  const uboCheckbox = document.getElementById(checkboxid);
  if (uboCheckbox) {
    let uboEnable = !Services.locale.appLocaleAsBCP47.startsWith("zh-CN");
    if (!uboEnable && AppConstants.platform === "win") {
      uboCheckbox.style.display = 'none';
      document.getElementById("ubo_help").style.display = 'none';
    } else {
      let ubos = iniRead("General", "EnableUBO");
      if (ubos != null) {
        if (parseInt(ubos) > 0) {
          if (!uboCheckbox.checked) {
            uboCheckbox.checked = true;
          }
        } else {
          uboCheckbox.checked = false;
        }
        setEventListener(checkboxid, "click", onUboSyncListeners);
      }
    }
  }
}

function setChromeSyncListeners(checkboxid) {
  const chromebox = document.getElementById(checkboxid);
  if (chromebox) {
    // Get the app directory.
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    let bin = target.clone();
    if (AppConstants.platform === "win") {
      target.append("upcheck.exe");
    } else {
      target.append("upcheck");
    }
    if (target.exists()) {
      let exitValue = 1;
      let process = Cc["@mozilla.org/process/util;1"]
                     .createInstance(Ci.nsIProcess);
      let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
      process.init(target);
      process.startHidden = true;
      process.noShell = true;
      try {
        process.runw(true, ["-chrome-check", bin.path, prof.path], 3);
        exitValue = process.exitValue;
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
        exitValue = -1;
      }
      if (exitValue > 0) {
        makeMasterCheckboxesReactive(checkboxid, () => {return true;});
      } else {
        makeMasterCheckboxesReactive(checkboxid, () => {return false;}); 
      }
      setEventListener(checkboxid, "click", e => {setTimeout(onChromeSyncListeners, 1000);});
    }
  }
}

function setDownloadSyncListeners(checkboxid) {
  const downbox = document.getElementById(checkboxid);
  if (downbox) {
    // Get the app directory.
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    let bin = target.clone();
    if (AppConstants.platform === "win") {
      target.append("upcheck.exe");
    } else {
      target.append("upcheck");
    }
    if (target.exists()) {
      let exitValue = 1;
      let process = Cc["@mozilla.org/process/util;1"]
                     .createInstance(Ci.nsIProcess);
      let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
      process.init(target);
      process.startHidden = true;
      process.noShell = true;
      try {
        process.runw(true, ["-integration-check", bin.path, prof.path], 3);
        exitValue = process.exitValue;
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
        exitValue = -1;
      }
      if (exitValue > 0) {
        makeMasterCheckboxesReactive(checkboxid, () => {return true;});
      } else {
        makeMasterCheckboxesReactive(checkboxid, () => {return false;}); 
      }
      setEventListener(checkboxid, "click", e => {setTimeout(onDownloadSyncListeners, 1000);});
    }
  }
}

function setBosskeySyncListeners(checkboxid) {
  const element = document.getElementById(checkboxid);
  if (element) {
    let value = document.getElementById(checkboxid).checked;
    // Get the app directory.
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    target.append("portable.ini");
    if (target.exists()) {
      let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
      let ini = factory.createINIParser(target);
      if (ini != null) {
        let ontabs = iniSafeGet(ini, "General", "Bosskey");
        if (ontabs == "1") {
          if (!value) {
             makeMasterCheckboxesReactive(checkboxid, () => {return true;});
          }
        } else if (value) {
          makeMasterCheckboxesReactive(checkboxid, () => {return false;});
        }
        setEventListener(checkboxid, "click", onBosskeySyncListeners);
      }
    }
  }
}

function iniRead(sec, key) {
  let vaule = null;
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  target.append("portable.ini");
  if (target.exists()) {
    let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
    let ini = factory ? factory.createINIParser(target) : null;
    if (ini != null) {
      vaule = iniSafeGet(ini, sec, key);
    }
  }
  return vaule;
}

function tabChildboxChk(boxid, value, enabled) {
  let child = enabled ? iniRead("tabs", value) : "0";
  if (child != null) {
    if (parseInt(child) > 0) {
      makeMasterCheckboxesReactive(boxid, () => {return true;});
    } else {
      makeMasterCheckboxesReactive(boxid, () => {return false;});
    }
  }
}

function setOntabSyncListeners(checkboxid) {
  const element = document.getElementById(checkboxid);
  if (element) {
    let value = iniRead("General", "OnTabs");
    if (value != null) {
      let boxid1 = "iceweasel-hover-activate";
      let boxid2 = "iceweasel-double-click-close";
      let boxid3 = "iceweasel-double-click-new";
      let boxid4 = "iceweasel-mouse-hover-close";
      let boxid5 = "iceweasel-mouse-hover-new";
      let boxid6 = "iceweasel-right-click-close";
      let boxid7 = "iceweasel-right-click-recover";
      if (parseInt(value) > 0) {
        if (!element.checked) {
          element.checked = true;
        }
        tabChildboxChk(boxid1, "mouse_time", true);
        tabChildboxChk(boxid2, "double_click_close", true);
        tabChildboxChk(boxid3, "double_click_new", true);
        tabChildboxChk(boxid4, "mouse_hover_close", true);
        tabChildboxChk(boxid5, "mouse_hover_new", true);
        tabChildboxChk(boxid6, "right_click_close", true);
        tabChildboxChk(boxid7, "right_click_recover", true);
      } else {
        element.checked = false;
        document.getElementById(boxid1).disabled = true;
        document.getElementById(boxid2).disabled = true;
        document.getElementById(boxid3).disabled = true;
        document.getElementById(boxid4).disabled = true;
        document.getElementById(boxid5).disabled = true;
        document.getElementById(boxid6).disabled = true;
        document.getElementById(boxid7).disabled = true;
      }
      element.addEventListener("click", onTabSyncListeners);
      setEventListener(boxid1, "click", onTabSyncid1);
      setEventListener(boxid2, "click", onTabSyncid2);
      setEventListener(boxid3, "click", onTabSyncid3);
      setEventListener(boxid4, "click", onTabSyncid4);
      setEventListener(boxid5, "click", onTabSyncid5);
      setEventListener(boxid6, "click", onTabSyncid6);
      setEventListener(boxid7, "click", onTabSyncid7);
    }
  }
}

function openProfileDirectory() {
  // Get the profile directory.
  let currProfD = Services.dirsvc.get("ProfD", Ci.nsIFile);
  let profileDir = currProfD.path;
  // Show the profile directory.
  let nsLocalFile = Components.Constructor(
    "@mozilla.org/file/local;1",
    "nsIFile",
    "initWithPath"
  );
  new nsLocalFile(profileDir).reveal();
}

function openGithub() {
  window.open("https://github.com/adonais", "_blank");
}

function openRestart() {
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
}

function setBoolSyncListeners(checkboxid, opts, vals) {
  setSyncFromPrefListener(checkboxid, () => readGenericBoolPrefs(opts, vals));
  setSyncToPrefListener(checkboxid, () => writeGenericBoolPrefs(opts, vals, document.getElementById(checkboxid).checked));
  for (let i = 1; i < opts.length; i++) {
    Preferences.get(opts[i]).on("change", () => makeMasterCheckboxesReactive(checkboxid, () => readGenericBoolPrefs(opts, vals)));
  }
}

function showIceMessage(n) {
  let messageBox = null;
  if (!n) {
    messageBox = document.getElementById('iceweasel-chrome-box');
  }
  else if (n == 1) {
    messageBox = document.getElementById('iceweasel-download-box');
  }
  else if (n == 2) {
    messageBox = document.getElementById('iceweasel-download-needed');
  }
  if (messageBox) {
    messageBox.style.display = 'flex';
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 3000);
  }
}

function onUpcheckSyncListeners() {
  optionlibportable(0x5220, !parseInt(iniRead("General", "Update")));
}

function onUboSyncListeners() {
  optionlibportable(0x5230, !parseInt(iniRead("General", "EnableUBO")));
}

function onChromeSyncListeners() {
  const element = document.getElementById("iceweasel-libportable-chrome-checkbox");
  if (element)
  {
    let value = element.checked;
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    let bin = target.clone();
    if (AppConstants.platform === "win") {
      target.append("upcheck.exe");
    } else {
      target.append("upcheck");
    }
    if (target.exists()) {
      let process = Cc["@mozilla.org/process/util;1"]
                     .createInstance(Ci.nsIProcess);
      let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
      let chromeObserver = {
        observe: function xobserve(aSubject, aTopic) {
          if (aTopic == "process-finished") {
            showIceMessage(0);
          } else {
            console.log("The process launch failed!");
            element.checked = false;
          }
        },
        QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      };
      process.init(target);
      process.startHidden = true;
      process.noShell = true;
      try {
        if (!value) {
          process.runw(false, ["-chrome-uncheck", bin.path, prof.path], 3);
        } else {
          process.runwAsync( ["-chrome-install", bin.path, prof.path], 3, chromeObserver);
        }
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
      }
    }
  }
}

function onDownloadSyncListeners() {
  const element = document.getElementById("iceweasel-libportable-download-checkbox");
  if (element) {
    let value = element.checked;
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    let bin = target.clone();
    if (AppConstants.platform === "win") {
      target.append("upcheck.exe");
    } else {
      target.append("upcheck");
    }
    if (target.exists()) {
      let process = Cc["@mozilla.org/process/util;1"]
                     .createInstance(Ci.nsIProcess);
      let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
      let chromeObserver = {
        observe: function xobserve(aSubject, aTopic) {
          if (aTopic == "process-finished") {
            showIceMessage(1);
          } else {
            console.log("The process return false");
            showIceMessage(2);
            element.checked = false;
          }
        },
      };
      process.init(target);
      process.startHidden = true;
      process.noShell = true;
      try {
        if (!value) {
          process.runw(false, ["-integration-uncheck", bin.path, prof.path], 3);
        } else {
          process.runwAsync( ["-integration-install", bin.path, prof.path], 3, chromeObserver);
        }
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
      }
    }
  }
}

function onBosskeySyncListeners() {
  optionlibportable(0x5221, !parseInt(iniRead("General", "Bosskey")));
}

function onTabSyncListeners() {
  let status = iniRead("General", "OnTabs");
  if (status != null) {
    let value = !parseInt(status);
    let boxid1 = "iceweasel-hover-activate";
    let boxid2 = "iceweasel-double-click-close";
    let boxid3 = "iceweasel-double-click-new";
    let boxid4 = "iceweasel-mouse-hover-close";
    let boxid5 = "iceweasel-mouse-hover-new";
    let boxid6 = "iceweasel-right-click-close";
    let boxid7 = "iceweasel-right-click-recover";
    if (!value) {
      document.getElementById(boxid1).disabled = true;
      document.getElementById(boxid2).disabled = true;
      document.getElementById(boxid3).disabled = true;
      document.getElementById(boxid4).disabled = true;
      document.getElementById(boxid5).disabled = true;
      document.getElementById(boxid6).disabled = true;
      document.getElementById(boxid7).disabled = true;
    } else {
      document.getElementById(boxid1).disabled = false;
      document.getElementById(boxid2).disabled = false;
      document.getElementById(boxid3).disabled = false;
      document.getElementById(boxid4).disabled = false;
      document.getElementById(boxid5).disabled = false;
      document.getElementById(boxid6).disabled = false;
      document.getElementById(boxid7).disabled = false;
      tabChildboxChk(boxid1, "mouse_time", true);
      tabChildboxChk(boxid2, "double_click_close", true);
      tabChildboxChk(boxid3, "double_click_new", true);
      tabChildboxChk(boxid4, "mouse_hover_close", true);
      tabChildboxChk(boxid5, "mouse_hover_new", true);
      tabChildboxChk(boxid6, "right_click_close", true);
      tabChildboxChk(boxid7, "right_click_recover", true);
    }
    optionlibportable(0x5222, value);
  }
}

function onTabSyncid1() {
  optionlibportable(0x5223, !parseInt(iniRead("tabs", "mouse_time")));
}

function onTabSyncid2() {
  optionlibportable(0x5224, !parseInt(iniRead("tabs", "double_click_close")));
}

function onTabSyncid3() {
  optionlibportable(0x5225, !parseInt(iniRead("tabs", "double_click_new")));
}

function onTabSyncid4() {
  optionlibportable(0x5226, !parseInt(iniRead("tabs", "mouse_hover_close")));
}

function onTabSyncid5() {
  optionlibportable(0x5227, !parseInt(iniRead("tabs", "mouse_hover_new")));
}

function onTabSyncid6() {
  optionlibportable(0x5228, !parseInt(iniRead("tabs", "right_click_close")));
}

function onTabSyncid7() {
  optionlibportable(0x5229, !parseInt(iniRead("tabs", "right_click_recover")));
}

function makeMasterCheckboxesReactive(checkboxid, func) {
  const shouldBeChecked = func();
  document.getElementById(checkboxid).checked = shouldBeChecked;
}

// Wrapper function in case something more is required (as I suspected in the first iteration of this)
function getPref(pref) {
  const retval = Preferences.get(pref);
  return retval._value;
}

// Returns true if all the preferences in prefs are equal to onVals, false otherwise TODO may need a third array for their default values because mozilla is dumb, 
// after testing though pretty sure this was misinformation being spread by comments in default FF code that has long since been fixed
function readGenericBoolPrefs(prefs, onVals) {
  for (let i = 0; i < prefs.length; i++) {
    if (getPref(prefs[i]) != onVals[i]) {
      return false;
    }
  }
  return true;
}

function writeGenericBoolPrefs(opts, vals, changeToOn) {
  valsCopy = [...vals];
  if (!changeToOn) {
    for (let i = 0; i < vals.length; i++) {
      valsCopy[i] = !vals[i];
    }
  }
  // Start at 1 because returning sets the last one
  for (let i = 1; i < vals.length; i++) {
    Services.prefs.setBoolPref(opts[i], valsCopy[i]);
  }
  return valsCopy[0];
}
