/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

function iniSafeGet(ini, section, key) {
  try {
    return ini.getString(section, key);
  } catch (e) {
    return "0";
  }
}

function iniRead(sec, key) {
  let vaule = null;
  let target = AppConstants.platform === "win" ? Services.dirsvc.get("GreBinD", Ci.nsIFile) : Services.dirsvc.get("ProfD", Ci.nsIFile);
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

function iniWrite(sec, key, value) {
  try {
    let target = Services.dirsvc.get("ProfD", Ci.nsIFile);
    target.append("portable.ini");
    if (target.exists()) {
      let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
      let ini = factory ? factory.createINIParser(target).QueryInterface(Ci.nsIINIParserWriter) : null;
      if (ini != null) {
        ini.setString(sec, key, value);
        ini.writeFile(target);
      }
    }
  } catch (e) {
    // ;
  }
}

function iniValue(sec, key) {
  const v = iniRead(sec, key);
  if (v != null) {
    if (v.length > 1 || parseInt(v) > 0) {
      return true;
    }
  }
  return false;
}

function existOtherPath(names) {
  let dst = Services.dirsvc.get("UChrm", Ci.nsIFile);
  dst.append(AppConstants.platform === "win" ? "uc" : "SubScript");
  dst.append(names);
  return dst.exists()
}

function existScript(names) {
  let target = Services.dirsvc.get("UChrm", Ci.nsIFile);
  target.append(AppConstants.platform === "win" ? "SubScript" : "uc");
  target.append(names);
  return target.exists() ? true : existOtherPath(names);
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

function upChromeChild() {
  const mbox = "iceweasel-libportable-mousegestures-checkbox";
  const ubox = "iceweasel-libportable-ucaddons-checkbox";
  const dbox = "iceweasel-libportable-download-checkbox";
  const mousegestures = document.getElementById(mbox);
  const ucaddons = document.getElementById(ubox);
  const download = document.getElementById(dbox);
  if (mousegestures) {
    mousegestures.checked = existScript("MouseGestures.uc.js");
  }
  if (ucaddons) {
    ucaddons.checked = existScript("AddonsPage.uc.js");
  }
  if (download) {
    download.checked = existScript("DownloadUpcheck.uc.js");
  }
}

function optionLibportable(msg, value) {
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

function optionUpcheck(arg1) {
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
      process.runw(true, [arg1, bin.path, prof.path], 3);
      exitValue = process.exitValue;
    } catch (e) {
      console.log("On Windows negative return value throws an exception");
      exitValue = -1;
    }
    if (exitValue > 0) {
      return true;
    }
  }
  return false;
}

function optionUpcheckAsync(arr) {
  let binary = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  let length = arr.length;
  if (AppConstants.platform === "win") {
    binary.append("upcheck.exe");
  } else {
    binary.append("upcheck");
  }
  if (binary.exists() && length > 1) {
    let args = [];
    let process =
        Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    for (let i = 0; i < length; ++i) {
      args.push(arr[i]);
    }
    process.init(binary);
    process.startHidden = true;
    process.noShell = true;
    return new Promise(resolve => {
      process.runwAsync(args, args.length, () => { resolve(process.exitValue); });
    });
  }
  return 1;
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
            upChromeChild();
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
          process.runwAsync(["-chrome-install", bin.path, prof.path], 3, chromeObserver);
        }
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
      }
    }
  }
}

function onDownloadSyncListeners(eid, arg1, arg2) {
  const element = document.getElementById(eid);
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
          process.runw(false, [arg1, bin.path, prof.path], 3);
        } else {
          process.runwAsync([arg2, bin.path, prof.path], 3, chromeObserver);
        }
      } catch (e) {
        console.log("On Windows negative return value throws an exception");
      }
    }
  }
}

function option_ubo(v) {
  if (AppConstants.platform === "linux") {
    let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
    let f1 = iniValue("update", "faster");
    let arg = ['-ubo-check'];
    arg.push(prof.path);
    if (v) {
      if (f1) {
        arg.push("3");
      } else {
        arg.push("1");
      }
    } else {
      if (f1) {
        arg.push("2");
      } else {
        arg.push("0");
      }
    }
    optionUpcheckAsync(arg);
  }
}

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

