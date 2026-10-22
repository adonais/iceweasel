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
 * and is left out of the shared-key check, as is an item with the
 * `auto-accesskey` attribute (see auto-accesskey.mjs). A disabled menuitem
 * with a role attribute (a note, a heading) only displays information and is
 * not one. A menuitem without a label, such as an icon button in a menugroup,
 * can't show an accesskey or be reached by its first letter, so it may lack an
 * accesskey; one it has is still compared with the others.
 *
 * A menu that macOS shows natively ignores accesskeys, so it is skipped along
 * with its submenus.
 *
 * While the document has translations pending, the check waits for them, so
 * that it compares the labels and accesskeys the user will see.
 *
 * @param {Element} popup
 *   An open menupopup or panel-list, named in the message.
 * @returns {Promise<void>}
 *   Resolves once the check has run.
 */
export async function checkAccessKeys(popup) {
  if (
    !ENABLED ||
    popup.hasAttribute("accesskey-conflicts-bug") ||
    (popup.localName == "menupopup" && isShownNatively(popup))
  ) {
    return;
  }
  let doc = popup.ownerDocument;
  if (typeof Cu == "undefined") {
    // L10nMutationsFinished is dispatched only to chrome.
    while (doc.hasPendingL10nMutations) {
      await new Promise(resolve =>
        doc.defaultView.requestAnimationFrame(resolve)
      );
    }
  } else if (doc.hasPendingL10nMutations) {
    await new Promise(resolve =>
      doc.addEventListener("L10nMutationsFinished", resolve, { once: true })
    );
  }

  let items =
    popup.localName == "panel-list"
      ? panelListItems(popup)
      : menupopupItems(popup);
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

  let withoutKey = items.filter(item => !item.accesskey && item.hasText);
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

/**
 * Whether macOS shows a menupopup natively. Only the outermost menupopup of a
 * native menu reports isNativeMenu; its submenus don't.
 *
 * @param {Element} menupopup
 * @returns {boolean}
 */
function isShownNatively(menupopup) {
  let outermost = menupopup;
  let parentPopup;
  while ((parentPopup = outermost.parentElement?.closest("menupopup"))) {
    outermost = parentPopup;
  }
  return outermost.isNativeMenu;
}

function menupopupItems(popup) {
  return Array.from(
    popup.querySelectorAll(
      ":is(:scope, :scope > menugroup) > :is(menuitem, menu):not([hidden], [role][disabled])"
    ),
    item => ({
      accesskey: item.getAttribute("accesskey"),
      intendedDuplicate: item.matches(
        "[intended-duplicate-accesskey], [auto-accesskey]"
      ),
      hasText: item.matches("[label], [value]"),
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
      intendedDuplicate: item.matches(
        "[intended-duplicate-accesskey], [auto-accesskey]"
      ),
      hasText: true,
      label: (item.label?.textContent ?? item.textContent).trim(),
    })
  );
}

function quoteLabels(labels) {
  return labels.map(label => `"${label}"`).join(", ");
}
