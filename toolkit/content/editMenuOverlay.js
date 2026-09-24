/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// update menu items that rely on focus or on the current selection
function goUpdateGlobalEditMenuItems(force) {
  // Don't bother updating the edit commands if they aren't visible in any way
  // (i.e. the Edit menu isn't open, nor is the context menu open, nor have the
  // cut, copy, and paste buttons been added to the toolbars) for performance.
  // This only works in applications/on platforms that set the gEditUIVisible
  // flag, so we check to see if that flag is defined before using it.
  if (!force && typeof gEditUIVisible != "undefined" && !gEditUIVisible) {
    return;
  }

  goUpdateUndoEditMenuItems();
  goUpdateCommand("cmd_cut");
  goUpdateCommand("cmd_copy");
  goUpdatePasteMenuItems();
  goUpdateCommand("cmd_selectAll");
  goUpdateCommand("cmd_delete");
  goUpdateCommand("cmd_switchTextDirection");
}

// update menu items that relate to undo/redo
function goUpdateUndoEditMenuItems() {
  goUpdateCommand("cmd_undo");
  goUpdateCommand("cmd_redo");
}

// update menu items that depend on clipboard contents
function goUpdatePasteMenuItems() {
  goUpdateCommand("cmd_paste");
  goUpdateCommand("cmd_pasteNoFormatting");
}

// Inject the commandset here instead of relying on preprocessor to share this across documents.
window.addEventListener(
  "DOMContentLoaded",
  () => {
    let container =
      document.querySelector("commandset") || document.documentElement;
    let fragment = MozXULElement.parseXULToFragment(`
      <commandset id="editMenuCommands">
        <commandset id="editMenuCommandSetAll" commandupdater="true" events="focus,select" />
        <commandset id="editMenuCommandSetUndo" commandupdater="true" events="undo" />
        <commandset id="editMenuCommandSetPaste" commandupdater="true" events="clipboard" />
        <command id="cmd_undo" internal="true"/>
        <command id="cmd_redo" internal="true" />
        <command id="cmd_cut" internal="true" />
        <command id="cmd_copy" internal="true" />
        <command id="cmd_paste" internal="true" />
        <command id="cmd_pasteNoFormatting" internal="true" />
        <command id="cmd_delete" />
        <command id="cmd_selectAll" internal="true" />
        <command id="cmd_switchTextDirection" />
      </commandset>
    `);

    let editMenuCommandSetAll = fragment.querySelector(
      "#editMenuCommandSetAll"
    );
    editMenuCommandSetAll.addEventListener("commandupdate", function () {
      goUpdateGlobalEditMenuItems();
    });

    let editMenuCommandSetUndo = fragment.querySelector(
      "#editMenuCommandSetUndo"
    );
    editMenuCommandSetUndo.addEventListener("commandupdate", function () {
      goUpdateUndoEditMenuItems();
    });

    let editMenuCommandSetPaste = fragment.querySelector(
      "#editMenuCommandSetPaste"
    );
    editMenuCommandSetPaste.addEventListener("commandupdate", function () {
      goUpdatePasteMenuItems();
    });

    fragment.firstElementChild.addEventListener("command", event => {
      let commandID = event.target.id;
      goDoCommand(commandID);
    });

    container.appendChild(fragment);
  },
  { once: true }
);

/**
 * The context menu for HTML inputs and textareas in chrome documents, holding
 * the usual undo / cut / copy / paste / delete / select all items. It's created
 * on first use and shared by every input in the document, so consumers
 * contribute their own items to it with addItems().
 */
