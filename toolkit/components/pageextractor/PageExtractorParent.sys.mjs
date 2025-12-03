/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * @import { GetTextOptions } from './PageExtractor.d.ts'
 * @import { PageExtractorChild } from './PageExtractorChild.sys.mjs'
 */

/**
 * Extract a variety of content from pages for use in a smart window.
 */
export class PageExtractorParent extends JSWindowActorParent {
  /**
   * Returns ReaderMode content when the page passes the `isProbablyReaderable` check.
   * The check can be bypassed to force page content to be retrieved by setting `force`
   * to true.
   *
   * @see PageExtractorChild#getReaderModeContent
   *
   * @param {boolean} force - Bypass the `isProbablyReaderable` check.
   * @returns {Promise<string | null>}
   */
  getReaderModeContent(force = false) {
    return this.sendQuery("PageExtractorParent:GetReaderModeContent", force);
  }

  /**
   * Gets the visible text from the page. This function is a bit smarter than just
   * document.body.innerText. See GetTextOptions
   *
   * @see PageExtractorChild#getText
   *
   * @param {Partial<GetTextOptions>} options
   * @returns {Promise<string | null>}
   */
  getText(options = {}) {
    if (this.#isPDF()) {
      return this.browsingContext.currentWindowGlobal
        .getActor("Pdfjs")
        .getTextContent();
    }
    return this.sendQuery("PageExtractorParent:GetText", options);
  }

  #isPDF() {
    return (
      this.browsingContext.currentWindowGlobal.documentPrincipal
        .originNoSuffix == "resource://pdf.js"
    );
  }
}
