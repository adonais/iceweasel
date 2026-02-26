/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Handles handing off searches from an in-page search input field to the
 * browser's main URL bar. Communicates with the parent via the ContentSearch
 * actor, using custom events to talk to the child actor.
 */
class ContentSearchHandoffUIController {
  #ui = null;
  #shadowRoot = null;

  constructor(ui) {
    this._isPrivateEngine = false;
    this._engineIcon = null;
    this.#ui = ui;
    this.#shadowRoot = ui.shadowRoot;

    window.addEventListener("ContentSearchService", this);
    this._sendMsg("GetEngine");
    this._sendMsg("GetHandoffSearchModePrefs");
  }

  handleEvent(event) {
    let methodName = "_onMsg" + event.detail.type;
    if (methodName in this) {
      this[methodName](event.detail.data);
    }
  }

  get defaultEngine() {
    return this._defaultEngine;
  }

  doSearchHandoff(text) {
    this._sendMsg("SearchHandoff", { text });
  }

  static privateBrowsingRegex = /^about:privatebrowsing([#?]|$)/i;
  get _isAboutPrivateBrowsing() {
    return ContentSearchHandoffUIController.privateBrowsingRegex.test(
      document.location.href
    );
  }

  _onMsgEngine({ isPrivateEngine, engine }) {
    this._isPrivateEngine = isPrivateEngine;
    this._updateEngine(engine);
  }

  _onMsgCurrentEngine(engine) {
    if (!this._isPrivateEngine) {
      this._updateEngine(engine);
    }
  }

  _onMsgCurrentPrivateEngine(engine) {
    if (this._isPrivateEngine) {
      this._updateEngine(engine);
    }
  }

  _onMsgHandoffSearchModePrefs(pref) {
    this._shouldHandOffToSearchMode = pref;
    this._updatel10nIds();
  }

  _onMsgDisableSearch() {
    this.#ui.disabled = true;
  }

  _onMsgShowSearch() {
    this.#ui.disabled = false;
    this.#ui.fakeFocus = false;
  }

  _updateEngine(engine) {
    this._defaultEngine = engine;
    if (this._engineIcon) {
      URL.revokeObjectURL(this._engineIcon);
    }

    // We only show the engines icon for config engines, otherwise show
    // a default. xref https://bugzilla.mozilla.org/show_bug.cgi?id=1449338#c19
    if (!engine.isConfigEngine) {
      this._engineIcon = "chrome://global/skin/icons/search-glass.svg";
    } else if (engine.iconData) {
      this._engineIcon = this._getFaviconURIFromIconData(engine.iconData);
    } else {
      this._engineIcon = "chrome://global/skin/icons/defaultFavicon.svg";
    }

    document.body.style.setProperty(
      "--newtab-search-icon",
      "url(" + this._engineIcon + ")"
    );
    this._updatel10nIds();
  }

  _updatel10nIds() {
    let engine = this._defaultEngine;
    let fakeButton = this.#shadowRoot.querySelector(".search-handoff-button");
    let fakeInput = this.#shadowRoot.querySelector(".fake-textbox");
    if (!fakeButton || !fakeInput) {
      return;
    }
    if (!engine || this._shouldHandOffToSearchMode) {
      document.l10n.setAttributes(
        fakeButton,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-search-btn"
          : "newtab-search-box-input"
      );
      document.l10n.setAttributes(
        fakeInput,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-search-placeholder"
          : "newtab-search-box-text"
      );
    } else if (!engine.isConfigEngine) {
      document.l10n.setAttributes(
        fakeButton,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-handoff-no-engine"
          : "newtab-search-box-handoff-input-no-engine"
      );
      document.l10n.setAttributes(
        fakeInput,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-handoff-text-no-engine"
          : "newtab-search-box-handoff-text-no-engine"
      );
    } else {
      document.l10n.setAttributes(
        fakeButton,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-handoff"
          : "newtab-search-box-handoff-input",
        {
          engine: engine.name,
        }
      );
      document.l10n.setAttributes(
        fakeInput,
        this._isAboutPrivateBrowsing
          ? "about-private-browsing-handoff-text"
          : "newtab-search-box-handoff-text",
        {
          engine: engine.name,
        }
      );
    }
  }

  /**
   * If the favicon is an iconData object, convert it into a Blob URI.
   * Otherwise just return the plain URI.
   *
   * @param {string|iconData} data
   *   The icon's URL or an iconData object containing the icon data.
   * @returns {string}
   *   A blob URL or the plain icon URI.
   */
  _getFaviconURIFromIconData(data) {
    if (typeof data == "string") {
      return data;
    }

    // If typeof(data) != "string", the iconData object is returned.
    let blob = new Blob([data.icon], { type: data.mimeType });
    return URL.createObjectURL(blob);
  }

  _sendMsg(type, data = null) {
    dispatchEvent(
      new CustomEvent("ContentSearchClient", {
        detail: {
          type,
          data,
        },
      })
    );
  }
}

window.ContentSearchHandoffUIController = ContentSearchHandoffUIController;

/**
 * This custom element encapsulates the UI for the search handoff experience
 * for about:newtab and about:privatebrowsing. It is a temporary component
 * while we wait for the multi-context address bar (MCAB) to be available.
 */
class ContentSearchHandoffUI extends MozLitElement {
  static queries = {
    fakeCaret: ".fake-caret",
  };

  static properties = {
    fakeFocus: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
  };

  #controller = null;

  #doSearchHandoff(text = "") {
    this.fakeFocus = true;
    this.#controller.doSearchHandoff(text);
  }

  #onSearchHandoffClick(event) {
    // When search hand-off is enabled, we render a big button that is styled to
    // look like a search textbox. If the button is clicked, we style
    // the button as if it was a focused search box and show a fake cursor but
    // really focus the awesomebar without the focus styles ("hidden focus").
    event.preventDefault();
    this.#doSearchHandoff();
  }

  #onSearchHandoffPaste(event) {
    event.preventDefault();
    this.#doSearchHandoff(event.clipboardData.getData("Text"));
  }

  #onSearchHandoffDrop(event) {
    event.preventDefault();
    let text = event.dataTransfer.getData("text");
    if (text) {
      this.#doSearchHandoff(text);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.#controller) {
      this.#controller = new window.ContentSearchHandoffUIController(this);
    }
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/contentSearchHandoffUI.css"
      />
      <button
        class="search-handoff-button"
        @click=${this.#onSearchHandoffClick}
        tabindex="-1"
      >
        <div class="fake-textbox"></div>
        <input
          type="search"
          class="fake-editable"
          tabindex="-1"
          aria-hidden="true"
          @drop=${this.#onSearchHandoffDrop}
          @paste=${this.#onSearchHandoffPaste}
        />
        <div class="fake-caret"></div>
      </button>
    `;
  }
}

customElements.define("content-search-handoff-ui", ContentSearchHandoffUI);
