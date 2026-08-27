/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  nothing,
  ref,
  createRef,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

const DEFAULT_FAVICON = "chrome://global/skin/icons/defaultFavicon.svg";

/**
 * Tab shown in the confirmation card.
 *
 * @typedef {object} TabSelectionData
 * @property {string} url - Tab URL
 * @property {string} title - Display title
 * @property {string} [iconSrc] - Favicon URL
 */

/**
 * Confirmation card for a completed NL browser action.
 *
 * @property {string} labelL10nId - Fluent ID for the label
 * @property {object} labelL10nArgs - Arguments for the label
 * @property {boolean} canUndo - Whether the undo button should be shown
 * @property {boolean} isExpanded - Whether the affected tabs list is visible
 * @property {TabSelectionData[]} tabs - Affected tabs
 */
export class AIActionConfirmation extends MozLitElement {
  #tabsListRef = createRef();
  #resizeObserver = null;
  #observedList = null;
  #scrollAnimationId = null;

  static properties = {
    labelL10nId: { type: String },
    labelL10nArgs: { type: Object },
    tabs: { type: Array },
    canUndo: { type: Boolean },
    isExpanded: { type: Boolean, attribute: "is-expanded", reflect: true },
  };

  constructor() {
    super();
    this.labelL10nId = null;
    this.labelL10nArgs = null;
    this.tabs = [];
    this.canUndo = false;
    this.isExpanded = false;
  }

  #handleUndo() {
    this.dispatchEvent(
      new CustomEvent("action-confirmation-undo", {
        bubbles: true,
        composed: true,
      })
    );
  }

  #handleToggle() {
    if (!this.tabs.length) {
      return;
    }
    this.isExpanded = !this.isExpanded;
    this.dispatchEvent(
      new CustomEvent("action-confirmation-toggle", {
        detail: { isExpanded: this.isExpanded },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Open URL or switch to tab. URL if it is already open.
   *
   * @param {MouseEvent} event
   * @param {TabSelectionData} tab
   */
  #handleTabClick(event, tab) {
    event.preventDefault();

    const { shiftKey, metaKey, ctrlKey, altKey, button } = event;
    // Modifier clicks forwards to the parent actor for resolving.
    const hasModifier =
      shiftKey || metaKey || ctrlKey || altKey || button !== 0;

    this.dispatchEvent(
      new CustomEvent("AIChatContent:OpenLink", {
        bubbles: true,
        composed: true,
        detail: {
          url: tab.url,
          preferSwitchToTab: !hasModifier,
          shiftKey,
          metaKey,
          ctrlKey,
          altKey,
          button,
        },
      })
    );
  }

  /**
   * Toggles the `data-overflowing` attribute on the scroll container to control
   * the CSS scroll indicators (top line and bottom fade). These visual cues
   * only appear when the tabs list exceeds the container height.
   */
  #updateOverflowState = () => {
    const list = this.#tabsListRef.value;
    const scroller = list?.parentElement;
    if (!list || !scroller) {
      return;
    }
    const overflowing = list.scrollHeight - list.clientHeight > 1;
    if (overflowing !== scroller.hasAttribute("data-overflowing")) {
      scroller.toggleAttribute("data-overflowing", overflowing);
    }
    this.#updateListScrollFade();
  };

  /**
   * Handles scroll events from the tabs list.
   *
   * Returns early if CSS `animation-timeline: scroll()` is supported.
   */
  #handleScroll = () => {
    if (CSS.supports("animation-timeline", "scroll()")) {
      return;
    }
    this.#updateListScrollFade();
  };

  #updateListScrollFade() {
    if (CSS.supports("animation-timeline", "scroll()")) {
      return;
    }
    // Only run animation if there is not already an animation request for
    // the current frame.
    if (this.#scrollAnimationId) {
      return;
    }
    this.#scrollAnimationId = requestAnimationFrame(() => {
      this.#scrollAnimationId = null;

      const list = this.#tabsListRef.value;
      const scroller = list?.parentElement;
      if (!list || !scroller) {
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = list;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
      scroller.style.setProperty(
        "--action-confirmation-scroll-progress",
        progress.toFixed(3)
      );
    });
  }

  /**
   * @param {TabSelectionData} tab
   */
  #renderTab(tab) {
    return html`
      <li>
        <a
          class="action-confirmation-tab"
          href=${tab.url}
          title=${tab.url}
          @click=${e => this.#handleTabClick(e, tab)}
        >
          <img
            class="action-confirmation-tab-icon"
            alt=""
            src=${tab.iconSrc || DEFAULT_FAVICON}
          />
          <span class="action-confirmation-tab-label">${tab.title}</span>
        </a>
      </li>
    `;
  }

  updated() {
    // Observe the list to ensure the overflow is correct across layout changes.
    const list = this.#tabsListRef.value ?? null;
    if (list === this.#observedList) {
      return;
    }
    if (!this.#resizeObserver) {
      this.#resizeObserver = new ResizeObserver(() =>
        this.#updateOverflowState()
      );
    }
    if (this.#observedList) {
      this.#resizeObserver.unobserve(this.#observedList);
      this.#observedList.removeEventListener("scroll", this.#handleScroll);
    }
    if (list) {
      this.#resizeObserver.observe(list);
      list.addEventListener("scroll", this.#handleScroll);
    }
    this.#observedList = list;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#observedList?.removeEventListener("scroll", this.#handleScroll);
    this.#observedList = null;
    if (this.#scrollAnimationId) {
      cancelAnimationFrame(this.#scrollAnimationId);
      this.#scrollAnimationId = null;
    }
  }

  render() {
    const isExpandable = !!this.tabs.length;
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-action-confirmation.css"
      />
      <div class="action-confirmation-wrapper">
        <div class="action-confirmation-header">
          <button
            type="button"
            class="action-confirmation-summary"
            ?disabled=${!isExpandable}
            aria-expanded=${isExpandable ? this.isExpanded : nothing}
            aria-controls=${isExpandable && this.isExpanded
              ? "action-confirmation-tabs"
              : nothing}
            @click=${this.#handleToggle}
          >
            <span class="action-confirmation-icon" aria-hidden="true"></span>
            <span
              class="action-confirmation-label"
              data-l10n-id=${this.labelL10nId || nothing}
              data-l10n-args=${this.labelL10nArgs
                ? JSON.stringify(this.labelL10nArgs)
                : nothing}
            ></span>
          </button>
          ${this.canUndo
            ? html`
                <moz-button
                  class="action-confirmation-undo"
                  type="ghost"
                  @click=${this.#handleUndo}
                  data-l10n-id="smartwindow-nl-undo-button"
                ></moz-button>
              `
            : nothing}
        </div>
        ${isExpandable && this.isExpanded
          ? html`
              <div class="action-confirmation-scroller">
                <ul
                  id="action-confirmation-tabs"
                  class="action-confirmation-tabs"
                  ${ref(this.#tabsListRef)}
                >
                  ${this.tabs.map(tab => this.#renderTab(tab))}
                </ul>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define("ai-action-confirmation", AIActionConfirmation);
