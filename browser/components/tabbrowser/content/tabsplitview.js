/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  class MozTabSplitViewWrapper extends MozXULElement {
    static markup = `
      <vbox class="tab-split-view-container" pack="center">
      </vbox>
      `;

    /** @type {MozXULElement} */
    #containerElement;

    /** @type {MutationObserver} */
    #tabChangeObserver;

    /**
     * @returns {boolean}
     */
    get hasActiveTab() {
      return this.hasAttribute("hasactivetab");
    }

    /**
     * @param {boolean} val
     */
    set hasActiveTab(val) {
      this.toggleAttribute("hasactivetab", val);
    }

    constructor() {
      super();
    }

    connectedCallback() {
      this.#observeTabChanges();

      // Set up TabSelect listener, as this gets
      // removed in disconnectedCallback
      this.ownerGlobal.addEventListener("TabSelect", this);

      if (this._initialized) {
        return;
      }

      this._initialized = true;

      this.textContent = "";
      this.appendChild(this.constructor.fragment);

      this.#containerElement = this.querySelector(".tab-split-view-container");

      // Mirroring MozTabbrowserTab
      this.#containerElement.container = gBrowser.tabContainer;
      this.wrapper = this.#containerElement;
    }

    disconnectedCallback() {
      this.#tabChangeObserver?.disconnect();
      this.ownerGlobal.removeEventListener("TabSelect", this);
    }

    #observeTabChanges() {
      if (!this.#tabChangeObserver) {
        this.#tabChangeObserver = new window.MutationObserver(() => {
          if (this.tabs.length) {
            let hasActiveTab = this.tabs.some(tab => tab.selected);
            this.hasActiveTab = hasActiveTab;
          }
        });
      }
      this.#tabChangeObserver.observe(this, { childList: true });
    }

    get splitViewId() {
      return this.getAttribute("splitViewId");
    }

    set splitViewId(val) {
      this.setAttribute("splitViewId", val);
    }

    /**
     * @returns {MozTabbrowserTab[]}
     */
    get tabs() {
      return Array.from(this.#containerElement.children).filter(node =>
        node.matches("tab")
      );
    }

    /**
     * add tabs to the split view wrapper
     *
     * @param {MozTabbrowserTab[]} tabs
     */
    addTabs(tabs) {
      for (let tab of tabs) {
        if (tab.pinned) {
          return;
        }
        let tabToMove =
          this.ownerGlobal === tab.ownerGlobal
            ? tab
            : gBrowser.adoptTab(tab, {
                tabIndex: gBrowser.tabs.at(-1)._tPos + 1,
                selectTab: tab.selected,
              });
        gBrowser.moveTabToSplitView(tabToMove, this);
      }
    }

    /**
     * Remove all tabs from the split view wrapper and delete the split view.
     */
    unsplitTabs() {
      gBrowser.unsplitTabs(this);
    }

    /**
     * Close all tabs in the split view wrapper and delete the split view.
     */
    close() {
      gBrowser.removeSplitView(this);
    }

    /**
     * @param {CustomEvent} event
     */
    on_TabSelect(event) {
      this.hasActiveTab = event.target.splitview === this;
    }
  }

  customElements.define("tab-split-view-wrapper", MozTabSplitViewWrapper);
}
