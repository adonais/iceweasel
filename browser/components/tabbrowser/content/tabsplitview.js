/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  class MozTabSplitViewWrapper extends MozXULElement {
    /** @type {MutationObserver} */
    #tabChangeObserver;

    /** @type {MozTabbrowserTab[]} */
    #tabs = [];

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
      // Set up TabSelect listener, as this gets
      // removed in disconnectedCallback
      this.ownerGlobal.addEventListener("TabSelect", this);

      this.#observeTabChanges();

      if (this._initialized) {
        return;
      }

      this._initialized = true;

      this.textContent = "";

      // Mirroring MozTabbrowserTab
      this.container = gBrowser.tabContainer;
    }

    disconnectedCallback() {
      this.#tabChangeObserver?.disconnect();
      this.ownerGlobal.removeEventListener("TabSelect", this);
      this.#deactivate();
    }

    #observeTabChanges() {
      if (!this.#tabChangeObserver) {
        this.#tabChangeObserver = new window.MutationObserver(() => {
          if (this.tabs.length) {
            this.hasActiveTab = this.tabs.some(tab => tab.selected);
            this.tabs.forEach((tab, index) => {
              // Renumber tabs so that a11y tools can tell users that a given
              // tab is "1 of 2" in the split view, for example.
              tab.setAttribute("aria-posinset", index + 1);
              tab.setAttribute("aria-setsize", this.tabs.length);
            });
          } else {
            this.remove();
          }

          if (this.tabs.length < 2) {
            this.unsplitTabs();
          }
        });
      }
      this.#tabChangeObserver.observe(this, {
        childList: true,
      });
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
      return Array.from(this.children).filter(node => node.matches("tab"));
    }

    /**
     * Show all Split View tabs in the content area.
     */
    #activate() {
      gBrowser.showSplitViewPanels(this.#tabs);
      this.dispatchEvent(
        new CustomEvent("TabSplitViewActivate", {
          detail: { tabs: this.#tabs },
          bubbles: true,
        })
      );
    }

    /**
     * Remove Split View tabs from the content area.
     */
    #deactivate() {
      gBrowser.hideSplitViewPanels(this.#tabs);
      this.dispatchEvent(
        new CustomEvent("TabSplitViewDeactivate", {
          detail: { tabs: this.#tabs },
          bubbles: true,
        })
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
        this.#tabs.push(tabToMove);
        gBrowser.moveTabToSplitView(tabToMove, this);
        if (tab === gBrowser.selectedTab) {
          this.hasActiveTab = true;
        }
      }
      if (this.hasActiveTab) {
        this.#activate();
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
      gBrowser.removeTabs(this.#tabs);
    }

    /**
     * @param {CustomEvent} event
     */
    on_TabSelect(event) {
      this.hasActiveTab = event.target.splitview === this;
      if (this.hasActiveTab) {
        this.#activate();
      } else {
        this.#deactivate();
      }
    }
  }

  customElements.define("tab-split-view-wrapper", MozTabSplitViewWrapper);
}
