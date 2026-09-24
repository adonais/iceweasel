/* Copyright 2026 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
});

const EMBEDDER_ELEMENTS = new Set(["embed", "frame", "iframe", "object"]);

/**
 * Returns aFallback's embedding page if it uses a supported element and has a
 * content or null principal.
 *
 * Only the embedding process can set the element type and embedder window ID.
 *
 * @param {WindowGlobalParent} aFallback the actor's sending window.
 * @returns {WindowGlobalParent|null}
 */
function getEmbeddingPage(aFallback) {
  const { browsingContext } = aFallback;
  if (!EMBEDDER_ELEMENTS.has(browsingContext.embedderElementType)) {
    return null;
  }
  const embedder = browsingContext.embedderWindowGlobal;
  const principal = embedder?.documentPrincipal;
  return principal?.isContentPrincipal || principal?.isNullPrincipal
    ? embedder
    : null;
}

/**
 * Reloads the sender's URI with its embedder's principal.
 */
export class PdfEmbedFallbackParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    if (name !== "PdfEmbedFallback:OpenPdf") {
      return;
    }
    const fallback = this.manager;
    if (!fallback?.isCurrentGlobal) {
      // Ignore messages from a document that is no longer current.
      return;
    }
    const embedder = getEmbeddingPage(fallback);
    if (!embedder) {
      return;
    }
    // The converter keeps the PDF URI as the fallback document's URI.
    fallback.browsingContext.loadURI(fallback.documentURI, {
      triggeringPrincipal: embedder.documentPrincipal,
      referrerInfo: lazy.E10SUtils.deserializeReferrerInfo(data?.referrerInfo),
    });
  }
}