Preferences.addSetting({
  id: "iceExtensionUpdateEnabled",
  pref: "extensions.update.enabled",
});
Preferences.addSetting({
  id: "iceExtensionAutoUpdateEnabled",
  pref: "extensions.update.autoUpdateDefault",
});

// iceweasel features
Preferences.addSetting({
  id: "iceweasel-extension-update-checkbox",
  deps: ["iceExtensionUpdateEnabled","iceExtensionAutoUpdateEnabled"],
  get: (_, deps) => deps.iceExtensionUpdateEnabled.value && deps.iceExtensionAutoUpdateEnabled.value,
  set: (value, deps) => {
      deps.iceExtensionUpdateEnabled.value = value;
      deps.iceExtensionAutoUpdateEnabled.value = value;
  },
});

Preferences.addSetting({
  id: "iceAutocopy",
  pref: "clipboard.autocopy",
});
Preferences.addSetting({
  id: "icePaste",
  pref: "middlemouse.paste",
});
Preferences.addSetting({
  id: "iceweasel-autocopy-checkbox",
  deps: ["iceAutocopy","icePaste"],
  get: (_, deps) => deps.iceAutocopy.value && deps.icePaste.value,
  set: (value, deps) => {
      deps.iceAutocopy.value = value;
      deps.icePaste.value = value;
  },
});

Preferences.addSetting({
  id: "iceweasel-ipv6-checkbox",
  pref: "network.dns.disableIPv6",
  get: prefVal => {
    return prefVal !== true;
  },
  set: checked => {
    return checked ? false : true;
  },
});

Preferences.addSetting({
  id: "iceweasel-javascript-checkbox",
  pref: "javascript.enabled",
  get: prefVal => {
    return prefVal !== true;
  },
  set: checked => {
    return checked ? false : true;
  },
});

Preferences.addSetting({
  id: "iceweasel-taskbartabs-checkbox",
  pref: "browser.taskbarTabs.enabled",
  get: prefVal => {
    return prefVal !== true;
  },
  set: checked => {
    return checked ? false : true;
  },
});

Preferences.addSetting({
  id: "iceweasel-searchhand-checkbox",
  pref: "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
  get: prefVal => {
    return prefVal === true;
  },
  set: checked => {
    return checked ? true : false;
  },
});

Preferences.addSetting({
  id: "iceweasel-tabcompactmode-checkbox",
  pref: "browser.compactmode.show",
  get: prefVal => {
    return prefVal === true;
  },
  set: checked => {
    return checked ? true : false;
  },
});

Preferences.addSetting({
  id: "iceweasel-lastclose-checkbox",
  pref: "browser.tabs.closeWindowWithLastTab",
  get: prefVal => {
    return prefVal !== true;
  },
  set: checked => {
    return checked ? false : true;
  },
});

Preferences.addSetting({
  id: "iceweasel-tips-checkbox",
  pref: "officialtips.show",
  get: prefVal => {
    return prefVal === true;
  },
  set: checked => {
    return checked ? true : Services.prefs.clearUserPref('officialtips.show', false);
  },
});

Preferences.addSetting({
  id: "iceweasel-styling-checkbox",
  pref: "toolkit.legacyUserProfileCustomizations.stylesheets",
  get: prefVal => {
    return prefVal === true;
  },
  set: checked => {
    return checked ? true : false;
  },
});

