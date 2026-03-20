/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";

// eslint-disable-next-line mozilla/reject-import-system-module-from-non-system
import { ObjectUtils } from "../../../../modules/ObjectUtils.sys.mjs";

function getPath(...args) {
  return join(import.meta.dirname, ...args);
}

const FIGMA_VALUE_MAP = {
  Light: "/light",
  Dark: "/dark",
  HCM: "/forcedColors",
  Value: "",
};
const TOKEN_VALUE_KEYS = new Set(["light", "dark", "forcedColors", "value"]);
const FIGMA_IGNORES = new Set(["focus/outline"]);

function transformValue(val, tokenNames) {
  if (typeof val === "number") {
    // This is intended for opacity which is exported as a number between 0-100...
    // Likely we need to handle other numbers that are px, etc too
    return val / 100;
  }
  if (typeof val !== "string") {
    return val;
  }
  if (val === "rgba(0, 0, 0, 0)") {
    return "transparent";
  }
  let rgbaMatch = val.match(
    /^rgba\((\d?.?\d+), (\d?.?\d+), (\d?.?\d+), (\d?.?\d+)\)$/
  );
  if (rgbaMatch) {
    let [, r, g, b, a] = rgbaMatch;
    if (a !== "0" && a !== "1") {
      a = Math.round(parseFloat(a) * 100) / 100;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  let varMatch = val.match(/^\{(.+)\}$/);
  if (!varMatch) {
    return val;
  }
  let varName = varMatch[1];
  if (varName.includes("/")) {
    let tokenName = varName.replaceAll("/", ".");
    if (!tokenNames.has(tokenName) && tokenNames.has(tokenName + ".@base")) {
      tokenName += ".@base";
    }

    return `{${tokenName}}`;
  }
  // HCM system color keyword like {CanvasText} -> strip braces
  if (varName === "Highlight") {
    return "AccentColor";
  }
  return varName;
}

function getTokenFiles(groups) {
  let files = {};
  for (const group of groups) {
    const tokenFiles = readdirSync(getPath("tokens", group)).filter(path =>
      path.endsWith(".tokens.json")
    );
    for (const file of tokenFiles) {
      const path = getPath("tokens", group, file);
      const [prop, remainder] = file.split(".", 2);
      if (remainder.startsWith("nova")) {
        unlinkSync(path);
        continue;
      }
      files[prop] = path;
    }
  }
  return files;
}

function normalizeFigma(figma, path) {
  if (!figma) {
    return {};
  }
  let vars = {};
  for (const node in figma) {
    if (node in FIGMA_VALUE_MAP) {
      let figmaVar = `${path}${FIGMA_VALUE_MAP[node]}`;
      if (!FIGMA_IGNORES.has(path)) {
        vars[figmaVar] = figma[node];
      }
    }
    let value = figma[node];
    if (!value || typeof value === "string" || typeof value === "number") {
      continue;
    }
    vars = {
      ...vars,
      ...normalizeFigma(figma[node], `${path}/${node}`),
    };
  }
  return vars;
}

function normalizeTokens(tokens, path) {
  let tokenNames = new Set();
  if (!tokens) {
    return tokenNames;
  }
  for (const node in tokens) {
    if (node === "value") {
      tokenNames.add(path);
    }
    let value = tokens[node];
    if (!value || typeof value === "string" || typeof value === "number") {
      continue;
    }
    tokenNames = new Set([
      ...tokenNames,
      ...normalizeTokens(tokens[node], `${path}.${node}`),
    ]);
  }
  return tokenNames;
}

// Main
const FIGMA_GROUPS = ["Surface", "Primitives", "Colors", "Theme"];
const TOKEN_GROUPS = ["base", "components"];
const tokenFiles = getTokenFiles(TOKEN_GROUPS);
const exportData = JSON.parse(
  readFileSync(getPath("nova-export-clean-variables.json"), "utf8")
);
let figmaVars = {};
let localTokenNames = new Set();

for (const group of FIGMA_GROUPS) {
  for (const prop in exportData[group]) {
    figmaVars = {
      ...figmaVars,
      ...normalizeFigma(exportData[group][prop], prop),
    };
  }
}
for (const prop in tokenFiles) {
  localTokenNames = new Set([
    ...localTokenNames,
    ...normalizeTokens(JSON.parse(readFileSync(tokenFiles[prop])), prop),
  ]);
}

function walkUpdateNovaTokens(tokens, vars, tokenNames, path = []) {
  for (const tokenProp in tokens) {
    if (tokenProp === "comment") {
      continue;
    }
    if (tokenProp === "value") {
      let resolvedPath = path.filter(p => p !== "@base").join("/");
      let newValue = {};
      for (const figmaVar in vars) {
        if (figmaVar.startsWith(resolvedPath)) {
          const figmaName = figmaVar.slice(resolvedPath.length + 1);
          const figmaValue = transformValue(vars[figmaVar], tokenNames);
          if (!figmaName) {
            // Exact match, only one value.
            // We actually never hit this, values are set for each from Figma.
            newValue = figmaValue;
            delete vars[figmaVar];
          } else if (TOKEN_VALUE_KEYS.has(figmaName)) {
            // Sometimes comes after, like Light/Dark/HCM.
            newValue[figmaName] = figmaValue;
            delete vars[figmaVar];
          }
        }
      }
      if (Object.keys(newValue).length) {
        if (typeof newValue === "object") {
          let simplified = {};
          if (newValue.light && newValue.light === newValue.dark) {
            simplified.default = newValue.light;
          } else {
            simplified.light = newValue.light;
            simplified.dark = newValue.dark;
          }
          if (newValue.forcedColors) {
            if (
              !simplified.default ||
              newValue.forcedColors !== simplified.default
            ) {
              simplified.forcedColors = newValue.forcedColors;
            }
          }
          if (
            simplified.default !== undefined &&
            Object.keys(simplified).length === 1
          ) {
            simplified = simplified.default;
          }
          newValue = simplified;
        }
        tokens.value = newValue;
      }
    } else {
      tokens[tokenProp] = walkUpdateNovaTokens(
        tokens[tokenProp],
        vars,
        tokenNames,
        [...path, tokenProp]
      );
    }
  }
  return tokens;
}

function stripUnchangedTokens(modified, original) {
  if (!modified || typeof modified !== "object") {
    return modified;
  }
  let result = {};
  if ("comment" in original) {
    result.comment = original.comment;
  }
  for (let key of Object.keys(modified)) {
    if (key === "value") {
      if (!ObjectUtils.deepEqual(modified.value, original?.value)) {
        result.value = modified.value;
      }
    } else if (key === "comment" || key === "override") {
      continue;
    } else {
      let stripped = stripUnchangedTokens(modified[key], original?.[key]);
      if (stripped !== null) {
        result[key] = stripped;
      }
    }
  }
  let keyCount = Object.keys(result).length;
  if (keyCount === 0 || (keyCount === 1 && "comment" in result)) {
    return null;
  }
  return result;
}

const _tokensFiles = new Map();
function readTokens(filePath) {
  if (!_tokensFiles.has(filePath)) {
    _tokensFiles.set(filePath, JSON.parse(readFileSync(filePath)));
  }
  return _tokensFiles.get(filePath);
}
function updateTokens(filePath, tokens) {
  _tokensFiles.set(filePath, tokens);
}
function writeTokens() {
  for (let [filePath, tokens] of _tokensFiles.entries()) {
    let original = JSON.parse(readFileSync(filePath));
    let novaPath = filePath.replace(".tokens.", ".nova.tokens.");
    let stripped = stripUnchangedTokens(tokens, original);
    if (!stripped) {
      if (existsSync(novaPath)) {
        unlinkSync(novaPath);
      }
    } else {
      writeFileSync(novaPath, JSON.stringify(stripped, null, 2) + "\n");
    }
  }
}

function updateNovaTokens(filePath, prop, vars, tokenNames) {
  let tokens = readTokens(filePath);

  tokens = walkUpdateNovaTokens(tokens, vars, tokenNames, [prop]);
  updateTokens(filePath, tokens);
}

for (const prop in tokenFiles) {
  updateNovaTokens(tokenFiles[prop], prop, figmaVars, localTokenNames);
}
writeTokens();

// eslint-disable-next-line no-console
console.log("Remaining Figma vars:", figmaVars);
