/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into all XUL windows. Wrap in a block to prevent
// leaking to window scope.
{
  const { RemoteL10n } = ChromeUtils.importESModule(
    "resource:///modules/asrouter/RemoteL10n.sys.mjs"
  );
  class MozRemoteText extends HTMLElement {
    constructor() {
      super();

      this._content = null;
      this._translated = Promise.resolve();
    }

    get fluentAttributeValues() {
      const attributes = {};
      for (let name of this.getAttributeNames()) {
        if (name.startsWith("fluent-variable-")) {
          let value = this.getAttribute(name);
          // Attribute value is a string, in some cases that is not useful
          // for example instantiating a Date object will fail. We try to
          // convert all possible integers back.
          if (value.match(/^\d+/)) {
            value = parseInt(value, 10);
          }
          attributes[name.replace(/^fluent-variable-/, "")] = value;
        }
      }

      return attributes;
    }

    render() {
      if (this.getAttribute("fluent-remote-id") && this._content) {
        RemoteL10n.l10n.setAttributes(
          this._content,
          this.getAttribute("fluent-remote-id"),
          this.fluentAttributeValues
        );
        // RemoteL10n does not observe this shadow root. Queue translations to
        // preserve render order, and report failures.
        this._translated = this._translated
          .then(() => RemoteL10n.l10n.translateFragment(this._content))
          .catch(console.error);
      }
    }

    /**
     * Updates a Fluent variable and rerenders the message.
     *
     * @param {string} name - The variable name, without the attribute prefix.
     * @param {string|number} value - The value to substitute.
     */
    setVariable(name, value) {
      this.setAttribute(`fluent-variable-${name}`, value);
      this.render();
    }

    static get observedAttributes() {
      return ["fluent-remote-id"];
    }

    attributeChangedCallback() {
      this.render();
    }

    connectedCallback() {
      // The shadow root retains updates made while disconnected. Translating
      // again may fail if the message id is no longer available.
      if (this.shadowRoot) {
        return;
      }

      const shadowRoot = this.attachShadow({ mode: "open" });
      this._content = document.createElement("span");
      shadowRoot.appendChild(this._content);

      this.render();
    }
  }

  customElements.define("remote-text", MozRemoteText);
}
