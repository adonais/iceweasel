/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A controller that enables selection and keyboard navigation within a "tree"
 * view in the sidebar. This tree represents any hierarchical structure of
 * URLs, such as those from synced tabs or history visits.
 *
 * The host component should have the following queries:
 * - `cards` for the `<moz-card>` instances of collapsible containers.
 *
 * @implements {ReactiveController}
 */
export class SidebarTreeView {
  /**
   * All lists that currently have a row selected.
   *
   * @type {Set<SidebarTabList>}
   */
  selectedLists;

  constructor(host, { multiSelect = true } = {}) {
    this.host = host;
    host.addController(this);

    this.multiSelect = multiSelect;
    this.selectedLists = new Set();
  }

  get cards() {
    return this.host.cards;
  }

  hostConnected() {
    this.host.addEventListener("update-selection", this);
    this.host.addEventListener("clear-selection", this);
  }

  hostDisconnected() {
    this.host.removeEventListener("update-selection", this);
    this.host.removeEventListener("clear-selection", this);
  }

  /**
   * Handle events bubbling up from `<sidebar-tab-list>` elements.
   *
   * @param {CustomEvent} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "update-selection":
        this.selectedLists.add(event.originalTarget);
        break;
      case "clear-selection":
        this.selectedLists.delete(event.originalTarget);
        this.clearSelection();
        break;
    }
  }

  /**
   * Handle keydown event originating from the card header.
   *
   * @param {KeyboardEvent} event
   */
  handleCardKeydown(event) {
    if (!this.#shouldHandleEvent(event)) {
      return;
    }
    const nextSibling = event.target.nextElementSibling;
    const prevSibling = event.target.previousElementSibling;
    let focusedRow = null;
    switch (event.code) {
      case "Tab":
        if (prevSibling?.localName === "moz-card") {
          event.preventDefault();
        }
        break;
      case "ArrowUp":
        if (prevSibling?.localName !== "moz-card") {
          this.#focusParentHeader(event.target);
          break;
        }
        if (prevSibling?.expanded) {
          focusedRow = this.#focusLastRow(prevSibling);
        } else {
          prevSibling?.summaryEl?.focus();
        }
        break;
      case "ArrowDown":
        if (event.target.expanded) {
          focusedRow = this.#focusFirstRow(event.target);
        } else if (nextSibling?.localName === "moz-card") {
          nextSibling?.summaryEl?.focus();
        } else if (event.target.classList.contains("last-card")) {
          const outerCard = event.target.parentElement;
          const nextOuterCard = outerCard?.nextElementSibling;
          nextOuterCard?.summaryEl?.focus();
        }
        break;
      case "ArrowLeft":
        if (!event.target.expanded) {
          this.#focusParentHeader(event.target);
        } else {
          event.target.expanded = false;
        }
        break;
      case "ArrowRight":
        if (event.target.expanded) {
          focusedRow = this.#focusFirstRow(event.target);
        } else {
          event.target.expanded = true;
        }
        break;
      case "Home":
        this.cards[0]?.summaryEl?.focus();
        break;
      case "End":
        this.#focusLastVisibleRow();
        break;
    }
    if (this.multiSelect) {
      this.updateSelection(event, focusedRow);
    }
  }

  /**
   * Check if we should handle this event, or if it should be handled by a
   * child element such as `<sidebar-tab-list>`.
   *
   * @param {KeyboardEvent} event
   * @returns {boolean}
   */
  #shouldHandleEvent(event) {
    if (event.keyCode === "Home" || event.keyCode === "End") {
      // Keys that scroll the entire tree should always be handled.
      return true;
    }
    const headerIsSelected = event.originalTarget === event.target.summaryEl;
    return headerIsSelected;
  }

  /**
   * Focus the first row of this card (either a URL or nested card header).
   *
   * @param {MozCard} card
   * @returns {SidebarTabRow}
   */
  #focusFirstRow(card) {
    let focusedRow = null;
    let innerElement = card.contentSlotEl.assignedElements()[0];
    if (innerElement.classList.contains("nested-card")) {
      // Focus the first nested card header.
      innerElement.summaryEl.focus();
    } else {
      // Focus the first URL.
      focusedRow = innerElement.rowEls[0];
      focusedRow?.focus();
    }
    return focusedRow;
  }

  /**
   * Focus the last row of this card (either a URL or nested card header).
   *
   * @param {MozCard} card
   * @returns {SidebarTabRow}
   */
  #focusLastRow(card) {
    let focusedRow = null;
    let innerElement = card.contentSlotEl.assignedElements()[0];
    if (innerElement.classList.contains("nested-card")) {
      // Focus the last nested card header (or URL, if nested card is expanded).
      const lastNestedCard = card.lastElementChild;
      if (lastNestedCard.expanded) {
        focusedRow = this.#focusLastRow(lastNestedCard);
      } else {
        lastNestedCard.summaryEl.focus();
      }
    } else {
      // Focus the last URL.
      focusedRow = innerElement.rowEls[innerElement.rowEls.length - 1];
      focusedRow?.focus();
    }
    return focusedRow;
  }

  /**
   * Focus the last visible row of the entire tree.
   */
  #focusLastVisibleRow() {
    const lastCard = this.cards[this.cards.length - 1];
    if (
      lastCard.classList.contains("nested-card") &&
      !lastCard.parentElement.expanded
    ) {
      // If this is an inner card, and the outer card is collapsed, then focus
      // the outer header.
      lastCard.parentElement.summaryEl.focus();
    } else if (lastCard.expanded) {
      this.#focusLastRow(lastCard);
    } else {
      lastCard.summaryEl.focus();
    }
  }

  /**
   * If we're currently on a nested card, focus the "outer" card's header.
   *
   * @param {MozCard} card
   */
  #focusParentHeader(card) {
    if (card.classList.contains("nested-card")) {
      card.parentElement.summaryEl.focus();
    }
  }

  /**
   * When a row is focused while the shift key is held down, add it to the
   * selection. If shift key was not held down, clear the selection.
   *
   * @param {KeyboardEvent} event
   * @param {SidebarTabRow} rowEl
   */
  updateSelection(event, rowEl) {
    if (event.code !== "ArrowUp" && event.code !== "ArrowDown") {
      return;
    }
    if (!event.shiftKey) {
      this.clearSelection();
      return;
    }
    if (rowEl != null) {
      const listForRow = rowEl.getRootNode().host;
      listForRow.selectedGuids.add(rowEl.guid);
      listForRow.requestVirtualListUpdate();
      this.selectedLists.add(listForRow);
    }
  }

  /**
   * Clear the selection from all lists.
   */
  clearSelection() {
    for (const list of this.selectedLists) {
      list.clearSelection();
    }
    this.selectedLists.clear();
  }
}
