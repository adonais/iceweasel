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
  // lastclose
  { id: "browser.tabs.closeWindowWithLastTab", type: "bool" },
  // officialtips
  { id: "officialtips.show", type: "bool" },
  // load userChrome.css
  { id: "toolkit.legacyUserProfileCustomizations.stylesheets", type: "bool" },
]);

var gIceweaselPane = {
  _pane: null,

  // called when the document is first parsed
  init() {
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
      "iceweasel-lastclose-checkbox",
      ["browser.tabs.closeWindowWithLastTab"],
      [false,                               ],
    );
    setBoolSyncListeners(
      "iceweasel-tips-checkbox",
      ["officialtips.show"],
      [true,                                                ],
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

    // Set event listener on open profile directory button
    setEventListener("iceweasel-open-profile", "command", openProfileDirectory);
    // Set event listener on open Github button
    setEventListener("iceweasel-config-link", "click", openGithub);
    // Set event listener on restart
    setEventListener("iceweasel-restart-profile", "click", openRestart);

    // Notify observers that the UI is now ready
    Services.obs.notifyObservers(window, "iceweasel-pane-loaded");
  },
};

function iniSafeGet(ini, section, key) {
  try {
    return ini.getString(section, key);
  } catch (e) {
    return null;
  }
}

function optionlibportable(msg, checkboxid) {
  const upck = "upcheck.exe";
  let value = document.getElementById(checkboxid).checked;
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
  // Get the app directory.
  let value = document.getElementById(checkboxid).checked;
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  target.append("portable.ini");
  let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
  let ini = factory.createINIParser(target);
  if (ini != null) {
    let ontabs = iniSafeGet(ini, "General", "Update");
    if (ontabs == "1") {
      if (!value) {
         makeMasterCheckboxesReactive(checkboxid, () => {return true});
      }
      
    } else if (value) {
      makeMasterCheckboxesReactive(checkboxid, () => {return false});
    }
    setEventListener(checkboxid, "click", onUpcheckSyncListeners);
  }
}

function setUboSyncListeners(checkboxid) {
  let uboCheckbox = document.getElementById(checkboxid);
  let uboEnable = !Services.locale.appLocaleAsBCP47.startsWith("zh-CN");
  if (!uboEnable) {
    uboCheckbox.hidden = true;
    document.getElementById("ubo_help").style.display = 'none';
  } else {
    let value = uboCheckbox.checked;
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    target.append("portable.ini");
    let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
    let ini = factory.createINIParser(target);
    if (ini != null) {
      let ubos = iniSafeGet(ini, "General", "EnableUBO");
      if (ubos == "1") {
        if (!value) {
          makeMasterCheckboxesReactive(checkboxid, () => {return true});
        }
      } else if (value) {
        makeMasterCheckboxesReactive(checkboxid, () => {return false});
      }
      setEventListener(checkboxid, "click", onUboSyncListeners);
    }
  }
}

function setChromeSyncListeners(checkboxid) {
  // Get the app directory.
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  let bin = target.clone();
  target.append("upcheck.exe");
  if (target.exists()) {
    let exitValue = 1;
    let process = Cc["@mozilla.org/process/util;1"]
                   .createInstance(Ci.nsIProcess);
    let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
    process.init(target);
    process.startHidden = true;
    process.noShell = true;
    try {
      process.run(true, ["-chrome-check", encodeURIComponent(bin.path), encodeURIComponent(prof.path)], 3);
      exitValue = process.exitValue;
    } catch (e) {
      console.log("On Windows negative return value throws an exception");
      exitValue = -1;
    }
    if (exitValue > 0) {
      makeMasterCheckboxesReactive(checkboxid, () => {return true});
    } else {
      makeMasterCheckboxesReactive(checkboxid, () => {return false}); 
    }
    setEventListener(checkboxid, "click", onChromeSyncListeners);
  }
}

function setBosskeySyncListeners(checkboxid) {
  let value = document.getElementById(checkboxid).checked;
  // Get the app directory.
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  target.append("portable.ini");
  let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
  let ini = factory.createINIParser(target);
  if (ini != null) {
    let ontabs = iniSafeGet(ini, "General", "Bosskey");
    if (ontabs == "1") {
      if (!value) {
         makeMasterCheckboxesReactive(checkboxid, () => {return true});
      }
    } else if (value) {
      makeMasterCheckboxesReactive(checkboxid, () => {return false});
    }
    setEventListener(checkboxid, "click", onBosskeySyncListeners);
  }
}

function tabChildboxChk(ini, boxid, value, enabled) {
  let child = enabled ? iniSafeGet(ini, "tabs", value) : "0";
  if (parseInt(child) > 0) {
    makeMasterCheckboxesReactive(boxid, () => {return true});
  } else {
    makeMasterCheckboxesReactive(boxid, () => {return false});
  }
}