var EditContextMenu = {
  _itemSets: [],

  /**
   * The menu, built on first access.
   *
   * @type {Element}
   */
  get popup() {
    return this._ensurePopup();
  },

  /**
   * Adds items to the menu.
   *
   * @param {object} itemSet
   * @param {(input: Element) => boolean} itemSet.matches
   *   Whether the items apply to the input the menu is being opened on. They
   *   are hidden when it returns false.
   * @param {() => DocumentFragment} itemSet.createItems
   *   Creates the items. Called once per menu, which may be built more than
   *   once in the lifetime of a document.
   * @param {(input: Element, items: Element[], event: MouseEvent) => void} [itemSet.onShowing]
   *   Called before the menu opens on a matching input, to update the items'
   *   state. `items` is the set's live membership: amend it to claim items
   *   created outside createItems(), so they're hidden along with the rest when
   *   the menu opens on another input. `event` is the contextmenu event, which
   *   carries the position a spellchecker resolves the clicked word from.
   * @param {string} [itemSet.after]
   *   Id of the item to insert the items after. They go last by default.
   * @param {string} [itemSet.before]
   *   Id of the item to insert the items before, for a set that belongs above
   *   the standard items. Ignored when `after` is given.
   * @returns {object}
   *   The set, to pass to removeItems().
   */
  addItems({ matches, createItems, onShowing, after, before }) {
    let itemSet = { matches, createItems, onShowing, after, before, items: [] };
    this._itemSets.push(itemSet);

    let popup = document.getElementById("textbox-contextmenu");
    if (popup) {
      this._insertItems(popup, itemSet);
    }
    return itemSet;
  },

  /**
   * Removes items from the menu.
   *
   * @param {object} itemSet
   *   The set addItems() returned.
   */
  removeItems(itemSet) {
    this._itemSets = this._itemSets.filter(set => set != itemSet);
    for (let item of itemSet.items) {
      item.remove();
    }
    itemSet.items = [];
  },

  /**
   * Opens the menu for an input.
   *
   * @param {Element} input
   *   The input or textarea to open the menu for.
   * @param {MouseEvent} event
   *   The contextmenu event that asked for the menu.
   */
  open(input, event) {
    let popup = this._ensurePopup();

    // Commands are enabled for whatever has focus, so the items would otherwise
    // reflect a different element than the one the menu was opened on.
    if (document.commandDispatcher.focusedElement != input) {
      input.focus();
    }

    goUpdateGlobalEditMenuItems(true);
    for (let itemSet of this._itemSets) {
      let matches = itemSet.matches(input);
      for (let item of itemSet.items) {
        item.hidden = !matches;
      }
      if (matches) {
        itemSet.onShowing?.(input, itemSet.items, event);
      }
    }

    popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
  },

  _ensurePopup() {
    let popup = document.getElementById("textbox-contextmenu");
    if (popup) {
      return popup;
    }

    MozXULElement.insertFTLIfNeeded("toolkit/global/textActions.ftl");
    // showservicesmenu is read by macOS cocoa code to enable the "services"
    // menu here.
    document.documentElement.appendChild(
      MozXULElement.parseXULToFragment(`
      <menupopup id="textbox-contextmenu" class="textbox-contextmenu"
                 showservicesmenu="true">
        <menuitem id="edit-contextmenu-undo" data-l10n-id="text-action-undo" command="cmd_undo"></menuitem>
        <menuitem id="edit-contextmenu-redo" data-l10n-id="text-action-redo" command="cmd_redo"></menuitem>
        <menuseparator></menuseparator>
        <menuitem id="edit-contextmenu-cut" data-l10n-id="text-action-cut" command="cmd_cut"></menuitem>
        <menuitem id="edit-contextmenu-copy" data-l10n-id="text-action-copy" command="cmd_copy"></menuitem>
        <menuitem id="edit-contextmenu-paste" data-l10n-id="text-action-paste" command="cmd_paste"></menuitem>
        <menuitem id="edit-contextmenu-delete" data-l10n-id="text-action-delete" command="cmd_delete"></menuitem>
        <menuitem id="edit-contextmenu-select-all" data-l10n-id="text-action-select-all" command="cmd_selectAll"></menuitem>
      </menupopup>
    `)
    );
    popup = document.documentElement.lastElementChild;

    for (let itemSet of this._itemSets) {
      this._insertItems(popup, itemSet);
    }
    return popup;
  },

  _insertItems(popup, itemSet) {
    let fragment = itemSet.createItems();
    itemSet.items = [...fragment.children];
    if (itemSet.after) {
      popup.querySelector(`#${itemSet.after}`).after(fragment);
    } else if (itemSet.before) {
      popup.querySelector(`#${itemSet.before}`).before(fragment);
    } else {
      popup.appendChild(fragment);
    }
  },
};

EditContextMenu.addItems({
  matches: input => input.type == "password",
  createItems() {
    return MozXULElement.parseXULToFragment(`
      <menuitem id="edit-contextmenu-reveal-password"
                data-l10n-id="text-action-reveal-password" type="checkbox"/>
    `);
  },
  onShowing(input, [item]) {
    // Reassigned on every contextmenu so it acts on the current input.
    item.oncommand = () => {
      input.revealPassword = !input.revealPassword;
    };
    item.toggleAttribute("checked", input.revealPassword);
  },
});

// Support context menus on html textareas in the parent process:
window.addEventListener("contextmenu", e => {
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const XUL_NS =
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  let target = e.composedTarget;
  let parent = target.parentNode;
  let needsContextMenu =
    target.ownerDocument == document &&
    !e.defaultPrevented &&
    !(parent.namespaceURI == XUL_NS && parent.localName == "moz-input-box") &&
    ["textarea", "input"].includes(target.localName) &&
    target.namespaceURI == HTML_NS;

  if (!needsContextMenu) {
    return;
  }

  EditContextMenu.open(target, e);
  // Don't show any other context menu at the same time. There can be a
  // context menu from an ancestor too but we only want to show this one.
  e.preventDefault();
});
