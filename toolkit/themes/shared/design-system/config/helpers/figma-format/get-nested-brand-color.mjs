/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Retrieves the nested brand color from a token object. The function traverses
 * the token structure to find and return an object containing `light` and `dark`
 * color values. If the token is a primitive value, it returns the same value
 * for both `light` and `dark`. If no valid color object is found, it returns `undefined`.
 *
 * @param {object|string|number} token - The token object or value to extract the brand color from.
 * @returns {{light: string|number, dark: string|number}|undefined} An object containing `light` and `dark`
 * color values, or `undefined` if no valid color is found.
 */
export const getNestedBrandColor = token => {
  const stack = [token];
  while (stack.length) {
    const node = stack.pop();
    if (typeof node !== "object") {
      return { light: node, dark: node };
    }
    if (typeof node === "object") {
      if (node.light && node.dark) {
        return node;
      }
      if (node.brand) {
        stack.push(node.brand);
      }
      if (node.default) {
        stack.push(node.default);
      }
    }
  }
  return undefined;
};
