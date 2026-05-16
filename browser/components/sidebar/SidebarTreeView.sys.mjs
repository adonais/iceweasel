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

  /**
   * The anchor row for shift-click range selection. Holds the list and GUID of
   * the last row selected without Shift, defining one end of the range when the
   * user shift-clicks another row.
   *
   * @type {{ list: SidebarTabList, guid: string }}
   */
  #selectionAnchor = { list: null, guid: null };

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
    this.host.addEventListener("set-anchor", this);
    this.host.addEventListener("shift-select", this);
    this.host.addEventListener("focus-row", this);
  }

  hostDisconnected() {
    this.host.removeEventListener("update-selection", this);
    this.host.removeEventListener("clear-selection", this);
    this.host.removeEventListener("set-anchor", this);
    this.host.removeEventListener("shift-select", this);
    this.host.removeEventListener("focus-row", this);
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
        this.#clearSelection();
        break;
      case "set-anchor":
        this.#setAnchor(event.originalTarget, event.detail.guid);
        break;
      case "shift-select":
        this.#handleShiftSelect(event.detail.row);
        break;
      case "focus-row":
        this.#handleFocusRow(event);
        break;
    }
  }

  #setAnchor(list, guid) {
    this.#selectionAnchor = { list, guid };
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
        event.preventDefault();
        if (prevSibling?.localName !== "moz-card") {
          this.#focusParentHeader(event.target);
          break;
        }
        if (prevSibling?.expanded) {
          focusedRow = this.#focusLastRow(prevSibling);
        } else if (prevSibling) {
          this.#focusHeader(prevSibling);
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        if (event.target.expanded) {
          focusedRow = this.#focusFirstRow(event.target);
        } else if (nextSibling?.localName === "moz-card") {
          this.#focusHeader(nextSibling);
        } else if (event.target.classList.contains("last-card")) {
          const outerCard = event.target.parentElement;
          const nextOuterCard = outerCard?.nextElementSibling;
          if (nextOuterCard?.localName === "moz-card") {
            this.#focusHeader(nextOuterCard);
          }
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
        if (this.cards[0]) {
          this.#focusHeader(this.cards[0]);
        }
        break;
      case "End":
        this.#focusLastVisibleRow();
        break;
    }
    if (this.multiSelect && !event.getModifierState("Accel")) {
      this.#updateSelection(event, focusedRow);
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
    if (event.code === "Home" || event.code === "End") {
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
      this.#focusHeader(innerElement);
    } else {
      // Focus the first URL.
      focusedRow = innerElement.rowEls[0];
      if (focusedRow) {
        this.#focusRow(focusedRow);
      }
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
        this.#focusHeader(lastNestedCard);
      }
    } else {
      // Focus the last URL.
      focusedRow = innerElement.rowEls[innerElement.rowEls.length - 1];
      if (focusedRow) {
        this.#focusRow(focusedRow);
      }
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
      this.#focusHeader(lastCard.parentElement);
    } else if (lastCard.expanded) {
      this.#focusLastRow(lastCard);
    } else {
      this.#focusHeader(lastCard);
    }
  }

  /**
   * If we're currently on a nested card, focus the "outer" card's header.
   *
   * @param {MozCard} card
   */
  #focusParentHeader(card) {
    if (card.classList.contains("nested-card")) {
      this.#focusHeader(card.parentElement);
    }
  }

  /**
   * Focus a card's header without triggering unnecessary scrolling.
   *
   * @param {MozCard} card
   */
  #focusHeader(card) {
    card.summaryEl.focus({ preventScroll: true });
    card.summaryEl.scrollIntoView({ block: "nearest" });
  }

  /**
   * Focus a tab row without triggering unnecessary scrolling.
   *
   * @param {SidebarTabRow} row
   */
  #focusRow(row) {
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  }

  /**
   * When a row is focused while the shift key is held down, add it to the
   * selection. If shift key was not held down, clear the selection.
   *
   * @param {KeyboardEvent} event
   * @param {SidebarTabRow} rowEl
   */
  #updateSelection(event, rowEl) {
    if (!rowEl || (event.code !== "ArrowUp" && event.code !== "ArrowDown")) {
      return;
    }
    if (event.shiftKey) {
      this.#handleShiftSelect(rowEl);
      return;
    }
    this.#clearSelection();
    this.#setAnchor(rowEl.getRootNode().host, rowEl.guid);
  }

  selectRowInList(row, list, updateList = true) {
    list.selectedGuids.add(row.guid);
    if (updateList) {
      list.requestVirtualListUpdate();
    }
    this.selectedLists.add(list);
  }

  /**
   * Select all items between current anchor and clicked row.
   *
   * If no anchor has been set, fall back to selecting just the clicked row
   * and making it the new anchor.
   *
   * @param {SidebarTabRow} clickedRow
   */
  #handleShiftSelect(clickedRow) {
    const clickedList = clickedRow.getRootNode().host;
    const { list: anchorList, guid: anchorGuid } = this.#selectionAnchor;

    if (!anchorList || !anchorGuid) {
      this.#setAnchor(clickedList, clickedRow.guid);
      this.selectRowInList(clickedRow, clickedList);
      return;
    }

    const lists = [...this.host.lists];
    const anchorListIndex = lists.indexOf(anchorList);

    if (anchorListIndex === -1) {
      // Anchor's list was destroyed (e.g. sort changed); fall back.
      this.#setAnchor(clickedList, clickedRow.guid);
      this.selectRowInList(clickedRow, clickedList);
      return;
    }

    const anchorRowIndex = anchorList.tabItems.findIndex(
      ({ guid }) => guid === anchorGuid
    );
    const clickedListIndex = lists.indexOf(clickedList);
    const clickedRowIndex = clickedList.tabItems.findIndex(
      ({ guid }) => guid === clickedRow.guid
    );

    let startListIndex, startRowIndex, endListIndex, endRowIndex;
    const clickedBelowAnchor =
      clickedListIndex > anchorListIndex ||
      (clickedList === anchorList && clickedRowIndex >= anchorRowIndex);

    if (clickedBelowAnchor) {
      startListIndex = anchorListIndex;
      startRowIndex = anchorRowIndex;
      endListIndex = clickedListIndex;
      endRowIndex = clickedRowIndex;
    } else {
      startListIndex = clickedListIndex;
      startRowIndex = clickedRowIndex;
      endListIndex = anchorListIndex;
      endRowIndex = anchorRowIndex;
    }

    this.#selectAllBetween(
      lists,
      startListIndex,
      endListIndex,
      startRowIndex,
      endRowIndex
    );
  }

  /**
   * Multiselect all rows from start to end.
   *
   * @param {SidebarTabList[]} lists
   * @param {number} startListIndex
   * @param {number} endListIndex
   * @param {number} startRowIndex
   * @param {number} endRowIndex
   */
  #selectAllBetween(
    lists,
    startListIndex,
    endListIndex,
    startRowIndex,
    endRowIndex
  ) {
    this.#clearSelection();
    for (let i = startListIndex; i <= endListIndex; i++) {
      const list = lists[i];
      const isFirst = i === startListIndex;
      const isLast = i === endListIndex;

      if (!isFirst && !isLast) {
        list.selectAll();
        continue;
      }

      const rows = list.tabItems;
      const start = isFirst ? startRowIndex : 0;
      const end = isLast ? endRowIndex : rows.length - 1;
      for (let j = start; j <= end; j++) {
        this.selectRowInList(rows[j], list, false);
      }
      list.requestVirtualListUpdate();
    }
  }

  /**
   * Set the anchor to the focused row if no anchor is currently set.
   *
   * @param {CustomEvent} event
   */
  #handleFocusRow(event) {
    if (this.#selectionAnchor.guid) {
      return;
    }
    this.#setAnchor(event.originalTarget, event.detail.guid);
  }

  /**
   * Get all selected tab items across all lists.
   *
   * @returns {object[]}
   */
  getSelectedTabItems() {
    const items = [];
    for (const list of this.selectedLists) {
      for (const item of list.tabItems) {
        if (list.isTabItemSelected(item)) {
          items.push(item);
        }
      }
    }
    return items;
  }

  #clearSelection() {
    for (const list of this.selectedLists) {
      list.clearSelection();
    }
    this.selectedLists.clear();
  }

  resetSelection() {
    this.#clearSelection();
    this.#setAnchor(null, null);
  }
}
