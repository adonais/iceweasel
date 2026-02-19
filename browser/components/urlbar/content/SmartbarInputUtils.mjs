/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MultilineEditor } from "chrome://browser/content/multilineeditor/multiline-editor.mjs";

/**
 * Creates a Smartbar editor element.
 *
 * @param {HTMLInputElement | MultilineEditor} inputElement
 *   The input element to replace.
 * @returns {{
 *   input: MultilineEditor,
 *   editor: object
 * } | null}
 *   An object with the new editor element and the adapter.
 */
export function createEditor(inputElement) {
  if (!inputElement) {
    return null;
  }

  if (inputElement instanceof MultilineEditor) {
    return {
      input: inputElement,
      editor: createEditorAdapter(inputElement),
    };
  }

  const doc = inputElement.ownerDocument;
  const editorElement = /** @type {MultilineEditor} */ (
    doc.createElement("moz-multiline-editor")
  );

  // Copy attributes except those that don’t apply.
  for (const attr of inputElement.attributes) {
    if (attr.name == "type" || attr.name == "value") {
      continue;
    }
    editorElement.setAttribute(attr.name, attr.value);
  }

  editorElement.className = inputElement.className;
  editorElement.id = inputElement.id;
  editorElement.value = inputElement.value ?? "";

  inputElement.replaceWith(editorElement);
  return {
    input: editorElement,
    editor: createEditorAdapter(editorElement),
  };
}

/**
 * Creates an adapter for the Smartbar editor element.
 *
 * @param {MultilineEditor} editorElement
 *   The editor element.
 */
export function createEditorAdapter(editorElement) {
  const getSelectionBounds = () => {
    let start = editorElement.selectionStart ?? 0;
    let end = editorElement.selectionEnd ?? start;
    if (start > end) {
      [start, end] = [end, start];
    }
    return { start, end };
  };

  return {
    get composing() {
      return !!editorElement.composing;
    },
    selection: {
      get rangeCount() {
        const { start, end } = getSelectionBounds();
        return start === end && editorElement.value === "" ? 0 : 1;
      },
      toStringWithFormat() {
        const { start, end } = getSelectionBounds();
        if (start == null || end == null) {
          return "";
        }
        return editorElement.value?.substring(start, end);
      },
    },
  };
}
