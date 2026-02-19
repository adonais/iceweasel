/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  ChromeUtils.defineESModuleGetters(this, {
    DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  });

  /**
   * A shared task which updates the urlbar indicator whenever:
   * - A split view is activated or deactivated.
   * - The active tab of a split view changes.
   * - The order of tabs in a split view changes.
   *
   * @type {DeferredTask}
   */
  const updateUrlbarButton = new DeferredTask(() => {
    const { activeSplitView, selectedTab } = gBrowser;
    const button = document.getElementById("split-view-button");
    if (activeSplitView) {
      const activeIndex = activeSplitView.tabs.indexOf(selectedTab);
      button.hidden = false;
      button.setAttribute("data-active-index", activeIndex);
    } else {
      button.hidden = true;
      button.removeAttribute("data-active-index");
    }
  }, 0);

  class MozTabSplitViewWrapper extends MozXULElement {
    /** @type {MutationObserver} */
    #tabChangeObserver;

    /** @type {MozTabbrowserTab[]} */
    #tabs = [];

    #storedPanelWidths = new WeakMap();

    /**
     * @returns {boolean}
     */
    get hasActiveTab() {
      return this.hasAttribute("hasactivetab");
    }

    /**
     * @returns {MozTabbrowserGroup}
     */
    get group() {
      return gBrowser.isTabGroup(this.parentElement)
        ? this.parentElement
        : null;
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
      this.#restorePanelWidths();

      if (this.hasActiveTab) {
        this.#activate();
      }

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
      this.#resetPanelWidths();
      this.container.dispatchEvent(
        new CustomEvent("SplitViewRemoved", {
          bubbles: true,
          composed: true,
        })
      );
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
              tab.updateSplitViewAriaLabel(index);
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

    get visible() {
      return this.tabs.every(tab => tab.visible);
    }

    /**
     * Get the list of tab panels from this split view.
     *
     * @returns {XULElement[]}
     */
    get panels() {
      const panels = [];
      for (const { linkedPanel } of this.#tabs) {
        const el = document.getElementById(linkedPanel);
        if (el) {
          panels.push(el);
        }
      }
      return panels;
    }

    /**
     * Show all Split View tabs in the content area.
     */
    #activate(skipShowPanels = false) {
      updateUrlbarButton.arm();
      if (!skipShowPanels) {
        gBrowser.showSplitViewPanels(this.#tabs);
      }
      this.container.dispatchEvent(
        new CustomEvent("TabSplitViewActivate", {
          detail: { tabs: this.#tabs, splitview: this },
          bubbles: true,
        })
      );
    }

    /**
     * Remove Split View tabs from the content area.
     */
    #deactivate(skipHidePanels = false) {
      if (!skipHidePanels) {
        gBrowser.hideSplitViewPanels(this.#tabs);
      }
      updateUrlbarButton.arm();
      this.container.dispatchEvent(
        new CustomEvent("TabSplitViewDeactivate", {
          detail: { tabs: this.#tabs, splitview: this },
          bubbles: true,
        })
      );
    }

    /**
     * Remove customized panel widths. Cache width values so that they can be
     * restored if this Split View is later reactivated.
     */
    #resetPanelWidths() {
      for (const panel of this.panels) {
        const width = panel.getAttribute("width");
        if (width) {
          this.#storedPanelWidths.set(panel, width);
          panel.removeAttribute("width");
          panel.style.removeProperty("width");
        }
      }
    }

    /**
     * Resize panel widths back to cached values.
     */
    #restorePanelWidths() {
      for (const panel of this.panels) {
        const width = this.#storedPanelWidths.get(panel);
        if (width) {
          panel.setAttribute("width", width);
          panel.style.setProperty("width", width + "px");
        }
      }
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
        gBrowser.setIsSplitViewActive(true, this.#tabs);
      }
    }

    /**
     * Remove all tabs from the split view wrapper and delete the split view.
     */
    unsplitTabs() {
      gBrowser.unsplitTabs(this);
      gBrowser.setIsSplitViewActive(false, this.#tabs);
    }

    /**
     * Replace a tab in the split view with another tab
     */
    replaceTab(tabToReplace, newTab) {
      this.#tabs = this.#tabs.filter(tab => tab != tabToReplace);
      this.addTabs([newTab]);
      gBrowser.removeTab(tabToReplace);
    }

    /**
     * Reverse order of the tabs in the split view wrapper.
     */
    reverseTabs() {
      const [firstTab, secondTab] = this.#tabs;
      gBrowser.moveTabBefore(secondTab, firstTab);
      this.#tabs = [secondTab, firstTab];
      gBrowser.showSplitViewPanels(this.#tabs);
      updateUrlbarButton.arm();
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
      gBrowser.setIsSplitViewActive(this.hasActiveTab, this.#tabs);
      if (this.hasActiveTab) {
        this.#activate();
      } else {
        this.#deactivate(true);
      }
    }
  }

  customElements.define("tab-split-view-wrapper", MozTabSplitViewWrapper);
}
