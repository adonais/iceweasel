/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  suggestionsPlugin,
  triggerCharacter,
} from "chrome://browser/content/multilineeditor/prosemirror.bundle.mjs";

/**
 * @typedef {object} SuggestionContext
 * @property {{from: number, to: number}} range - Text range covering the trigger
 * @property {string} text - Current text starting with the trigger character
 * @property {object} view - ProseMirror EditorView
 */

/**
 * Creates a commands plugin: a trigger command character ("/") that opens a
 * suggestion flow
 *
 * @param {object} options - Plugin options
 * @param {string} [options.triggerChar] - Trigger character
 * @param {boolean} [options.allowSpaces] - Allow spaces after the trigger
 * @param {(ctx: SuggestionContext) => void} [options.onEnter] - Trigger character detected
 * @param {(ctx: SuggestionContext) => void} [options.onChange] - Text changed
 * @param {(ctx: SuggestionContext) => void} [options.onExit] - Exit suggestions
 * @param {(ctx: {view: object, event: KeyboardEvent}) => boolean} [options.onKeyDown] - Handle keydown events
 * @returns {object} Plugin bundle
 */
export function createCommandsPlugin(options = {}) {
  const {
    triggerChar = "/",
    allowSpaces = false,
    onEnter,
    onChange,
    onExit,
    onKeyDown,
  } = options;

  return {
    createPlugin: () =>
      suggestionsPlugin({
        matcher: triggerCharacter(triggerChar, { allowSpaces }),
        onEnter,
        onChange,
        onExit,
        onKeyDown,
      }),
  };
}
