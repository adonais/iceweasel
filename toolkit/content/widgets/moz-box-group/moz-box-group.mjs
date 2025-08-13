/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, staticHtml, literal } from "../vendor/lit.all.mjs";
import { MozLitElement } from "../lit-utils.mjs";

export const GROUP_TYPES = {
  list: "list",
  reorderable: "reorderable-list",
};

/**
 * An element used to group combinations of moz-box-item, moz-box-link, and
 * moz-box-button elements and provide the expected styles.
 *
 * @tagname moz-box-group
 * @property {string} type
 *   The type of the group, either "list", "reorderable-list", or undefined.
 *   Note that "reorderable-list" only works with moz-box-item elements for now.
 * @slot default - Slot for rendering various moz-box-* elements.
 * @slot <index> - Slots used to assign moz-box-* elements to <li> elements when
 *   the group is type="list".
 */
export default class MozBoxGroup extends MozLitElement {
  #tabbable = true;

  static properties = {
    type: { type: String },
    listItems: { type: Array, state: true },
  };

  static queries = {
    reorderableList: "moz-reorderable-list",
  };

  constructor() {
    super();
    this.listItems = [];
  }

  contentTemplate() {
    if (this.type == GROUP_TYPES.reorderable) {
      return html`<moz-reorderable-list
        itemselector="moz-box-item"
        dragselector=".handle"
        @reorder=${this.handleReorder}
      >
        ${this.slotTemplate()}
      </moz-reorderable-list>`;
    }
    return this.slotTemplate();
  }

  slotTemplate() {
    if (this.type == GROUP_TYPES.list || this.type == GROUP_TYPES.reorderable) {
      let listTag =
        this.type == GROUP_TYPES.reorderable ? literal`ol` : literal`ul`;
      return staticHtml`<${listTag}
          class="list"
          aria-orientation="vertical"
          @keydown=${this.handleKeydown}
          @focusin=${this.handleFocus}
          @focusout=${this.handleBlur}
        >
          ${this.listItems.map((_, i) => {
            return html`<li>
              <slot name=${i}></slot>
            </li> `;
          })}
        </${listTag}>
        <slot hidden @slotchange=${this.updateItems}></slot>`;
    }
    return html`<slot></slot>`;
  }

  handleReorder(event) {
    let { draggedElement, targetElement, position } = event.detail;
    let parent = targetElement.parentNode;
    let moveBefore = position === -1;

    if (moveBefore) {
      parent.insertBefore(draggedElement, targetElement);
    } else {
      parent.insertBefore(draggedElement, targetElement.nextElementSibling);
    }

    draggedElement.focus();
    this.updateItems();
  }

  handleKeydown(event) {
    if (
      this.type == GROUP_TYPES.reorderable &&
      event.originalTarget == event.target.handleEl
    ) {
      let detail = this.reorderableList.evaluateKeyDownEvent(event);
      if (detail) {
        event.stopPropagation();
        this.handleReorder({ detail });
        return;
      }
    }

    let positionAttr =
      event.target.getAttribute("position") ??
      // handles the case where an interactive element is nested in a moz-box-item
      event.target.closest("moz-box-item").getAttribute("position");
    let currentPosition = parseInt(positionAttr);

    switch (event.key) {
      case "Down":
      case "ArrowDown": {
        let nextItem = this.listItems[currentPosition + 1];
        nextItem?.focus(event);
        break;
      }
      case "Up":
      case "ArrowUp": {
        let prevItem = this.listItems[currentPosition - 1];
        prevItem?.focus(event);
        break;
      }
    }
  }

  handleFocus() {
    if (this.#tabbable) {
      this.#tabbable = false;
      this.listItems.forEach(item => {
        item.setAttribute("tabindex", "-1");
      });
    }
  }

  handleBlur() {
    if (!this.#tabbable) {
      this.#tabbable = true;
      this.listItems.forEach(item => {
        item.removeAttribute("tabindex");
      });
    }
  }

  updateItems() {
    let boxElements = this.querySelectorAll(
      ":is(moz-box-item, moz-box-button, moz-box-link):not([slot='header'], [slot='footer'])"
    );
    this.listItems = Array.from(boxElements);
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://global/content/elements/moz-box-group.css"
      />
      <slot name="header"></slot>
      ${this.contentTemplate()}
      <slot name="footer"></slot>
    `;
  }

  updated(changedProperties) {
    if (changedProperties.has("listItems") && this.listItems.length) {
      this.listItems.forEach((item, i) => {
        item.slot = i;
        item.setAttribute("position", i);
      });
    }
  }
}
customElements.define("moz-box-group", MozBoxGroup);
