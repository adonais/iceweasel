/* Copyright 2018 Mozilla Foundation
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

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PdfEmbedFallbackStreamConverter:
    "resource://pdf.js/PdfEmbedFallbackStreamConverter.sys.mjs",
  PdfStreamConverter: "resource://pdf.js/PdfStreamConverter.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "pdfjsDisabled",
  "pdfjs.disabled",
  false
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "embedFallbackEnabled",
  "pdfjs.embedFallback",
  true
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "frameAttributeLoadsEnabled",
  "pdfjs.handleFrameAttributeLoads",
  true
);

const { TYPE_OBJECT, TYPE_SUBDOCUMENT } = Ci.nsIContentPolicy;

/**
 * Returns whether the load is from an object/embed element or from processing
 * an unsandboxed frame element's attributes.
 *
 * Such PDF loads bypass the configured handler; other frame navigations do not.
 * An object/embed element can't invoke that handler at all, so its loads qualify
 * even when sandboxed. A frame can, so sandboxed ones keep using it.
 *
 * Only frame loads started while processing element attributes qualify. Other
 * frame navigations keep the configured handler.
 *
 * @param {nsILoadInfo} aLoadInfo the load info of the PDF request.
 * @returns {boolean}
 */
export function isEmbeddedPdfLoad(aLoadInfo) {
  const type = aLoadInfo?.externalContentPolicyType;
  if (type === TYPE_OBJECT) {
    return true;
  }
  return (
    type === TYPE_SUBDOCUMENT &&
    lazy.frameAttributeLoadsEnabled &&
    aLoadInfo.isFromProcessingFrameAttributes &&
    !aLoadInfo.sandboxFlags
  );
}

// Register/unregister a constructor as a factory.
export function StreamConverterFactory() {
  if (!lazy.pdfjsDisabled) {
    return new lazy.PdfStreamConverter();
  }
  // The embedded-PDF fallback is desktop-only; see
  // toolkit/components/pdfjs/jar.mn.
  if (AppConstants.platform !== "android" && lazy.embedFallbackEnabled) {
    return new lazy.PdfEmbedFallbackStreamConverter();
  }
  throw Components.Exception("", Cr.NS_ERROR_FACTORY_NOT_REGISTERED);
}
