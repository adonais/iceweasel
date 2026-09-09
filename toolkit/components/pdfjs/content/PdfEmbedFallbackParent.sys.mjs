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

/**
 * Returns the window global that embeds aFallback, or null unless aFallback is
 * in an object/embed element with an unprivileged embedder principal.
 *
 * A compromised content process can send the message for any frame it hosts.
 * Only the process containing the embedder may set embedderElementType, and
 * privileged embedder principals are rejected.
 *
 * @param {WindowGlobalParent} aFallback the window displaying the fallback page.
 * @returns {WindowGlobalParent|null}
 */
function getEmbeddingPage(aFallback) {
  const { browsingContext } = aFallback;
  const { embedderElementType } = browsingContext;
  if (embedderElementType !== "embed" && embedderElementType !== "object") {
    return null;
  }
  const embedder = browsingContext.embedderWindowGlobal;
  const principal = embedder?.documentPrincipal;
  return principal?.isContentPrincipal || principal?.isNullPrincipal
    ? embedder
    : null;
}

/**
 * Reopens the PDF represented by the fallback page when its button is activated.
 *
 * With site isolation, a cross-site fallback runs in the PDF site's process,
 * which cannot initiate a load with the embedder's principal. The parent derives
 * the URI and principal from its window globals; the serialized referrer is the
 * only load value supplied by the child.
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
