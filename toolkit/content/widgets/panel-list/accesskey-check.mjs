/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Named so the browser-chrome test harness can pick it out of the console.
 */
export class AccessKeyConflictError extends Error {
  name = "AccessKeyConflictError";
}

/**
 * Whether popups check their accesskeys when they open, which they do in
 * automation so that a test fails on a conflict. A page without chrome
 * privileges, such as about:newtab, sees automation through
 * navigator.webdriver.
 */
const ENABLED =
  typeof Cu == "undefined" ? navigator.webdriver : Cu.isInAutomation;

/**
 * Reports a menu whose items can't all be reached by typing a letter: two
 * items sharing an accesskey, or items with an accesskey beside items without
 * one. An item without an accesskey is reached by the first letter of its
 * label, unless another item claims that letter as its accesskey. Which
 * letters collide depends on the locale, so the check doesn't compare them;
 * a menu has to give every item an accesskey or none.
 *
 * A popup with known conflicts names the bug that tracks fixing them in an
 * `accesskey-conflicts-bug` attribute and is skipped until the attribute goes.
 * An item that shares its accesskey on purpose, so that the key cycles
 * through the items, must have the `intended-duplicate-accesskey` attribute
 * and is left out of the shared-key check. A disabled menuitem with a role
 * attribute (a note, a heading) only displays information and is not one.
 *
 * @param {Element} popup
 *   An open menupopup or panel-list, named in the message.
 */
export function checkAccessKeys(popup) {
  if (!ENABLED || popup.hasAttribute("accesskey-conflicts-bug")) {
    return;
  }
  let items =
    popup.localName == "panel-list"
      ? panelListItems(popup)
      : menupopupItems(popup);
  // An item without a label has no translation yet.
  // TODO(bug 2074127): This does mean we may be missing a conflict here.
  items = items.filter(item => item.label);
  let withKey = items.filter(item => item.accesskey);
  if (!withKey.length) {
    return;
  }

  let problems = [];
  let remedies = [];
  let byKey = new Map();
  for (let item of withKey) {
    if (!item.intendedDuplicate) {
      byKey.getOrInsert(item.accesskey.toLowerCase(), []).push(item.label);
    }
  }
  for (let [key, labels] of byKey) {
    if (labels.length > 1) {
      problems.push(`accesskey "${key}" is shared by ${quoteLabels(labels)}`);
    }
  }
  if (problems.length) {
    remedies.push(
      "Fix a shared accesskey, in order of preference: 1) give one of the " +
        "items a different accesskey, 2) move items into a submenu, 3) drop " +
        "the accesskeys of every item in this menu, 4) set " +
        "intended-duplicate-accesskey on one of the items."
    );
  }

  let withoutKey = items.filter(item => !item.accesskey);
  if (withoutKey.length) {
    problems.push(
      `${quoteLabels(withoutKey.map(item => item.label))} ${
        withoutKey.length == 1 ? "has" : "have"
      } no accesskey while ${quoteLabels(withKey.map(item => item.label))} ${
        withKey.length == 1 ? "does" : "do"
      }`
    );
    remedies.push(
      "Fix a missing accesskey, in order of preference: 1) give every item " +
        "an accesskey, 2) move the items that can't have one into a " +
        "submenu, 3) drop the accesskeys of every item in this menu."
    );
  }

  if (!problems.length) {
    return;
  }

  let name = popup.id ? `${popup.localName}#${popup.id}` : popup.localName;
  let error = new AccessKeyConflictError(
    `${name}: ${problems.join("; ")}. ${remedies.join(" ")}`
  );
  if (typeof Cu == "undefined") {
    // Thrown from a microtask so the popup finishes opening first.
    queueMicrotask(() => {
      throw error;
    });
    return;
  }
  let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
    Ci.nsIScriptError
  );
  scriptError.init(
    error.toString(),
    popup.ownerDocument.documentURI,
    0,
    0,
    Ci.nsIScriptError.errorFlag,
    "chrome javascript"
  );
  Services.console.logMessage(scriptError);
}

function menupopupItems(popup) {
  // TODO(bug 2074182): WebExtension items are skipped as we don't control them.
  // Note that this will most likely lead to duplicate keys or extension items
  // that are harder to reach. Duplicate keys fail gracefully (the key cycles
  // between items that share it), whereas missing access keys in a mixed menu
  // are a real problem. The only consistent ways to handle this correctly would
  // be to 1) drop access keys from all menu items in those menus, or 2) move
  // extension items to a sub menu so they don't mix with ours. Neither seems
  // ideal.
  return Array.from(
    popup.querySelectorAll(
      ":is(:scope, :scope > menugroup) > :is(menuitem, menu):not([hidden], [role][disabled], .webextension-menuitem)"
    ),
    item => ({
      accesskey: item.getAttribute("accesskey"),
      intendedDuplicate: item.hasAttribute("intended-duplicate-accesskey"),
      label:
        item.getAttribute("label") ||
        item.getAttribute("aria-label") ||
        item.getAttribute("value"),
    })
  );
}

function panelListItems(popup) {
  return Array.from(
    popup.querySelectorAll("panel-item:not([hidden])"),
    item => ({
      accesskey: item.label?.accessKey,
      intendedDuplicate: item.hasAttribute("intended-duplicate-accesskey"),
      label: (item.label?.textContent ?? item.textContent).trim(),
    })
  );
}

function quoteLabels(labels) {
  return labels.map(label => `"${label}"`).join(", ");
}
