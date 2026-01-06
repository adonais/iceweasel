/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  const { TabNotes } = ChromeUtils.importESModule(
    "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs"
  );

  class MozTabbrowserTabNoteMenu extends MozXULElement {
    static markup = /*html*/ `
    <panel
        id="tabNotePanel"
        type="arrow"
        titlebar="normal"
        class="tab-note-editor-panel"
        orient="vertical"
        role="dialog"
        ignorekeys="true"
        norolluponanchor="true"
        aria-labelledby="tab-note-editor-title"
        consumeoutsideclicks="false">

        <html:div class="panel-header" >
          <html:h1
            id="tab-note-editor-title">
          </html:h1>
        </html:div>

        <toolbarseparator />

        <html:div
          class="panel-body
          tab-note-editor-name">
          <html:textarea
            id="tab-note-text"
            name="tab-note-text"
            rows="3"
            value=""
            data-l10n-id="tab-note-editor-text-field"
          ></html:textarea>
        </html:div>

        <html:moz-button-group
            class="tab-note-create-actions tab-note-create-mode-only"
            id="tab-note-default-actions">
            <html:moz-button
                id="tab-note-editor-button-cancel"
                data-l10n-id="tab-note-editor-button-cancel">
            </html:moz-button>
            <html:moz-button
                type="primary"
                id="tab-note-editor-button-save"
                data-l10n-id="tab-note-editor-button-save">
            </html:moz-button>
        </html:moz-button-group>

    </panel>
       `;

    #initialized = false;
    #panel;
    #noteField;
    #titleNode;
    #currentTab = null;
    #createMode;

    connectedCallback() {
      if (this.#initialized) {
        return;
      }

      this.textContent = "";
      this.appendChild(this.constructor.fragment);
      this.initializeAttributeInheritance();

      this.#panel = this.querySelector("panel");
      this.#noteField = document.getElementById("tab-note-text");
      this.#titleNode = document.getElementById("tab-note-editor-title");

      this.querySelector("#tab-note-editor-button-cancel").addEventListener(
        "click",
        () => {
          this.#panel.hidePopup();
        }
      );
      this.querySelector("#tab-note-editor-button-save").addEventListener(
        "click",
        () => {
          this.saveNote();
        }
      );
      this.#panel.addEventListener("keypress", this);
      this.#panel.addEventListener("popuphidden", this);

      this.#initialized = true;
    }

    on_keypress(event) {
      if (event.defaultPrevented) {
        // The event has already been consumed inside of the panel.
        return;
      }

      switch (event.keyCode) {
        case KeyEvent.DOM_VK_ESCAPE:
          this.#panel.hidePopup();
          break;
        case KeyEvent.DOM_VK_RETURN:
          this.saveNote();
          break;
      }
    }

    on_popuphidden() {
      this.#currentTab = null;
      this.#noteField.value = "";
    }

    get createMode() {
      return this.#createMode;
    }

    set createMode(createModeEnabled) {
      if (this.#createMode == createModeEnabled) {
        return;
      }
      let headerL10nId = createModeEnabled
        ? "tab-note-editor-title-create"
        : "tab-note-editor-title-edit";
      this.#titleNode.innerText =
        gBrowser.tabLocalization.formatValueSync(headerL10nId);
      this.#createMode = createModeEnabled;
    }

    get #panelPosition() {
      if (gBrowser.tabContainer.verticalMode) {
        return SidebarController._positionStart
          ? "topleft topright"
          : "topright topleft";
      }
      return "bottomleft topleft";
    }

    openPanel(tab) {
      this.#currentTab = tab;
      let url = this.#currentTab.canonicalUrl;

      if (url) {
        let note = TabNotes.get(url);
        if (note) {
          this.createMode = false;
          this.#noteField.value = note;
        } else {
          this.createMode = true;
        }
      } else {
        this.createMode = true;
      }
      this.#panel.addEventListener(
        "popupshown",
        () => {
          this.#noteField.focus();
        },
        {
          once: true,
        }
      );
      this.#panel.openPopup(tab, {
        position: this.#panelPosition,
      });
    }

    saveNote() {
      let url = this.#currentTab.canonicalUrl;
      let note = this.#noteField.value;
      TabNotes.set(url, note);
      this.#panel.hidePopup();
    }
  }

  customElements.define("tabnote-menu", MozTabbrowserTabNoteMenu);
}
