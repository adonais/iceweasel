/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_SHADOW = {
  x: "0",
  y: "0",
  blur: "0",
  spread: "0",
  color: "transparent",
};

/**
 * Parses a CSS box-shadow string and returns an array of shadow objects.
 *
 * @param {string} input - The box-shadow string to parse. Must be a valid CSS box-shadow value.
 * @returns {Array<object>} An array of objects representing the parsed box-shadow values.
 * @throws {Error} Throws an error if the input is not a string or if the box-shadow syntax is invalid.
 */
export const parseBoxShadow = input => {
  if (typeof input !== "string") {
    throw new Error("Input must be a string");
  }
  // Regex to split multiple box-shadow definitions, ignoring commas inside parentheses
  const shadowSplitRegex = /,(?![^(]*\))/;
  // Regex to match individual parts of a box-shadow definition, ignoring spaces inside parentheses
  const shadowPartsRegex = /(?:[^\s()]+|\([^)]*\))+/g;
  // Regex to match valid length values (e.g., px, em, rem, %)
  const lengthValueRegex = /^-?\d*\.?\d+(px|em|rem|%)?$/;

  return input.split(shadowSplitRegex).map(shadow => {
    shadow = shadow.trim();
    const parts = shadow.match(shadowPartsRegex);
    // eslint-disable-next-line no-shadow
    let x, y, blur, spread, color;
    let lengthValues = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (lengthValueRegex.test(part)) {
        lengthValues.push(part);
      } else {
        color = parts.slice(i).join(" ");
        break;
      }
    }

    if (lengthValues.length < 2 || lengthValues.length > 4) {
      throw new Error("Invalid box-shadow syntax");
    }

    [x, y, blur, spread] = lengthValues;

    if (color) {
      const colorParts = color.split(" ");
      if (colorParts.includes("inset")) {
        colorParts.splice(colorParts.indexOf("inset"), 1);
      }
      if (colorParts.includes("outset")) {
        colorParts.splice(colorParts.indexOf("outset"), 1);
      }
      color = colorParts.length ? colorParts.join(" ") : undefined;
    }

    return {
      x: x || DEFAULT_SHADOW.x,
      y: y || DEFAULT_SHADOW.y,
      blur: blur || DEFAULT_SHADOW.blur,
      spread: spread || DEFAULT_SHADOW.spread,
      color: color || DEFAULT_SHADOW.color,
    };
  });
};
