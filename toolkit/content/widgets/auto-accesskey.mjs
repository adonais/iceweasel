/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A letter or decimal digit that a single key press can type. Modifier
 * letters, superscript and other non-decimal digits, characters of scripts
 * typed through an IME, and the fullwidth forms of Latin letters and digits
 * don't qualify. The `u` flag matches a character outside the BMP as a whole
 * code point rather than half of a surrogate pair.
 */
const TYPEABLE_CHARACTER =
  /(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Bopomofo}\uFF00-\uFFEF])[\p{Lu}\p{Ll}\p{Lt}\p{Lo}\p{Nd}]/u;

/**
 * Gives each item of a popup that has the `auto-accesskey` attribute the first
 * typeable letter or digit of its label as its accesskey. This is for items
 * with labels that don't come from our strings, such as an extension's menu
 * items. A menu reaches an item without an accesskey by the start of its label
 * (see XULMenuParentElement::FindMenuWithShortcut), which fails when another
 * item claims that letter as its accesskey, or when the label starts with
 * punctuation, an emoji or a character typed through an IME, such as Chinese,
 * Japanese or Korean. Such an item may share its accesskey with other items,
 * and the key then cycles through them. An item with a non-empty label that
 * has no typeable letter or digit gets the lowest digit from 1 to 9 that no
 * other item in the popup uses.
 *
 * When the popup's other items have no accesskeys, the items get none either,
 * so that they don't take the first letter of another item's label.
 *
 * A menupopup does this on popupshowing and a panel-list when it opens, after
 * the popup's own listeners have added and labeled the items, and again once
 * pending translations have arrived. Code that changes the items of an open
 * popup needs to call this again explicitly.
 *
 * @param {Element} popup
 *   A menupopup or panel-list.
 */
export function assignAutoAccessKeys(popup) {
  assign(popup);
  let doc = popup.ownerDocument;
  if (!doc.hasPendingL10nMutations) {
    return;
  }
  if (typeof Cu == "undefined") {
    // L10nMutationsFinished is dispatched only to chrome.
    let poll = () => {
      if (doc.hasPendingL10nMutations) {
        doc.defaultView.requestAnimationFrame(poll);
      } else {
        assign(popup);
      }
    };
    doc.defaultView.requestAnimationFrame(poll);
  } else {
    doc.addEventListener("L10nMutationsFinished", () => assign(popup), {
      once: true,
    });
  }
}

function assign(popup) {
  let isPanelList = popup.localName == "panel-list";
  let items = [
    ...popup.querySelectorAll(
      isPanelList
        ? "panel-item"
        : ":is(:scope, :scope > menugroup) > :is(menuitem, menu)"
    ),
  ];
  let otherItems = items.filter(
    item => !item.matches("[auto-accesskey], [hidden], [role][disabled]")
  );
  let othersHaveNoKeys =
    otherItems.length &&
    !otherItems.some(item =>
      isPanelList ? item.label?.accessKey : item.getAttribute("accesskey")
    );
  let usedKeys = new Set();
  let itemsWithoutKey = [];
  for (let item of items) {
    if (!item.hasAttribute("auto-accesskey")) {
      usedKeys.add(
        isPanelList ? item.label?.accessKey : item.getAttribute("accesskey")
      );
      continue;
    }
    let label = isPanelList ? item.textContent : item.getAttribute("label");
    let key = othersHaveNoKeys
      ? ""
      : (label?.match(TYPEABLE_CHARACTER)?.[0] ?? "");
    if (key) {
      item.setAttribute("accesskey", key);
      usedKeys.add(key);
    } else {
      // An empty accesskey keeps a panel-list from matching the label's first
      // letter.
      item.removeAttribute("accesskey");
      if (!othersHaveNoKeys && label?.trim()) {
        itemsWithoutKey.push(item);
      }
    }
  }
  let digit = 1;
  for (let item of itemsWithoutKey) {
    while (usedKeys.has(String(digit))) {
      digit++;
    }
    if (digit <= 9) {
      item.setAttribute("accesskey", String(digit));
    }
    digit++;
  }
}
