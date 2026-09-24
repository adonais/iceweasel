/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, join } from "path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line mozilla/reject-import-system-module-from-non-system
import { ObjectUtils } from "../../../../modules/ObjectUtils.sys.mjs";

function joinRelativePath(...args) {
  return join(import.meta.dirname, ...args);
}

const WIDGETS_PATH = "../../../../content/widgets".split("/");
const BROWSER_THEMES_PATH = "../../../../../browser/themes/shared".split("/");
const TOKEN_DIRS = [
  joinRelativePath("tokens", "base"),
  joinRelativePath("tokens", "components"),
  joinRelativePath(...WIDGETS_PATH),
  joinRelativePath(...BROWSER_THEMES_PATH, "urlbar"),
  joinRelativePath(...BROWSER_THEMES_PATH, "tabbrowser"),
];
const FIGMA_VALUE_MAP = {
  Light: "/light",
  Dark: "/dark",
  HCM: "/forcedColors",
  Value: "",
};
const TOKEN_VALUE_KEYS = new Set(["light", "dark", "forcedColors", "value"]);

function transformValue(val, tokenNames, figmaName) {
  if (typeof val === "number") {
    if (figmaName.includes("opacity")) {
      // This is intended for opacity which is exported as a number between 0-100...
      // Likely we need to handle other numbers that are px, etc too
      return String(val / 100);
    }
    if (figmaName.includes("line/height")) {
      return String(val);
    }
    return val === 0 ? String(val) : `${val}px`;
  }
  if (typeof val !== "string") {
    return val;
  }
  if (/^rgba\(([^,]+, ?){3} ?0(\.0)?\)$/.test(val)) {
    return "transparent";
  }
  if (val === "semibold") {
    return 600;
  }
  if (val === "bold") {
    return 700;
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
  if (val.startsWith("#")) {
    return val.toLowerCase();
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

// Collect the base `*.tokens.json` files keyed by their prop name. By default
// stale generated `*.nova.tokens.json` files are removed so the build can
// regenerate them; pass `{ prune: false }` for a read-only pass (used when
// computing which tokens a Figma import would change).
function getTokenFiles(globalDirs, { prune = true } = {}) {
  let files = {};
  for (const group of globalDirs) {
    const tokenFiles = readdirSync(group, { recursive: true }).filter(path =>
      path.endsWith(".tokens.json")
    );
    for (const file of tokenFiles) {
      const path = join(group, file);
      let [prop, remainder] = basename(file).split(".", 2);
      if (prop.startsWith("moz-")) {
        prop = prop.substring(4);
      }
      if (remainder.startsWith("nova")) {
        if (prune) {
          unlinkSync(path);
        }
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
      vars[figmaVar] = figma[node];
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

export const FIGMA_GROUPS = [
  "Surface",
  "Primitives",
  "Colors",
  "Theme",
  "Components",
];
let localOverrides = {};

function buildFigmaVars(exportData) {
  let figmaVars = {};
  for (const group of FIGMA_GROUPS) {
    for (const prop in exportData[group]) {
      figmaVars = {
        ...figmaVars,
        ...normalizeFigma(exportData[group][prop], prop),
      };
    }
  }
  return figmaVars;
}

function buildTokenNames(tokenFiles) {
  let localTokenNames = new Set();
  for (const prop in tokenFiles) {
    localTokenNames = new Set([
      ...localTokenNames,
      ...normalizeTokens(JSON.parse(readFileSync(tokenFiles[prop])), prop),
    ]);
  }
  return localTokenNames;
}

function matchesFigmaVar(resolvedPath, figmaVar) {
  return (
    // It must start with the same prefix
    figmaVar.startsWith(resolvedPath) &&
    // And match in length
    (resolvedPath.length === figmaVar.length ||
      // Or the next part of the name is another variant
      // i.e. button/color matches button/color/hover
      // i.e. color/neutral/10 does not match color/neutral/100
      figmaVar[resolvedPath.length] === "/")
  );
}

function walkUpdateNovaTokens(tokens, vars, tokenNames, path = []) {
  if (tokens.ignoreFigma) {
    localOverrides[path.join("/")] = tokens;
    return null;
  }

  for (const tokenProp in tokens) {
    if (tokenProp === "comment") {
      continue;
    }
    if (tokenProp === "value") {
      // Skip any tokens that have local Nova overrides in code.
      // This happens when values can't be expressed in Figma or when Figma
      // hasn't been updated to use the correct values yet.
      if (tokens.value.nova) {
        localOverrides[path.join("/")] = tokens.value.nova;
        continue;
      }

      let resolvedPath = path.filter(p => p !== "@base").join("/");
      let newValue = {};
      let { nativeTheme } = tokens.value;
      for (const figmaVar in vars) {
        if (matchesFigmaVar(resolvedPath, figmaVar)) {
          const figmaName = figmaVar.slice(resolvedPath.length + 1);
          const figmaValue = transformValue(
            vars[figmaVar],
            tokenNames,
            resolvedPath
          );
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
          if (nativeTheme) {
            simplified.nativeTheme = nativeTheme;
          }
          if (newValue.light && newValue.light === newValue.dark) {
            simplified.default = newValue.light;
          } else {
            simplified.light = newValue.light;
            simplified.dark = newValue.dark;
          }
          // Tab group HCM is handled in CSS; strip forcedColors for all tab group tokens.
          if (newValue.forcedColors && !resolvedPath.startsWith("tab/group/")) {
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
      try {
        tokens[tokenProp] = walkUpdateNovaTokens(
          tokens[tokenProp],
          vars,
          tokenNames,
          [...path, tokenProp]
        );
      } catch (ex) {
        console.error(`Error process token: ${[...path, tokenProp].join(".")}`);
        throw ex;
      }
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

function collectStrippedValues(node, path, out) {
  if (!node || typeof node !== "object") {
    return;
  }
  for (const key in node) {
    if (key === "comment" || key === "override") {
      continue;
    }
    if (key === "value") {
      const resolvedPath = path.filter(p => p !== "@base").join("/");
      out.set(resolvedPath, JSON.stringify(node.value));
    } else {
      collectStrippedValues(node[key], [...path, key], out);
    }
  }
}

// Compute the Nova override value for every token, keyed by its resolved path
// (e.g. `button/background/color/hover`), for a given figma-variables export
// object. Only tokens that actually override their base value are included,
// mirroring what the build writes to the `*.nova.tokens.json` files. The fetch
// step uses this to show which tokens a Figma import would really change,
// rather than diffing the raw export (which lists no-op changes too).
export function computeNovaValues(exportData) {
  const tokenFiles = getTokenFiles(TOKEN_DIRS, { prune: false });
  const figmaVars = buildFigmaVars(exportData);
  const tokenNames = buildTokenNames(tokenFiles);
  const values = new Map();
  for (const prop in tokenFiles) {
    const original = JSON.parse(readFileSync(tokenFiles[prop]));
    const updated = walkUpdateNovaTokens(
      JSON.parse(JSON.stringify(original)),
      figmaVars,
      tokenNames,
      [prop]
    );
    collectStrippedValues(
      stripUnchangedTokens(updated, original),
      [prop],
      values
    );
  }
  return values;
}

// The curated subset of the Figma export that the build actually imports (same
// collection/mode shape as `figma-variables-all.json`, but only the chosen
// tokens). The build reads this file rather than the full export, so unselected
// token changes are never picked up. The fetch step maintains it;
// `figma-variables-all.json` is only a full mirror it diffs against.
export const IMPORTED_VARIABLES_FILENAME = "nova-export-clean-variables.json";

/**
 * Compare tokens from Figma to tokens defined in code, and
 * write their definitions in files for three cases:
 * - tokens that only exist in Figma
 * - tokens that only exist in code
 * - tokens that are overridden in code due to incorrect values in Figma or limitations in Figma
 *
 * @param {object} figmaTokens
 * @param {object} codeTokens
 */
const writeTokenAuditData = (figmaTokens, codeTokens) => {
  const unusedFigmaTokens = {};
  const codeOnlyTokens = {};
  const codeOverrideTokens = {};

  for (const [tokenName, tokenValue] of Object.entries(figmaTokens)) {
    const normalizedTokenName = tokenName.replace("/@base", "");
    if (!codeTokens[normalizedTokenName]) {
      unusedFigmaTokens[normalizedTokenName] = tokenValue;
    } else {
      codeOverrideTokens[normalizedTokenName] = {
        figma: tokenValue,
        code: codeTokens[normalizedTokenName],
      };
    }
  }

  for (const [tokenName, tokenValue] of Object.entries(codeTokens)) {
    const normalizedTokenName = tokenName.replace("/@base", "");
    if (!figmaTokens[normalizedTokenName]) {
      codeOnlyTokens[normalizedTokenName] = tokenValue;
    }

    const normalizedTokenValue = {
      light: figmaTokens[`${normalizedTokenName}/light`],
      dark: figmaTokens[`${normalizedTokenName}/dark`],
      forcedColors: figmaTokens[`${normalizedTokenName}/forcedColors`],
    };

    if (
      normalizedTokenValue.light ||
      normalizedTokenValue.dark ||
      normalizedTokenValue.forcedColors
    ) {
      codeOverrideTokens[normalizedTokenName] = {
        figma: normalizedTokenValue,
        code: tokenValue,
      };

      delete codeOnlyTokens[normalizedTokenName];
      delete unusedFigmaTokens[`${normalizedTokenName}/light`];
      delete unusedFigmaTokens[`${normalizedTokenName}/dark`];
      delete unusedFigmaTokens[`${normalizedTokenName}/forcedColors`];
    }
  }

  const OUTPUT_PATH = "../dist/token-audit";
  if (!existsSync(joinRelativePath(OUTPUT_PATH))) {
    mkdirSync(joinRelativePath(OUTPUT_PATH));
  }

  writeFileSync(
    joinRelativePath(OUTPUT_PATH, "unused-figma-tokens.json"),
    JSON.stringify(unusedFigmaTokens, null, 2),
    "utf8"
  );
  writeFileSync(
    joinRelativePath(OUTPUT_PATH, "code-only-tokens.json"),
    JSON.stringify(codeOnlyTokens, null, 2),
    "utf8"
  );
  writeFileSync(
    joinRelativePath(OUTPUT_PATH, "code-override-tokens.json"),
    JSON.stringify(codeOverrideTokens, null, 2),
    "utf8"
  );
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const exportData = JSON.parse(
    readFileSync(joinRelativePath(IMPORTED_VARIABLES_FILENAME), "utf8")
  );
  const tokenFiles = getTokenFiles(TOKEN_DIRS);
  const figmaVars = buildFigmaVars(exportData);
  const localTokenNames = buildTokenNames(tokenFiles);

  for (const prop in tokenFiles) {
    updateNovaTokens(tokenFiles[prop], prop, figmaVars, localTokenNames);
  }
  writeTokens();

  writeTokenAuditData(figmaVars, localOverrides);
}
