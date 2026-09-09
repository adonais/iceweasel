/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import process from "node:process";

import {
  computeNovaValues,
  FIGMA_GROUPS,
  IMPORTED_VARIABLES_FILENAME,
} from "./figma-import.mjs";

const DEFAULT_FILE_KEY = "Co6vXnF5SiQMcJ7UoJvZX6";
const ALL_VARIABLES_FILENAME = "figma-variables-all.json";
const FIGMA_API = "https://api.figma.com/v1";

function joinRelativePath(...args) {
  return join(import.meta.dirname, ...args);
}

function die(message) {
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
}

// Flags forwarded from `mach buildtokens` after `--`. By default we import from
// the committed `figma-variables-all.json` on disk (no network or token needed);
// `--remote` fetches a fresh export from the Figma API first. `--match=<substr>`
// (repeatable) restricts the import to changed tokens whose path contains the
// substring; `--all` imports every change without prompting. With neither, we
// open an editor to review the changed tokens (unless stdin isn't a TTY).
const matchFilters = [];
let importAll = false;
let useRemote = false;
for (const arg of process.argv.slice(2)) {
  if (arg === "--all") {
    importAll = true;
  } else if (arg === "--remote") {
    useRemote = true;
  } else if (arg.startsWith("--match=")) {
    matchFilters.push(arg.slice("--match=".length));
  } else if (arg === "--match") {
    die("--match requires a value, e.g. --match=color/accent");
  } else {
    die(`Unknown argument: ${arg}`);
  }
}
const outputPath = joinRelativePath(ALL_VARIABLES_FILENAME);

// The REST API's key order (both for collections and for variables inside
// each collection) differs from the Figma plugin that produced the existing
// export. Without this, a refresh produces thousands of lines of purely
// structural churn on top of any real data changes. Walk the existing file
// and reorder the merged output to match, appending anything new at the end of
// its parent object.
function reorderToMatch(fresh, existing) {
  if (
    !fresh ||
    typeof fresh !== "object" ||
    !existing ||
    typeof existing !== "object" ||
    Array.isArray(fresh) ||
    Array.isArray(existing)
  ) {
    return fresh;
  }
  const reordered = {};
  for (const key of Object.keys(existing)) {
    if (key in fresh) {
      reordered[key] = reorderToMatch(fresh[key], existing[key]);
    }
  }
  for (const key of Object.keys(fresh)) {
    if (!(key in reordered)) {
      reordered[key] = fresh[key];
    }
  }
  return reordered;
}

// Fetch the full variable export from the Figma REST API and shape it like the
// Clean Variables To JSON plugin output (collections -> variable path -> modes).
async function fetchFigmaExport() {
  const token = process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN;
  if (!token) {
    die(
      "FIGMA_ACCESS_TOKEN is not set.\n" +
        "Create a Figma personal access token with the `file_variables:read` scope at\n" +
        "https://www.figma.com/developers/api#access-tokens and re-run with:\n" +
        "  FIGMA_ACCESS_TOKEN=figd_... node src/import-figma-variables.mjs --remote\n" +
        "Or omit --remote to import from the committed figma-variables-all.json (no token needed)."
    );
  }

  const fileKey = process.env.FIGMA_FILE_KEY || DEFAULT_FILE_KEY;
  const url = `${FIGMA_API}/files/${fileKey}/variables/local`;

  const response = await fetch(url, {
    headers: { "X-Figma-Token": token },
  });

  if (!response.ok) {
    const body = await response.text();
    die(
      `Figma API request failed (${response.status} ${response.statusText}) for ${url}\n${body}`
    );
  }

  const { meta } = await response.json();
  const { variables, variableCollections } = meta;

  const to255 = c => Math.round(c * 255);
  const toHex = n => n.toString(16).padStart(2, "0").toUpperCase();
  function formatColor({ r, g, b, a }) {
    const R = to255(r);
    const G = to255(g);
    const B = to255(b);
    if (a === 1) {
      return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
    }
    return `rgba(${R}, ${G}, ${B}, ${a})`;
  }

  const VariableAliasError = Symbol("VariableAliasError");

  function formatValue(value) {
    if (value && typeof value === "object") {
      if (value.type === "VARIABLE_ALIAS") {
        const target = variables[value.id];
        if (!target) {
          return VariableAliasError;
        }
        return `{${target.name}}`;
      }
      if ("r" in value) {
        return formatColor(value);
      }
    }
    return value;
  }

  function insertAtPath(tree, pathSegments, leafKey, leafValue) {
    let cursor = tree;
    for (const seg of pathSegments) {
      if (!(seg in cursor) || typeof cursor[seg] !== "object") {
        cursor[seg] = {};
      }
      cursor = cursor[seg];
    }
    cursor[leafKey] = leafValue;
  }

  // Figma allows multiple collections with the same name. Merge them into a
  // single top-level bucket (which is what the Clean Variables To JSON plugin
  // does) so downstream code can address the collection by its display name.
  const fetched = {};
  for (const collection of Object.values(variableCollections)) {
    if (!(collection.name in fetched)) {
      fetched[collection.name] = {};
    }
    const bucket = fetched[collection.name];
    for (const variableId of collection.variableIds) {
      const variable = variables[variableId];
      if (!variable || variable.deletedButReferenced) {
        console.warn(
          `Deleted but referenced variable name=${variable?.name}; skipping.`
        );
        continue;
      }
      const segments = variable.name.split("/");
      for (const mode of collection.modes) {
        const raw = variable.valuesByMode[mode.modeId];
        if (raw === undefined) {
          continue;
        }
        const formatted = formatValue(raw);
        if (formatted === VariableAliasError) {
          // eslint-disable-next-line no-console
          console.warn(
            `Alias target missing for parentName=${variable.name}; aliasId=${raw.id}; skipping.`
          );
          continue;
        }
        if (formatted === undefined) {
          continue;
        }
        insertAtPath(bucket, segments, mode.name, formatted);
      }
    }
  }
  return fetched;
}

