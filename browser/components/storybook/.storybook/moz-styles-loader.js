/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains a webpack loader which rewrites JS source files to use
 * CSS imports when running in Storybook. This allows JS files loaded in
 * Storybook to use chrome:// and moz-src:/// URIs when loading external
 * stylesheets without having to worry about Storybook being able to find and
 * detect changes to the files.
 *
 * It handles two different styles of loading stylesheets found in this
 * codebase:
 *
 * 1. CSS module scripts, i.e. code like this:
 *
 *    import styles from "chrome://global/content/elements/moz-toggle.css" with { type: "css" };
 *    ...
 *    static styles = styles;
 *
 * Gets rewritten to this, so that the CSS module script's `with { type: "css"
 * }` import attribute (which webpack doesn't understand) is replaced with a
 * resourceQuery that our custom webpack rule in main.js uses to run the file
 * through css-loader's `exportType: "css-style-sheet"`, which produces the
 * same kind of CSSStyleSheet default export that a real CSS module script
 * would:
 *
 *    import styles from "toolkit/content/widgets/moz-toggle/moz-toggle.css?css-module";
 *    ...
 *    static styles = styles;
 *
 * 2. The older interim FOUC workaround, i.e. Lit-based custom element code
 *    like this:
 *
 *    render() {
 *      return html`
 *        <link rel="stylesheet" href="chrome://global/content/elements/moz-toggle.css" />
 *        ...
 *      `;
 *    }
 *
 * By rewriting the source to this:
 *
 *    import moztoggleStyles from "toolkit/content/widgets/moz-toggle/moz-toggle.css";
 *    ...
 *    render() {
 *      return html`
 *        <link rel="stylesheet" href=${moztoggleStyles} />
 *        ...
 *      `;
 *    }
 *
 * It works similarly for vanilla JS custom elements that utilize template
 * strings. The following code:
 *
 *    static get markup() {
 *      return`
 *        <template>
 *          <link rel="stylesheet" href="chrome://browser/skin/migration/migration-wizard.css">
 *          ...
 *        </template>
 *      `;
 *    }
 *
 * Gets rewritten to:
 *
 *    import migrationwizardStyles from "browser/themes/shared/migration/migration-wizard.css";
 *    ...
 *    static get markup() {
 *      return`
 *        <template>
 *          <link rel="stylesheet" href=${migrationwizardStyles}>
 *          ...
 *        </template>
 *      `;
 *    }
 *
 * For moz-src:/// URIs the path is resolved relative to the importing file:
 *
 *    render() {
 *      return html`
 *        <link rel="stylesheet" href="moz-src:///third_party/js/prosemirror/prosemirror-view/style/prosemirror.css" />
 *        ...
 *      `;
 *    }
 *
 * Gets rewritten to:
 *
 *    import prosemirrorStyles from "../../../../third_party/js/prosemirror/prosemirror-view/style/prosemirror.css";
 *    ...
 *    render() {
 *      return html`
 *        <link rel="stylesheet" href=${prosemirrorStyles} />
 *        ...
 *      `;
 *    }
 */

const path = require("path");
const projectRoot = path.resolve(__dirname, "../../../../");
const { rewriteChromeUri, rewriteMozSrcUri } = require("./moz-uri-utils.js");

/**
 * Return an array of the unique chrome:// and moz-src:/// CSS URIs referenced in this file.
 *
 * @param {string} source - The source file to scan.
 * @returns {string[]} Unique list of chrome:// and moz-src:/// CSS URIs
 */
function getReferencedCssUris(source) {
  const cssRegexes = [/chrome:\/\/.*?\.css/g, /moz-src:\/\/\/.*?\.css/g];
  const matches = new Set();
  for (let regex of cssRegexes) {
    for (let match of source.matchAll(regex)) {
      // Add the full URI to the set of matches.
      matches.add(match[0]);
    }
  }
  return [...matches];
}

/**
 * Resolve a CSS URI to a local path and its absolute dependency path.
 *
 * @param {string} cssUri - The CSS URI to resolve.
 * @param {string} resourcePath - The path of the file.
 * @returns {{localPath: string, dependencyPath: string}} The local relative path and absolute dependency path.
 */
function resolveCssUri(cssUri, resourcePath) {
  let localPath = "";
  let dependencyPath = "";

  if (cssUri.startsWith("chrome://")) {
    localPath = rewriteChromeUri(cssUri);
    if (localPath) {
      dependencyPath = path.join(projectRoot, localPath);
    }
  }
  if (cssUri.startsWith("moz-src:///")) {
    const absolutePath = rewriteMozSrcUri(cssUri);
    if (absolutePath) {
      localPath = path.relative(path.dirname(resourcePath), absolutePath);
      // Ensure the path is treated as a relative file and not a package when imported.
      if (!localPath.startsWith(".")) {
        localPath = `./${localPath}`;
      }
      dependencyPath = absolutePath;
    }
  }

  return { localPath, dependencyPath };
}

/**
 * Matches a CSS module script import statement, e.g.:
 *   import styles from "chrome://global/content/elements/moz-toggle.css" with { type: "css" };
 */
const CSS_MODULE_SCRIPT_IMPORT_REGEX =
  /import\s+\S+\s+from\s+["'](chrome:\/\/[^"']+?\.css|moz-src:\/\/\/[^"']+?\.css)["']\s+with\s*{\s*type:\s*["']css["']\s*,?\s*}\s*;?/g;

/**
 * Rewrite CSS module script imports (`import styles from "chrome://..." with
 * { type: "css" };`) to import the same file via a `?css-module`
 * resourceQuery instead, which our custom webpack rule in main.js recognizes
 * and runs through css-loader's `exportType: "css-style-sheet"` so the
 * default export is still a CSSStyleSheet, matching real CSS module script
 * behavior. Returns the rewritten source and the set of URIs it handled, so
 * the caller doesn't also try to rewrite them as `<link>`-style references.
 *
 * @this {WebpackLoader} https://webpack.js.org/api/loaders/
 * @param {string} source - The source file to update.
 * @returns {{ source: string, handledUris: Set<string> }}
 */
function rewriteCssModuleScriptImports(source) {
  const handledUris = new Set();
  const rewrittenSource = source.replace(
    CSS_MODULE_SCRIPT_IMPORT_REGEX,
    (statement, cssUri) => {
      const { localPath, dependencyPath } = resolveCssUri(
        cssUri,
        this.resourcePath
      );
      if (!localPath) {
        return statement;
      }
      handledUris.add(cssUri);
      this.addMissingDependency(dependencyPath);
      return statement
        .replace(cssUri, `${localPath}?css-module`)
        .replace(/\s+with\s*{\s*type:\s*["']css["']\s*,?\s*}/, "");
    }
  );
  return { source: rewrittenSource, handledUris };
}

/**
 * Replace references to chrome:// and moz-src:/// URIs with the relative path
 * on disk from the project root.
 *
 * @this {WebpackLoader} https://webpack.js.org/api/loaders/
 * @param {string} source - The source file to update.
 * @returns {string} The updated source.
 */
async function rewriteCssUris(source) {
  const { source: sourceAfterModuleScripts, handledUris } =
    rewriteCssModuleScriptImports.call(this, source);

  const cssUriToLocalPath = new Map();
  // We're going to rewrite the remaining chrome:// and moz-src:/// URIs
  // (i.e. ones used via the older `<link>`-based approach), find all
  // referenced URIs.
  let cssDependencies = getReferencedCssUris(sourceAfterModuleScripts).filter(
    cssUri => !handledUris.has(cssUri)
  );
  for (let cssUri of cssDependencies) {
    const { localPath, dependencyPath } = resolveCssUri(
      cssUri,
      this.resourcePath
    );
    if (localPath) {
      // Store the mapping to a local path for this URI.
      cssUriToLocalPath.set(cssUri, localPath);
      // Tell webpack the file being handled depends on the referenced file.
      this.addMissingDependency(dependencyPath);
    }
  }
  // Rewrite the source file with mapped chrome:// and moz-src:/// URIs.
  let rewrittenSource = sourceAfterModuleScripts;
  for (let [cssUri, localPath] of cssUriToLocalPath.entries()) {
    // Generate an import friendly variable name for the default export from
    // the CSS file e.g. __chrome_styles_loader__moztoggleStyles.
    let cssImport = `__chrome_styles_loader__${path
      .basename(localPath, ".css")
      .replaceAll("-", "")}Styles`;

    // Handle special cases where we don't use a template.
    if (
      ["moz-label.mjs", "panel-list.mjs"].includes(
        path.basename(this.resourcePath)
      ) ||
      this.resourcePath.endsWith(".js")
    ) {
      rewrittenSource = rewrittenSource.replaceAll(`"${cssUri}"`, cssImport);
    } else {
      rewrittenSource = rewrittenSource.replaceAll(
        cssUri,
        `\$\{${cssImport}\}`
      );
    }

    // Add a CSS import statement as the first line in the file.
    rewrittenSource =
      `import ${cssImport} from "${localPath}";\n` + rewrittenSource;
  }
  return rewrittenSource;
}

/**
 * The WebpackLoader export. Runs async since apparently that's preferred.
 *
 * @param {string} source - The source to rewrite.
 * @param {Map} sourceMap - Source map data, unused.
 * @param {object} meta - Metadata, unused.
 */
module.exports = async function mozUriLoader(source) {
  // Get a callback to tell webpack when we're done.
  const callback = this.async();
  // Rewrite the source async since that appears to be preferred (and will be
  // necessary once we support rewriting CSS/SVG/etc).
  const newSource = await rewriteCssUris.call(this, source);
  // Give webpack the rewritten content.
  callback(null, newSource);
};