// libportable settings
Preferences.addSetting({
  id: "iceweasel-libportable-upcheck-checkbox",
  get: e => {
    return iniValue("General", "Update");
  },
  onUserChange: () => {
    optionLibportable(0x5220, !parseInt(iniRead("General", "Update")));
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-ghproxy-checkbox",
  get: e => {
    return iniValue("update", "faster");
  },
  onUserChange: () => {
    const v = iniRead("update", "faster");
    if (AppConstants.platform === "win") {
      optionLibportable(0x5231, v && v.length > 1 ? 0 : 1);
    } else {
      iniWrite("update", "faster", v && v.length > 1 ? "" : "https://gh-proxy.org/sourceforge");
      option_ubo(iniValue("General", "EnableUBO"));
    }
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-bosskey-checkbox",
  get: e => {
    return iniValue("General", "Bosskey");
  },
  onUserChange: () => {
    optionLibportable(0x5221, !parseInt(iniRead("General", "Bosskey")));
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-ontabs-checkbox",
  get: e => {
    let v = iniValue("General", "OnTabs");
    if (AppConstants.platform === "linux" && v === false) {
      v = existScript("HoverActivateTab.uc.js") || existScript("RclickCloseTab.uc.js");
      if (v) {
        iniWrite("General", "OnTabs", "1");
      }
    }
    return v;
  },
  onUserChange: () => {
    const v = iniRead("General", "OnTabs");
    if (AppConstants.platform === "win") {
      optionLibportable(0x5222, !parseInt(v));
    } else {
      iniWrite("General", "OnTabs", parseInt(v) > 0 ? "0" : "1");
    }
  },
});

Preferences.addSetting({
  id: "iceweasel-hover-activate",
  get: e => {
    if (AppConstants.platform === "linux") {
      return existScript("HoverActivateTab.uc.js");
    }
    return iniValue("tabs", "mouse_time");
  },
  onUserChange: () => {
    if (AppConstants.platform === "win") {
      optionLibportable(0x5223, !parseInt(iniRead("tabs", "mouse_time")));
    } else {
      onDownloadSyncListeners("iceweasel-hover-activate", "-tabhover-uncheck", "-tabhover-install");
    }
  },
});

Preferences.addSetting({
  id: "iceweasel-double-click-close",
  get: e => {
    return iniValue("tabs", "double_click_close");
  },
  onUserChange: () => {
    optionLibportable(0x5224, !parseInt(iniRead("tabs", "double_click_close")));
  },
});

Preferences.addSetting({
  id: "iceweasel-double-click-new",
  get: e => {
    return iniValue("tabs", "double_click_new");
  },
  onUserChange: () => {
    optionLibportable(0x5225, !parseInt(iniRead("tabs", "double_click_new")));
  },
});

Preferences.addSetting({
  id: "iceweasel-mouse-hover-close",
  get: e => {
    return iniValue("tabs", "mouse_hover_close");
  },
  onUserChange: () => {
    optionLibportable(0x5226, !parseInt(iniRead("tabs", "mouse_hover_close")));
  },
});

Preferences.addSetting({
  id: "iceweasel-mouse-hover-new",
  get: e => {
    return iniValue("tabs", "mouse_hover_new");
  },
  onUserChange: () => {
    optionLibportable(0x5227, !parseInt(iniRead("tabs", "mouse_hover_new")));
  },
});

Preferences.addSetting({
  id: "iceweasel-right-click-close",
  get: e => {
    if (AppConstants.platform === "linux") {
      return existScript("RclickCloseTab.uc.js");
    }
    return iniValue("tabs", "right_click_close");
  },
  onUserChange: () => {
    if (AppConstants.platform === "win") {
      optionLibportable(0x5228, !parseInt(iniRead("tabs", "right_click_close")));
    } else {
      onDownloadSyncListeners("iceweasel-right-click-close", "-tabrclick-uncheck", "-tabrclick-install");
    }
  },
});

Preferences.addSetting({
  id: "iceweasel-right-click-recover",
  get: e => {
    return iniValue("tabs", "right_click_recover");
  },
  onUserChange: () => {
    optionLibportable(0x5229, !parseInt(iniRead("tabs", "right_click_recover")));
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-chrome-checkbox",
  get: e => {
    return optionUpcheck("-chrome-check");
  },
  onUserChange: () => {
    onChromeSyncListeners();
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-mousegestures-checkbox",
  get: e => {
    return existScript("MouseGestures.uc.js");
  },
  onUserChange: () => {
    onDownloadSyncListeners("iceweasel-libportable-mousegestures-checkbox", "-mousegestures-uncheck", "-mousegestures-install");
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-ucaddons-checkbox",
  get: e => {
    return existScript("AddonsPage.uc.js");
  },
  onUserChange: () => {
    onDownloadSyncListeners("iceweasel-libportable-ucaddons-checkbox", "-ucaddons-uncheck", "-ucaddons-install");
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-download-checkbox",
  get: e => {
    return existScript("DownloadUpcheck.uc.js");
  },
  onUserChange: () => {
    onDownloadSyncListeners("iceweasel-libportable-download-checkbox", "-integration-uncheck", "-integration-install");
  },
});

Preferences.addSetting({
  id: "iceweasel-libportable-ubo-checkbox",
  get: e => {
    let v = iniValue("General", "EnableUBO");
    option_ubo(v);
    return v;
  },
  onUserChange: () => {
    const v = iniRead("General", "EnableUBO");
    if (AppConstants.platform === "win") {
      optionLibportable(0x5230, !parseInt(v));
    } else {
      iniWrite("General", "EnableUBO", parseInt(v) > 0 ? "0" : "1");
      option_ubo(parseInt(v) > 0 ? false : true);
    }
  },
});

Preferences.addSetting({
  id: "iceweasel-footer-chooser",
});

Preferences.addSetting({
  id: "iceweasel-config-link",
  onUserClick: e => {
    e.preventDefault();
    window.open("https://github.com/adonais", "_blank");
  },
});

Preferences.addSetting({
  id: "iceweasel-open-profile",
  onUserClick: e => {
    e.preventDefault();
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
  },
});

Preferences.addSetting({
  id: "iceweasel-open-keybord",
});

Preferences.addSetting({
  id: "iceweasel-restart-profile",
  onUserClick: e => {
    e.preventDefault();
    Services.appinfo.invalidateCachesOnRestart();
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
  },
});

SettingGroupManager.registerGroups({
  icefeatures: {
    l10nId: "iceweasel-header2",
    headingLevel: 2,
    items: [
      { id: "iceweasel-extension-update-checkbox", l10nId: "iceweasel-extension-update-checkbox2" },
      { id: "iceweasel-autocopy-checkbox", l10nId: "iceweasel-autocopy-checkbox2" },
      { id: "iceweasel-ipv6-checkbox", l10nId: "iceweasel-ipv6-checkbox2" },
      { id: "iceweasel-javascript-checkbox", l10nId: "iceweasel-javascript-checkbox2" },
      { id: "iceweasel-taskbartabs-checkbox", l10nId: "iceweasel-taskbartabs-checkbox2" },
      { id: "iceweasel-searchhand-checkbox", l10nId: "iceweasel-searchhand-checkbox2" },
      { id: "iceweasel-tabcompactmode-checkbox", l10nId: "iceweasel-tabcompactmode-checkbox2" },
      { id: "iceweasel-lastclose-checkbox", l10nId: "iceweasel-lastclose-checkbox2" },
      { id: "iceweasel-tips-checkbox", l10nId: "iceweasel-tips-checkbox2" },
      { id: "iceweasel-styling-checkbox", l10nId: "iceweasel-styling-checkbox2" },
    ],
  },
  icelibportable: {
    l10nId: "iceweasel-libportable-heading2",
    headingLevel: 2,
    items: [
      { id: "iceweasel-libportable-upcheck-checkbox", l10nId: "iceweasel-libportable-upcheck-checkbox2" },
      { id: "iceweasel-libportable-ghproxy-checkbox", l10nId: "iceweasel-libportable-ghproxy-checkbox2" },
      { id: "iceweasel-libportable-bosskey-checkbox", l10nId: "iceweasel-libportable-bosskey-checkbox2" },
      {
        id: "iceweasel-libportable-ontabs-checkbox",
        l10nId: "iceweasel-libportable-ontabs-checkbox2",
        subcategory: "libportable-ontabs",
        items: [
          {
            id: "iceweasel-hover-activate",
            l10nId: "iceweasel-hover-activate2",
          },
          {
            id: "iceweasel-double-click-close",
            l10nId: "iceweasel-double-click-close2",
          },
          {
            id: "iceweasel-double-click-new",
            l10nId: "iceweasel-double-click-new2",
          },
          {
            id: "iceweasel-mouse-hover-close",
            l10nId: "iceweasel-mouse-hover-close2",
          },
          {
            id: "iceweasel-mouse-hover-new",
            l10nId: "iceweasel-mouse-hover-new2",
          },
          {
            id: "iceweasel-right-click-close",
            l10nId: "iceweasel-right-click-close2",
          },
          {
            id: "iceweasel-right-click-recover",
            l10nId: "iceweasel-right-click-recover2",
          },
        ],
      },
      {
        id: "iceweasel-libportable-chrome-checkbox",
        l10nId: "iceweasel-libportable-chrome-checkbox2",
        subcategory: "libportable-chrome",
        items: [
          {
            id: "iceweasel-libportable-mousegestures-checkbox",
            l10nId: "iceweasel-libportable-mousegestures-checkbox2",
          },
          {
            id: "iceweasel-libportable-ucaddons-checkbox",
            l10nId: "iceweasel-libportable-ucaddons-checkbox2",
          },
          {
            id: "iceweasel-libportable-download-checkbox",
            l10nId: "iceweasel-libportable-download-checkbox2",
          },
        ],
      },
      { id: "iceweasel-libportable-ubo-checkbox", l10nId: "iceweasel-libportable-ubo-checkbox2" },
    ],
  },
  icelibportable_linux: {
    l10nId: "iceweasel-libportable-heading2",
    headingLevel: 2,
    items: [
      { id: "iceweasel-libportable-ghproxy-checkbox", l10nId: "iceweasel-libportable-ghproxy-checkbox2" },
      {
        id: "iceweasel-libportable-chrome-checkbox",
        l10nId: "iceweasel-libportable-chrome-checkbox2",
        subcategory: "libportable-chrome",
        items: [
          {
            id: "iceweasel-libportable-mousegestures-checkbox",
            l10nId: "iceweasel-libportable-mousegestures-checkbox2",
          },
          {
            id: "iceweasel-libportable-ontabs-checkbox",
            l10nId: "iceweasel-libportable-ontabs-checkbox3",
            subcategory: "libportable-ontabs",
            items: [
              {
                id: "iceweasel-hover-activate",
                l10nId: "iceweasel-hover-activate2",
              },
              {
                id: "iceweasel-right-click-close",
                l10nId: "iceweasel-right-click-close2",
              },
            ],
          },
          {
            id: "iceweasel-libportable-ucaddons-checkbox",
            l10nId: "iceweasel-libportable-ucaddons-checkbox2",
          },
          {
            id: "iceweasel-libportable-download-checkbox",
            l10nId: "iceweasel-libportable-download-checkbox2",
          },
        ],
      },
      { id: "iceweasel-libportable-ubo-checkbox", l10nId: "iceweasel-libportable-ubo-checkbox2" },
    ],
  },
  icefooter: {
    l10nId: "iceweasel-footer2",
    headingLevel: 2,
    items: [
      {
        id: "iceweasel-footer-chooser",
        control: "moz-box-group",
        items: [
          {
            id: "iceweasel-config-link",
            l10nId: "iceweasel-config-link2",
            control: "moz-box-link",
          },
          {
            id: "iceweasel-open-profile",
            l10nId: "iceweasel-open-profile2",
            control: "moz-box-link",
          },
          {
            id: "iceweasel-open-keybord",
            l10nId: "iceweasel-open-keybord2",
            control: "moz-box-link",
            controlAttrs: {
              href: "about:keyboard",
            },
          },
          {
            id: "iceweasel-restart-profile",
            l10nId: "iceweasel-restart-profile2",
            control: "moz-box-link",
          },
        ],
      },
    ],
  },
});