// `result` is the full Figma export to import from, and `mirrorOrder` is the
// on-disk key order of `figma-variables-all.json` (used to keep the subset
// stable). By default we read the committed mirror; with `--remote` we fetch a
// fresh export and rewrite the mirror wholesale (reordered against the previous
// file purely to keep its diff small). Nothing is merged into the mirror per
// token; the curated subset the build reads lives in
// `nova-export-clean-variables.json`.
let result;
let mirrorOrder;
if (useRemote) {
  result = await fetchFigmaExport();
  const existing = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, "utf8"))
    : {};
  mirrorOrder = reorderToMatch(result, existing);
  writeFileSync(outputPath, JSON.stringify(mirrorOrder, null, 2) + "\n");
} else {
  if (!existsSync(outputPath)) {
    die(
      `No ${ALL_VARIABLES_FILENAME} to import from. Re-run with \`--remote\` ` +
        "to fetch it from Figma first (requires FIGMA_ACCESS_TOKEN)."
    );
  }
  result = JSON.parse(readFileSync(outputPath, "utf8"));
  mirrorOrder = result;
}

// Where the values came from, surfaced in the run summary so a cached import is
// distinguishable from a live (`--remote`) fetch without checking the command.
const importSource = useRemote
  ? "Figma (remote)"
  : `${ALL_VARIABLES_FILENAME} (cached)`;

// The importable tokens are the ones where the full export would produce a
// different Nova override than the curated subset currently does. Diffing the
// resolved override values (not the raw export) hides no-op changes (e.g. a
// Figma value that still resolves to the base default) and keys them by their
// Nova path (`button/background/color`) rather than by collection and mode.
// Because the baseline is the subset, this covers both fresh fetches and
// re-running against the local mirror to pull in more of an earlier fetch.
const importedPath = joinRelativePath(IMPORTED_VARIABLES_FILENAME);
const imported = existsSync(importedPath)
  ? JSON.parse(readFileSync(importedPath, "utf8"))
  : {};

const oldNova = computeNovaValues(imported);
const newNova = computeNovaValues(result);

const changed = [];
for (const path of new Set([...oldNova.keys(), ...newNova.keys()])) {
  if (JSON.stringify(oldNova.get(path)) !== JSON.stringify(newNova.get(path))) {
    changed.push(path);
  }
}
changed.sort();

if (!changed.length) {
  // eslint-disable-next-line no-console
  console.log(`No token changes to import from ${importSource}.`);
  process.exit(0);
}

