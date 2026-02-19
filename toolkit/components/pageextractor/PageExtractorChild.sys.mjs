/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * @import { GetTextOptions } from './PageExtractor.d.ts'
 * @import { PageExtractorParent } from './PageExtractorParent.sys.mjs'
 */

/**
 * We wait for the page to be ready before extracting content headlessly. It's hard
 * to know when a page is "ready", however the strategy here is to wait for
 * DOMContentLoaded, and then a requestIdleCallback. This way the page has time
 * to do an initial amount of work. However, if we wait too long, it will be felt by
 * the user as lag. To mitigate this, wait for at least 2 seconds for the page to settle.
 */
const MAX_REQUEST_IDLE_CALLBACK_DELAY_MS = 2000;

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  console: () =>
    console.createInstance({
      prefix: "PageExtractorChild",
      maxLogLevelPref: "browser.ml.logLevel",
    }),
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
        if (this.isAboutReader()) {
          return this.getAboutReaderContent();
        }
        return this.getReaderModeContent(data);
      case "PageExtractorParent:GetText":
        if (this.isAboutReader()) {
          return this.getAboutReaderContent();
        }
        return this.getText(data);
      case "PageExtractorParent:WaitForPageReady":
        return this.waitForPageReady();
    }
    return Promise.reject(new Error("Unknown message: " + name));
  }

  /**
   * This function resolves once the page is ready after a requestIdleCallback.
   *
   * @returns {Promise<void>}
   */
  async waitForPageReady() {
    return new Promise(resolve => {
      const waitForIdle = () => {
        this.document.ownerGlobal.requestIdleCallback(() => resolve(), {
          timeout: MAX_REQUEST_IDLE_CALLBACK_DELAY_MS,
        });
      };

      if (this.document.readyState == "loading") {
        this.document.addEventListener("DOMContentLoaded", waitForIdle);
      } else {
        lazy.console.log("The page is already interactive");
        waitForIdle();
      }
    });
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

    let text = (article?.textContent || "")
      .trim()
      // Replace duplicate whitespace with either a single newline or space
      .replace(/(\s*\n\s*)|\s{2,}/g, (_, newline) => (newline ? "\n" : " "));

    if (article.title) {
      text = article.title + "\n\n" + text;
    }
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

    const text = lazy.extractTextFromDOM(document, options);

    lazy.console.log("GetText", options);
    lazy.console.debug(text);

    return text;
  }

  /**
   * Special case extracting text from Reader Mode. The original article content is not
   * retained once reader mode is activated. It is rendered out to the page. Rather
   * than cache an additional copy of the article, just extract the text from the
   * actual reader mode DOM.
   *
   * @returns {string | null}
   */
  getAboutReaderContent() {
    lazy.console.log("Using special text extraction strategy for about:reader");
    const document = this.manager.contentWindow.document;

    if (!document) {
      return null;
    }
    /** @type {HTMLElement?} */
    const titleEl = document.querySelector(".reader-title");
    /** @type {HTMLElement?} */
    const contentEl = document.querySelector(".moz-reader-content");

    const title = titleEl?.innerText;
    const content = contentEl?.innerText;
    if (!title && !content) {
      return null;
    }

    if (title) {
      return `${title}\n\n${content}`.trim();
    }
    return content.trim();
  }

  /**
   * Checks if about:reader is loaded, which requires special handling.
   *
   * @returns {boolean}
   */
  isAboutReader() {
    // Accessing the documentURIObject in this way does not materialize the
    // `window.location.href` and should be a cheaper check here.
    let url = this.manager.contentWindow.document.documentURIObject;
    return url.schemeIs("about") && url.pathQueryRef.startsWith("reader?");
  }
}