function setOntabSyncListeners(checkboxid) {
  // Get the app directory.
  let value = document.getElementById(checkboxid).checked;
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  target.append("portable.ini");
  let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
  let ini = factory.createINIParser(target);
  if (ini != null) {
    let boxid1 = "iceweasel-hover-activate";
    let boxid2 = "iceweasel-double-click-close";
    let boxid3 = "iceweasel-double-click-new";
    let boxid4 = "iceweasel-mouse-hover-close";
    let boxid5 = "iceweasel-mouse-hover-new";
    let boxid6 = "iceweasel-right-click-close";
    let boxid7 = "iceweasel-right-click-recover";
    let ontabs = iniSafeGet(ini, "General", "OnTabs");
    if (ontabs == "1") {
      if (!value) {
        makeMasterCheckboxesReactive(checkboxid, () => {return true});
      }
      tabChildboxChk(ini, boxid1, "mouse_time", true);
      tabChildboxChk(ini, boxid2, "double_click_close", true);
      tabChildboxChk(ini, boxid3, "double_click_new", true);
      tabChildboxChk(ini, boxid4, "mouse_hover_close", true);
      tabChildboxChk(ini, boxid5, "mouse_hover_new", true);
      tabChildboxChk(ini, boxid6, "right_click_close", true);
      tabChildboxChk(ini, boxid7, "right_click_recover", true);
    } else if (value) {
      makeMasterCheckboxesReactive(checkboxid, () => {return false});
      tabChildboxChk(ini, boxid1, "mouse_time", false);
      tabChildboxChk(ini, boxid2, "double_click_close", false);
      tabChildboxChk(ini, boxid3, "double_click_new", false);
      tabChildboxChk(ini, boxid4, "mouse_hover_close", false);
      tabChildboxChk(ini, boxid5, "mouse_hover_new", false);
      tabChildboxChk(ini, boxid6, "right_click_close", false);
      tabChildboxChk(ini, boxid7, "right_click_recover", false);
    }
    setEventListener(checkboxid, "click", onTabSyncListeners);
    setEventListener(boxid1, "click", onTabSyncid1);
    setEventListener(boxid2, "click", onTabSyncid2);
    setEventListener(boxid3, "click", onTabSyncid3);
    setEventListener(boxid4, "click", onTabSyncid4);
    setEventListener(boxid5, "click", onTabSyncid5);
    setEventListener(boxid6, "click", onTabSyncid6);
    setEventListener(boxid7, "click", onTabSyncid7);
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

function showIceMessage() {
  const messageBox = document.getElementById('iceweasel-message-box');
  messageBox.style.display = 'flex';
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 3000);
}

function onUpcheckSyncListeners() {
  optionlibportable(0x5220, "iceweasel-libportable-upcheck-checkbox");
}

function onUboSyncListeners() {
  optionlibportable(0x5230, "iceweasel-libportable-ubo-checkbox");
}

function onChromeSyncListeners() {
  let value = document.getElementById("iceweasel-libportable-chrome-checkbox").checked;
  let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  let bin = target.clone();
  target.append("upcheck.exe");
  if (target.exists()) {
    let process = Cc["@mozilla.org/process/util;1"]
                   .createInstance(Ci.nsIProcess);
    let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
    let chromeObserver = {
      observe: function xobserve(aSubject, aTopic) {
        if (aTopic == "process-finished") {
          showIceMessage();
        } else {
          console.log("The process launch failed!");
        }
      },
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
    };
    process.init(target);
    process.startHidden = true;
    process.noShell = true;
    try {
      if (!value) {
        process.run(false, ["-chrome-uncheck", encodeURIComponent(bin.path), encodeURIComponent(prof.path)], 3);
      } else {
        process.runAsync( ["-chrome-install", encodeURIComponent(bin.path), encodeURIComponent(prof.path)], 3, chromeObserver);
      }
    } catch (e) {
      console.log("On Windows negative return value throws an exception");
    }
  }
}

function onBosskeySyncListeners() {
  optionlibportable(0x5221, "iceweasel-libportable-bosskey-checkbox");
}

function onTabSyncListeners() {
  let onid = "iceweasel-libportable-ontabs-checkbox"
  let boxid1 = "iceweasel-hover-activate";
  let boxid2 = "iceweasel-double-click-close";
  let boxid3 = "iceweasel-double-click-new";
  let boxid4 = "iceweasel-mouse-hover-close";
  let boxid5 = "iceweasel-mouse-hover-new";
  let boxid6 = "iceweasel-right-click-close";
  let boxid7 = "iceweasel-right-click-recover";
  let value = document.getElementById(onid).checked;
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
    let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
    target.append("portable.ini");
    let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
    let ini = factory.createINIParser(target);
    if (ini != null) {
      tabChildboxChk(ini, boxid1, "mouse_time", true);
      tabChildboxChk(ini, boxid2, "double_click_close", true);
      tabChildboxChk(ini, boxid3, "double_click_new", true);
      tabChildboxChk(ini, boxid4, "mouse_hover_close", true);
      tabChildboxChk(ini, boxid5, "mouse_hover_new", true);
      tabChildboxChk(ini, boxid6, "right_click_close", true);
      tabChildboxChk(ini, boxid7, "right_click_recover", true);
    }
  }
  optionlibportable(0x5222, onid);
}

function onTabSyncid1() {
  optionlibportable(0x5223, "iceweasel-hover-activate");
}

function onTabSyncid2() {
  optionlibportable(0x5224, "iceweasel-double-click-close");
}

function onTabSyncid3() {
  optionlibportable(0x5225, "iceweasel-double-click-new");
}

function onTabSyncid4() {
  optionlibportable(0x5226, "iceweasel-mouse-hover-close");
}

function onTabSyncid5() {
  optionlibportable(0x5227, "iceweasel-mouse-hover-new");
}

function onTabSyncid6() {
  optionlibportable(0x5228, "iceweasel-right-click-close");
}

function onTabSyncid7() {
  optionlibportable(0x5229, "iceweasel-right-click-recover");
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
