/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * @import { GetTextOptions } from './PageExtractor.js'
 * @import { PageExtractorParent } from './PageExtractorParent.sys.mjs'
 */

/* eslint-disable jsdoc/require-property-description */

/**
 * @typedef {object} Lazy
 * @property {typeof console} console
 * @property {typeof import("resource://gre/modules/Readerable.sys.mjs").isProbablyReaderable} isProbablyReaderable
 * @property {typeof import("moz-src:///toolkit/components/reader/ReaderMode.sys.mjs").ReaderMode} ReaderMode
 * @property {typeof import("./DOMExtractor.sys.mjs").extractTextFromDOM} extractTextFromDOM
 */

/** @type {Lazy} */
const lazy = /** @type {any} */ ({});

ChromeUtils.defineLazyGetter(lazy, "console", () => {
  return console.createInstance({
    prefix: "PageExtractorChild",
    maxLogLevelPref: "browser.ml.logLevel",
  });
});

ChromeUtils.defineESModuleGetters(lazy, {
  ReaderMode: "moz-src:///toolkit/components/reader/ReaderMode.sys.mjs",
  extractTextFromDOM:
    "moz-src:///toolkit/components/pageextractor/DOMExtractor.sys.mjs",
  isProbablyReaderable: "resource://gre/modules/Readerable.sys.mjs",
});

/**
 * Extract a variety of content from pages for use in a smart window.
 */
export class PageExtractorChild extends JSWindowActorChild {
  /**
   * Route the messages coming from the parent process.
   *
   * @param {object} message
   * @param {string} message.name
   * @param {any} message.data
   *
   * @returns {Promise<unknown>}
   */
  async receiveMessage({ name, data }) {
    switch (name) {
      case "PageExtractorParent:GetReaderModeContent":
        return this.getReaderModeContent(data);
      case "PageExtractorParent:GetText":
        return this.getText(data);
    }
    return Promise.reject(new Error("Unknown message: " + name));
  }

  /**
   * @see PageExtractorParent#getReaderModeContent for docs
   *
   * @param {boolean} force
   * @returns {Promise<string | null>} text from the page
   */
  async getReaderModeContent(force) {
    const window = this.browsingContext?.window;
    const document = window?.document;

    if (!force && (!document || !lazy.isProbablyReaderable(document))) {
      return null;
    }

    if (!document) {
      return "";
    }

    const article = await lazy.ReaderMode.parseDocument(document);
    if (!article) {
      return "";
    }

    const text = (article?.textContent || "")
      .trim()
      // Replace duplicate whitespace with either a single newline or space
      .replace(/(\s*\n\s*)|\s{2,}/g, (_, newline) => (newline ? "\n" : " "));

    lazy.console.log("GetReaderModeContent", { force });
    lazy.console.debug(text);

    return text;
  }

  /**
   * @see PageExtractorParent#getText for docs
   *
   * @param {GetTextOptions} options
   * @returns {string}
   */
  getText(options) {
    const window = this.browsingContext?.window;
    const document = window?.document;

    if (!document) {
      return "";
    }

    if (options.removeBoilerplate) {
      throw new Error("Boilerplate removal is not supported yet.");
    }

    if (options.justViewport) {
      throw new Error("Just getting the viewport is not supported yet.");
    }

    const text = lazy.extractTextFromDOM(document);

    lazy.console.log("GetText", options);
    lazy.console.debug(text);

    return text.trim();
  }
}
