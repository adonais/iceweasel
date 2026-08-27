/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const gPrefs = {};

XPCOMUtils.defineLazyPreferenceGetter(
  gPrefs,
  "gEnabled",
  "devtools.jsonview.enabled"
);

const JSON_VIEW_MIME_TYPE = "application/vnd.mozilla.json.view";
const JSONLINES_VIEW_MIME_TYPE = "application/vnd.mozilla.jsonlines.view";

function getContentDisposition(channel) {
  try {
    return channel.contentDisposition;
  } catch (e) {
    // Channel doesn't support content dispositions
    return null;
  }
}

/**
 * This component represents a sniffer (implements nsIContentSniffer
 * interface) responsible for changing top level 'application/json'
 * and JSON Lines document types to internal types consumed by the
 * JSON View component.
 *
 * This is done in the .js file rather than a .sys.mjs to avoid creating
 * a compartment at startup when no JSON is being viewed.
 */
export class Sniffer {
  getMIMETypeFromContent(request) {
    if (request instanceof Ci.nsIChannel) {
      // JSON View is enabled only for top level loads only.
      if (
        gPrefs.gEnabled &&
        request.loadInfo?.isTopLevelLoad &&
        request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI &&
        getContentDisposition(request) != Ci.nsIChannel.DISPOSITION_ATTACHMENT
      ) {
        // Check the response content type and if it's a valid type
        // such as application/json or application/manifest+json
        // change it to new internal type consumed by JSON View.
        if (/^application\/(?:.+\+)?json$/.test(request.contentType)) {
          return JSON_VIEW_MIME_TYPE;
        }

        // Same idea, but for JSON Lines (one JSON value per line):
        // application/jsonl (the standard type), the text/jsonl,
        // application/jsonlines and application/x-ndjson alternate spellings,
        // or a .jsonl file served without a matching (or without any)
        // content type.
        let isJsonlines =
          /^(?:text\/jsonl|application\/(?:jsonl|jsonlines|x-ndjson))$/.test(
            request.contentType
          );
        if (!isJsonlines) {
          try {
            isJsonlines =
              request.URI.QueryInterface(
                Ci.nsIURL
              ).fileExtension.toLowerCase() === "jsonl";
          } catch (ex) {
            // The URI scheme doesn't support nsIURL (e.g. some data: URIs).
          }
        }
        if (isJsonlines) {
          return JSONLINES_VIEW_MIME_TYPE;
        }
      } else if (request.contentType === JSON_VIEW_MIME_TYPE) {
        return "application/json";
      } else if (request.contentType === JSONLINES_VIEW_MIME_TYPE) {
        return "application/jsonl";
      }
    }

    return "";
  }
}

Sniffer.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsIContentSniffer",
]);
