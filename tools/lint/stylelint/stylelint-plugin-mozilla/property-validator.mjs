/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import valueParser from "postcss-value-parser";
import { getTokensTable } from "./helpers.mjs";

const tokensTable = getTokensTable();

/**
 * Validates whether a given CSS property value complies with allowed design token rules.
 *
 * @class
 * @property {PropertyConfig} config Configuration for the given property.
 */
export class PropertyValidator {
  static GLOBAL_WORDS = new Set([
    "inherit",
    "initial",
    "revert",
    "revert-layer",
    "unset",
  ]);

  /** @type {PropertyConfig} */
  config;
  /** @type {Set<string>} */
  allowedWords;
  /** @type {Set<string>} */
  validTokenNames;
  /** @type {Set<string>} */
  allowedFunctions;
  /** @type {boolean} */
  allowUnits;
  /** @type {Record<string, string>} */
  customFixes;

  constructor(config) {
    this.config = config;
    this.allowedWords = new Set(
      this.config.validTypes
        .flatMap(propType => propType.allow)
        .concat(...PropertyValidator.GLOBAL_WORDS)
    );
    this.validTokenNames = new Set(
      this.config.validTypes.flatMap(propType =>
        (propType.tokenTypes || []).flatMap(tokenType =>
          tokensTable[tokenType].map(token => token.name)
        )
      )
    );
    this.allowedFunctions = new Set(
      this.config.validTypes.flatMap(propType => propType.allowFunctions || [])
    );
    this.allowUnits = this.config.validTypes.some(
      propType => propType.allowUnits
    );
    this.customFixes = this.config.validTypes
      .map(type => type.customFixes)
      .filter(Boolean)
      .reduce((acc, fixes) => ({ ...acc, ...fixes }), {});
  }

  getFixedValue(parsedValue) {
    let hasFixes = false;
    parsedValue.walk(node => {
      if (node.type == "word") {
        const token = this.customFixes[node.value.trim().toLowerCase()];
        if (token) {
          hasFixes = true;
          node.value = token;
        }
      }
    });
    return hasFixes ? parsedValue.toString() : null;
  }

  getFunctionArguments(node) {
    const argGroups = [];
    let currentArg = [];
    for (const part of node.nodes) {
      if (part.type === "div") {
        argGroups.push(currentArg);
        currentArg = [];
      } else {
        currentArg.push(part);
      }
    }
    argGroups.push(currentArg);
    return argGroups;
  }

  isAllowedDiv(value) {
    if (value === ",") {
      return Boolean(this.config.multiple);
    }
    if (value === "/") {
      return Boolean(this.config.slash);
    }
    return false;
  }

  isAllowedFunction(functionType) {
    return this.allowedFunctions.has(functionType);
  }

  isAllowedSpace() {
    return Boolean(this.config.shorthand);
  }

  isAllowedWord(word) {
    if (this.allowUnits && this.isUnit(word)) {
      return true;
    }
    const lowerWord = word.toLowerCase();
    return Array.from(this.allowedWords).some(
      allowed => allowed.toLowerCase() === lowerWord
    );
  }

  isUnit(word) {
    const parsed = valueParser.unit(word);
    return parsed !== false && parsed.unit !== "";
  }

  static isCalcOperand(node) {
    if (node.type === "space") {
      return true;
    }
    if (node.type === "word") {
      return (
        /^[\+\-\*\/]$/.test(node.value) || /^-?\d+(\.\d+)?$/.test(node.value)
      );
    }
    return false;
  }

  isValidCalcFunction(node) {
    return node.nodes.every(
      n => PropertyValidator.isCalcOperand(n) || this.isValidNode(n)
    );
  }

  isValidColorMixFunction(node) {
    // ignore the first argument (color space)
    let [, ...colors] = this.getFunctionArguments(node);
    return colors.every(color =>
      color.every(
        part =>
          part.type == "space" ||
          (part.type == "word" && part.value.endsWith("%")) ||
          this.isValidNode(part)
      )
    );
  }

  isValidFunction(node) {
    switch (node.value) {
      case "var":
        return this.isValidVarFunction(node);
      case "calc":
        return this.isValidCalcFunction(node);
      case "light-dark":
        return this.isValidLightDarkFunction(node);
      case "color-mix":
        return this.isValidColorMixFunction(node);
      default:
        return this.isAllowedFunction(node.value);
    }
  }

  isValidLightDarkFunction(node) {
    return node.nodes.every(n => n.type == "div" || this.isValidNode(n));
  }

  isValidNode(node) {
    switch (node.type) {
      case "space":
        return this.isAllowedSpace();
      case "div":
        return this.isAllowedDiv(node.value);
      case "word":
        return this.isAllowedWord(node.value);
      case "function":
        return this.isValidFunction(node);
      default:
        return false;
    }
  }

  isValidPropertyValue(parsedValue, localVars) {
    this.localVars = localVars;
    return parsedValue.nodes.every(node => this.isValidNode(node));
  }

  isValidToken(tokenName) {
    return this.validTokenNames.has(tokenName);
  }

  getTokenCategories() {
    if (!this._categories) {
      const categories = new Set();
      this.config.validTypes.forEach(propType => {
        if (propType.tokenTypes) {
          propType.tokenTypes.forEach(category => categories.add(category));
        }
      });
      this._categories = Array.from(categories);
    }
    return this._categories;
  }

  isValidVarFunction(node) {
    const [varNameNode, , fallback] = node.nodes;
    const varName = varNameNode.value;
    if (this.isValidToken(varName)) {
      return true;
    }
    const localVar = this.localVars[varName];
    return (
      (localVar &&
        valueParser(localVar).nodes.every(n => this.isValidNode(n))) ||
      (fallback && this.isValidNode(fallback))
    );
  }
}
