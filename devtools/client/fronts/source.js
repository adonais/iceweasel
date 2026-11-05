/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sourceSpec } = require("resource://devtools/shared/specs/source.js");
const {
  FrontClassWithSpec,
  registerFront,
} = require("resource://devtools/shared/protocol.js");
const {
  ArrayBufferFront,
} = require("resource://devtools/client/fronts/array-buffer.js");

/**
 * A SourceFront provides a way to access the source text of a script.
 *
 * @param client DevToolsClient
 *        The DevTools Client instance.
 * @param form Object
 *        The form sent across the remote debugging protocol.
 */
class SourceFront extends FrontClassWithSpec(sourceSpec) {
  constructor(client, form) {
    super(client);
    if (form) {
      this._url = form.url;
      // this is here for the time being, until the source front is managed
      // via protocol.js marshalling
      this.actorID = form.actor;
    }
  }

  form(json) {
    this._url = json.url;
  }

  get actor() {
    return this.actorID;
  }

  get url() {
    return this._url;
  }

  // Alias for source.blackbox to avoid changing protocol.js packets
  blackBox(range) {
    return this.blackbox(range);
  }

  // Alias for source.unblackbox to avoid changing protocol.js packets
  unblackBox() {
    return this.unblackbox();
  }

  /**
   * Get a source content object from the SourceFront's source (which could be either
   * an ArrayBuffer (for wasm) or LongString (for others).
   */
  async source() {
    const response = await super.source();
    return readSourceResponse(response);
  }
}

/**
 * Read the source returned by a source content request into a plain value.
 *
 * The source is transfered either as an ArrayBuffer front, for wasm binaries,
 * or as a long string front for everything else.
 *
 * @param {object} response
 *        `{ source, contentType }`, as returned by the source actor's `source`
 *        method or by the target actor's `getSourceContentForResource`.
 * @returns {Promise<object>}
 *        The same pair, with `source` being a string, or, for wasm, an object
 *        with a `binary` attribute.
 */
function readSourceResponse(response) {
  const { contentType, source } = response;
  if (source instanceof ArrayBufferFront) {
    return source.slice(0, source.length).then(function (resp) {
      if (resp.error) {
        return resp;
      }
      // Keeping str as a string, ArrayBuffer/Uint8Array will not survive
      // setIn/mergeIn operations.
      const str = atob(resp.encoded);
      const newResponse = {
        source: {
          binary: str,
          toString: () => "[wasm]",
        },
        contentType,
      };
      return newResponse;
    });
  }

  return source.substring(0, source.length).then(function (resp) {
    if (resp.error) {
      return resp;
    }

    const newResponse = {
      source: resp,
      contentType,
    };
    return newResponse;
  });
}

exports.SourceFront = SourceFront;
exports.readSourceResponse = readSourceResponse;
registerFront(SourceFront);
