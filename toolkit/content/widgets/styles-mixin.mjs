/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Extend a custom element with automatic support for including its styles in
 * the host Document or ShadowRoot.
 *
 * @template {new (...args: any[]) => HTMLElement & {
 *   connectedCallback?(): void;
 * }} T
 * @param {T} klass
 * @param {...CSSStyleSheet} styles
 */
export const StylesMixin = (klass, ...styles) =>
  class StylesMixinKlass extends klass {
    static styles = styles;
    /** @type {WeakSet<Document | ShadowRoot>} */
    static #styledRoots = new WeakSet();

    /**
     * Adopt our styles into the root if we haven't seen this root yet.
     *
     * @param {Document | ShadowRoot} root
     */
    static #setStylesOnRoot(root) {
      if (!this.#styledRoots.has(root)) {
        this.#styledRoots.add(root);
        root.adoptedStyleSheets.push(...styles);
      }
    }

    #setStyles() {
      let rootNode = this.getRootNode();
      if (rootNode instanceof Document || rootNode instanceof ShadowRoot) {
        StylesMixinKlass.#setStylesOnRoot(rootNode);
      }
    }

    connectedCallback() {
      super.connectedCallback?.();
      this.#setStyles();
    }
  };
