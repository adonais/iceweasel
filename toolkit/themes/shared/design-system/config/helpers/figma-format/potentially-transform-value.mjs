/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const potentiallyTransformValue = (token, value) => {
  // We convert number strings without units to numbers and since Figma's
  // spaces everything in pixels, we convert pixel values to numbers too
  const numberOrPxRegex = /^-?\d*\.?\d+(px)?$/;
  if (typeof value === "string" && numberOrPxRegex.test(value)) {
    const numberValue = parseFloat(value);
    if (isNaN(numberValue)) {
      throw new Error(`Failed to parse value: ${value}`);
    }
    return numberValue;
  }
  // Figma expects opacity values to be in the range of 0-100
  if (
    typeof value === "number" &&
    value >= 0 &&
    value <= 1 &&
    token.path.includes("opacity")
  ) {
    return Math.round(value * 100);
  }
  return value;
};
