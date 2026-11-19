/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

// All the attributes for a <key> element that might specify the key to press.
// We include data-l10n-id because keys are often specified using Fluent. Note
// that we deliberately remove data-l10n-id when a key is customized because
// otherwise, Fluent would overwrite the customization.
const ATTRS = ["data-l10n-id", "key", "keycode", "modifiers"];

// On macOS, the user can assign a shortcut to a menu item in System Settings.
// The widget code then writes that shortcut over the key element's attributes,
// marks the element with this attribute, and keeps the element's own
// attributes in data-builtin-* copies. A customization made here goes into
// those copies, so that it applies again once the system assignment is gone.
const SYSTEM_SHORTCUT_ATTR = "data-has-system-shortcut";

function isSystemAssigned(keyEl) {
  return keyEl.hasAttribute(SYSTEM_SHORTCUT_ATTR);
}

// The name of the attribute to read or write for `attr`, on the layer this
// module owns.
function attrName(keyEl, attr) {
  if (!isSystemAssigned(keyEl)) {
    return attr;
  }
  return attr == "data-l10n-id"
    ? "data-builtin-l10n-id"
    : `data-builtin-${attr}`;
}

function getAttr(keyEl, attr) {
  return keyEl.getAttribute(attrName(keyEl, attr));
}

function setAttr(keyEl, attr, val) {
  keyEl.setAttribute(attrName(keyEl, attr), val);
}

function removeAttr(keyEl, attr) {
  keyEl.removeAttribute(attrName(keyEl, attr));
}

// The original keys for any shortcuts that have been customized. This is used
// to identify whether a shortcut has been customized, as well as to reset a
// shortcut.
const original = {};
// All the browser windows we are handling. Maps from a window to our
// MutationObserver for that window.
const windows = new Map();

// The configuration is an Object with the form:
// { "someKeyId": {
//   modifiers: "mod1,mod2",
//   key: "someKey",
//   keycode: "someKeycode"
// } }
// Only one of `key` or `keycode` should be specified for each entry. An entry
// may be empty to indicate that the default key has been cleared; i.e.
// { "someKeyId": {} }
const config = new JSONFile({
  path: PathUtils.join(PathUtils.profileDir, "customKeys.json"),
});

function applyToKeyEl(window, keyId) {
  const keyEl = window.document.getElementById(keyId);
  if (!keyEl || keyEl.tagName != "key") {
    return;
  }
  if (!original[keyId]) {
    // Save the original key in case the user wants to reset.
    const orig = (original[keyId] = {});
    for (const attr of ATTRS) {
      const val = getAttr(keyEl, attr);
      if (val) {
        orig[attr] = val;
      }
    }
  }
  for (const attr of ATTRS) {
    removeAttr(keyEl, attr);
  }
  const data = config.data[keyId];
  for (const attr of ["modifiers", "key", "keycode"]) {
    const val = data[attr];
    if (val) {
      setAttr(keyEl, attr, val);
    }
  }
}

function resetKeyEl(window, keyId) {
  const keyEl = window.document.getElementById(keyId);
  if (!keyEl) {
    return;
  }
  const orig = original[keyId];
  for (const attr of ATTRS) {
    removeAttr(keyEl, attr);
    const val = orig[attr];
    if (val !== undefined) {
      setAttr(keyEl, attr, val);
    }
  }
}

async function applyToNewWindow(window) {
  await config.load();
  // The window can close before the configuration has loaded.
  if (window.closed) {
    return;
  }
  for (const keyId in config.data) {
    applyToKeyEl(window, keyId);
  }
  const observer = observe(window);
  for (const keyset of window.document.getElementsByTagName("keyset")) {
    observer.observe(keyset, { childList: true });
  }
}

function observe(window) {
  let observer = windows.get(window);
  if (!observer) {
    // A keyset can be added dynamically. For example, DevTools does this during
    // delayed startup. A key element can also be added to a keyset, so each
    // keyset is observed as well.
    const applyToAddedKey = key => {
      if (key.tagName == "key" && config.data[key.id]) {
        applyToKeyEl(window, key.id);
      }
    };
    observer = new window.MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName == "keyset") {
            observer.observe(node, { childList: true });
            for (const key of node.children) {
              applyToAddedKey(key);
            }
          } else if (mutation.target.tagName == "keyset") {
            applyToAddedKey(node);
          }
        }
      }
    });
    windows.set(window, observer);
  }
  // XUL documents without an HTML body, such as the macOS hidden window, only
  // have the document to observe.
  for (const node of [window.document, window.document.body]) {
    if (node) {
      observer.observe(node, { childList: true });
    }
  }
  return observer;
}

