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

// Register/unregister a constructor as a factory.
export function StreamConverterFactory() {
  if (!lazy.pdfjsDisabled) {
    return new lazy.PdfStreamConverter();
  }
  // Even when the viewer is disabled, a converter is needed to display a
  // fallback page in object/embed elements. That page is only packaged on
  // desktop, see toolkit/components/pdfjs/jar.mn.
  if (AppConstants.platform !== "android" && lazy.embedFallbackEnabled) {
    return new lazy.PdfEmbedFallbackStreamConverter();
  }
  throw Components.Exception("", Cr.NS_ERROR_FACTORY_NOT_REGISTERED);
}