function promptForSelection(paths) {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  const dir = mkdtempSync(join(tmpdir(), "figma-tokens-"));
  const file = join(dir, "figma-token-changes.txt");
  const header =
    "# Review the Figma token changes to import.\n" +
    "# Delete the lines for any tokens you do NOT want to import, then save and quit.\n" +
    "# Lines starting with # are ignored.\n\n";
  writeFileSync(file, header + paths.join("\n") + "\n");
  // `EDITOR`/`VISUAL` may include arguments (e.g. `code --wait`), so run through
  // a shell (like git does for `GIT_EDITOR`) rather than treating the whole
  // string as one executable name. The file path is quoted since we control it.
  const editorRun = spawnSync(`${editor} "${file}"`, {
    stdio: "inherit",
    shell: true,
  });
  if (editorRun.error || editorRun.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    die(`Editor (${editor}) exited abnormally; aborting import.`);
  }
  const kept = new Set(
    readFileSync(file, "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
  );
  rmSync(dir, { recursive: true, force: true });
  return paths.filter(path => kept.has(path));
}

let selected;
if (matchFilters.length) {
  selected = changed.filter(path =>
    matchFilters.some(filter => path.includes(filter))
  );
  // eslint-disable-next-line no-console
  console.log(
    `${selected.length} of ${changed.length} changed tokens matched --match.`
  );
} else if (importAll || !process.stdin.isTTY) {
  selected = changed;
} else {
  selected = promptForSelection(changed);
}

if (!selected.length) {
  // eslint-disable-next-line no-console
  console.log("No tokens selected; nothing to import.");
  process.exit(0);
}

function isLeaf(value) {
  return value === null || typeof value !== "object" || Array.isArray(value);
}

function getNode(root, segments) {
  let cursor = root;
  for (const seg of segments) {
    if (isLeaf(cursor) || !(seg in cursor)) {
      return undefined;
    }
    cursor = cursor[seg];
  }
  return cursor;
}

function ensureNode(root, segments) {
  let cursor = root;
  for (const seg of segments) {
    if (isLeaf(cursor[seg])) {
      cursor[seg] = {};
    }
    cursor = cursor[seg];
  }
  return cursor;
}

// A token's own mode values (Light/Dark/HCM/Value) are the leaf keys of its
// node; nested objects are child tokens, which are selected separately.
function hasModeLeaves(node) {
  return !isLeaf(node) && Object.values(node).some(isLeaf);
}

function copyTokenModes(target, source) {
  for (const key of Object.keys(source)) {
    if (isLeaf(source[key])) {
      target[key] = source[key];
    }
  }
}

// Remove a token's mode values at `segments`, then prune any ancestors left
// empty. Child tokens under `segments` are left untouched.
function removeTokenModes(root, segments) {
  const node = getNode(root, segments);
  if (!node || isLeaf(node)) {
    return;
  }
  for (const key of Object.keys(node)) {
    if (isLeaf(node[key])) {
      delete node[key];
    }
  }
  for (let depth = segments.length; depth > 0; depth--) {
    const ancestor = getNode(root, segments.slice(0, depth - 1));
    const key = segments[depth - 1];
    if (
      ancestor &&
      !isLeaf(ancestor[key]) &&
      !Object.keys(ancestor[key]).length
    ) {
      delete ancestor[key];
    } else {
      break;
    }
  }
}

// Update the curated subset. For each selected token, drop its old mode values
// from every group and re-copy them from the export. A resolved Nova path can
// live in more than one group (e.g. Primitives and Components); we mirror it
// into all of them so `buildFigmaVars` in figma-import.mjs resolves the subset
// exactly as it would the full export, with no single-group guess. Copying the
// raw Figma nodes keeps FIGMA_IGNORES/NOVA_STRUCTURAL_OVERRIDES applied at build
// time. A selected token that no longer overrides anything is dropped.
for (const path of selected) {
  const segments = path.split("/");
  for (const group of FIGMA_GROUPS) {
    removeTokenModes(imported, [group, ...segments]);
  }
  if (newNova.has(path)) {
    for (const group of FIGMA_GROUPS) {
      const source = getNode(result, [group, ...segments]);
      if (source && hasModeLeaves(source)) {
        copyTokenModes(ensureNode(imported, [group, ...segments]), source);
      }
    }
  }
}

// Order the subset to match the mirror's on-disk key order (`mirrorOrder`), not
// the raw REST response whose key order differs from how the file is stored.
// Otherwise every token reshuffles on each fetch, burying the real value changes.
const orderedImported = reorderToMatch(imported, mirrorOrder);
writeFileSync(importedPath, JSON.stringify(orderedImported, null, 2) + "\n");

// eslint-disable-next-line no-console
console.log(
  `Applied ${selected.length} of ${changed.length} changed tokens from ${importSource}. ` +
    `Wrote ${importedPath}`
);