export const CustomKeys = {
  /**
   * Customize a keyboard shortcut.
   *
   * @param {string} id The id of the key element.
   * @param {object} data
   * @param {string} data.modifiers The modifiers for the key; e.g. "accel,shift".
   * @param {string} data.key The key itself; e.g. "Y". Mutually exclusive with data.keycode.
   * @param {string} data.keycode The key code; e.g. VK_F1. Mutually exclusive with data.key.
   */
  changeKey(id, { modifiers, key, keycode }) {
    const existing = config.data[id];
    if (
      existing &&
      modifiers == existing.modifiers &&
      key == existing.key &&
      keycode == existing.keycode
    ) {
      return; // No change.
    }
    const defaultKey = this.getDefaultKey(id);
    if (
      defaultKey &&
      modifiers == defaultKey.modifiers &&
      key == defaultKey.key &&
      keycode == defaultKey.keycode
    ) {
      this.resetKey(id);
      return;
    }
    const data = (config.data[id] = {});
    if (modifiers) {
      data.modifiers = modifiers;
    }
    if (key) {
      data.key = key;
    }
    if (keycode) {
      data.keycode = keycode;
    }
    for (const window of windows.keys()) {
      applyToKeyEl(window, id);
    }
    config.saveSoon();
  },

  /**
   * Reset a keyboard shortcut to its defalt.
   *
   * @param {string} id The id of the key element.
   */
  resetKey(id) {
    if (!config.data[id]) {
      return; // No change.
    }
    delete config.data[id];
    for (const window of windows.keys()) {
      resetKeyEl(window, id);
    }
    delete original[id];
    config.saveSoon();
  },

  /**
   * Clear a keyboard shortcut; i.e. so it does nothing.
   *
   * @param {string} id The id of the key element.
   */
  clearKey(id) {
    this.changeKey(id, {});
  },

  /**
   * Clear all keyboard shortcuts; i.e. so they do nothing. This is useful for
   * kiosk mode. Unlike resetAll, this affects every shortcut, including those
   * that haven't been customized.
   */
  clearAll() {
    const ids = new Set();
    for (const window of windows.keys()) {
      for (const keyEl of window.document.querySelectorAll(
        "key[id]:not([internal=true])"
      )) {
        // Skip keys that are already unassigned; clearing them would
        // incorrectly mark them as customized.
        if (
          config.data[keyEl.id] ||
          getAttr(keyEl, "key") ||
          getAttr(keyEl, "keycode")
        ) {
          ids.add(keyEl.id);
        }
      }
    }
    for (const id of ids) {
      this.clearKey(id);
    }
  },

  /**
   * Reset all keyboard shortcuts to their defaults.
   */
  resetAll() {
    config.data = {};
    for (const window of windows.keys()) {
      for (const id in original) {
        resetKeyEl(window, id);
      }
    }
    for (const id of Object.keys(original)) {
      delete original[id];
    }
    config.saveSoon();
  },

  initWindow(window) {
    applyToNewWindow(window);
  },

  /**
   * Whether the operating system assigned the shortcut of this key element,
   * as the user can do for a menu item in System Settings on macOS. Such a
   * shortcut cannot be changed from here; a customization applies again once
   * the assignment is removed.
   *
   * @param {Element} keyEl The key element.
   */
  isSystemAssigned(keyEl) {
    return isSystemAssigned(keyEl);
  },

  uninitWindow(window) {
    // Nothing to do if the window closed before initWindow finished.
    windows.get(window)?.disconnect();
    windows.delete(window);
  },

  /**
   * Return the default key for this shortcut in the form:
   * { modifiers: "mod1,mod2", key: "someKey", keycode: "someKeycode" }
   * If this shortcut isn't customized, return null.
   *
   * @param {string} keyId The id of the key element.
   */
  getDefaultKey(keyId) {
    const origKey = original[keyId];
    if (!origKey) {
      return null;
    }
    const data = {};
    if (origKey.modifiers) {
      data.modifiers = origKey.modifiers;
    }
    if (origKey.key) {
      data.key = origKey.key;
    }
    if (origKey.keycode) {
      data.keycode = origKey.keycode;
    }
    return data;
  },
};

Object.freeze(CustomKeys);
