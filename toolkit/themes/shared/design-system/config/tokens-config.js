/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const fs = require("node:fs");
const path = require("node:path");
const StyleDictionary = require("style-dictionary");
const { createPropertyFormatter } = StyleDictionary.formatHelpers;
const figmaConfig = require("./figma-tokens-config");
const { OVERRIDE_IDENTIFIERS } = require("./override-identifiers");

const PURPOSE = {
  SEMANTIC: "semantic",
  STORYBOOK: "storybook",
};

/**
 * @typedef {object[]} TokenCategories
 * @property {string} name - A name used to group tokens into a category for storybook/stylelint to reference.
 * @property {string[]} alternateNames - Names not matching standard token naming conventions (e.g. "width" instead of "size").
 * @property {string[]} purposes - What the token category is used for, either semantic tokens used by stylelint or tokens to be demonstrated in storybook.
 */
const TOKEN_CATEGORIES = [
  {
    name: "table-background",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    name: "table-border",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    name: "table-header",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    name: "background-color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "text-color",
    alternateNames: ["link-color"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "border-color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "border-radius",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "border-width",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "border",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "outline-color",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    name: "outline-radius",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    name: "outline-width",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    name: "outline-offset",
    alternateNames: ["outline-inset"],
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    name: "outline",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "focus-outline",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    name: "box-shadow",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "font-size",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "font-weight",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "icon-size",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "icon-color",
    alternateNames: ["fill", "stroke"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "size",
    alternateNames: ["height", "width"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "space",
    alternateNames: ["padding", "margin"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "dimension",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "opacity",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    name: "color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
];

const getTokenSections = () => {
  const fileNames = fs.readdirSync(
    path.join(__dirname, "../src/tokens/components/")
  );

  const componentSections = fileNames.reduce((components, fileName) => {
    const componentName = fileName.replace(".tokens.json", "");
    return {
      ...components,
      [componentName]: componentName,
    };
  }, {});

  const baseSections = TOKEN_CATEGORIES.filter(category =>
    category.purposes.includes(PURPOSE.SEMANTIC)
  ).reduce((sections, category) => {
    return {
      ...sections,
      [category.name]: category.name,
    };
  }, {});

  const allSections = {
    ...baseSections,
    ...componentSections,
  };

  return Object.fromEntries(
    Object.keys(allSections)
      .sort()
      .map(key => [key, allSections[key]])
  );
};

const TSHIRT_ORDER = [
  "circle",
  "xxxsmall",
  "xxsmall",
  "xsmall",
  "small",
  "medium",
  "large",
  "xlarge",
  "xxlarge",
  "xxxlarge",
];

const STATE_ORDER = [
  "base",
  "default",
  "root",
  "hover",
  "active",
  "focus",
  "disabled",
];

const getLayerString = () => {
  const defaultLayers = [
    "tokens-foundation",
    "tokens-prefers-contrast",
    "tokens-forced-colors",
  ];

  const layersWithOverrides = defaultLayers.flatMap(layer => [
    layer,
    ...OVERRIDE_IDENTIFIERS.map(({ name }) => `${layer}-${name}`),
  ]);

  return `@layer ${layersWithOverrides.join(", ").trim()};\n\n`;
};

/**
 * Adds the Mozilla Public License header in one comment and
 * how to make changes in the generated output files via the
 * *.tokens.json file in another comment. Also imports
 * tokens-shared.css when applicable.
 *
 * @param {string} surface
 *  Desktop surface, either "brand" or "platform". Determines
 *  whether or not we need to import tokens-shared.css.
 * @returns {string} Formatted comment header string
 */
let customFileHeader = ({ surface, platform }) => {
  let licenseString = [
    "/* This Source Code Form is subject to the terms of the Mozilla Public",
    " * License, v. 2.0. If a copy of the MPL was not distributed with this",
    " * file, You can obtain one at http://mozilla.org/MPL/2.0/. */",
  ].join("\n");

  let commentString = [
    "/* DO NOT EDIT this file directly, instead modify the relevant *.tokens.json file",
    " * and run `npm run build` to see your changes. */",
  ].join("\n");

  let cssImport = surface
    ? `@import url("chrome://global/skin/design-system/tokens-shared.css");\n\n`
    : "";
  let layerString = !surface && !platform ? getLayerString() : "";

  return [
    licenseString + "\n\n" + commentString + "\n\n" + cssImport + layerString,
  ];
};

const NEST_MEDIA_QUERIES_COMMENT = `/* Bug 1879900: Can't nest media queries inside of :host, :root selector
   until Bug 1879349 lands */`;

const MEDIA_QUERY_PROPERTY_MAP = {
  "forced-colors": "forcedColors",
  "prefers-contrast": "prefersContrast",
};

function formatBaseTokenNames(str) {
  let formattedName = str.replaceAll(
    /(?<tokenName>\w+)-base(?=\b)/g,
    "$<tokenName>"
  );

  OVERRIDE_IDENTIFIERS.forEach(({ name }) => {
    formattedName = formattedName.replaceAll(`-${name}`, "");
  });

  return formattedName;
}

/**
 * Creates a surface-specific formatter. The formatter is used to build
 * our different CSS files, including "prefers-contrast" and "forced-colors"
 * media queries. See more at
 * https://amzn.github.io/style-dictionary/#/formats?id=formatter
 *
 * @param {string} surface
 *  Which desktop area we are generating CSS for.
 *  Either "brand" (i.e. in-content) or "platform" (i.e. chrome).
 * @returns {Function} - Formatter function that returns a CSS string.
 */
const createDesktopFormat = surface => args => {
  let contents =
    customFileHeader({ surface }) +
    formatTokens({
      surface,
      args,
    }) +
    formatTokens({
      mediaQuery: "prefers-contrast",
      surface,
      args,
    }) +
    formatTokens({
      mediaQuery: "forced-colors",
      surface,
      args,
    });

  OVERRIDE_IDENTIFIERS.forEach(({ name, pref }) => {
    const overrideContents =
      formatTokens({
        surface,
        args,
        overrideIdentifier: name,
      }) +
      formatTokens({
        mediaQuery: "prefers-contrast",
        surface,
        args,
        overrideIdentifier: name,
      }) +
      formatTokens({
        mediaQuery: "forced-colors",
        surface,
        args,
        overrideIdentifier: name,
      });

    if (!overrideContents) {
      return;
    }

    contents += `
/* stylelint-disable-next-line media-query-no-invalid */
@media -moz-pref("${pref}") {
${overrideContents}
}`;
  });

  return contents;
};

/**
 * Formats a subset of tokens into CSS. Wraps token CSS in a media query when
 * applicable.
 *
 * @param {object} tokenArgs
 * @param {string} [tokenArgs.mediaQuery]
 *  Media query formatted CSS should be wrapped in. This is used
 *  to determine what property we are parsing from the token values.
 * @param {string} [tokenArgs.surface]
 *  Specifies a desktop surface, either "brand" or "platform".
 * @param {string} [tokenArgs.overrideIdentifier=""]
 *  Separates base/default tokens from overrides.
 * @param {object} tokenArgs.args
 *  Formatter arguments provided by style-dictionary. See more at
 *  https://amzn.github.io/style-dictionary/#/formats?id=formatter
 * @returns {string} Tokens formatted into a CSS string.
 */
function formatTokens({ mediaQuery, surface, args, overrideIdentifier }) {
  let prop = MEDIA_QUERY_PROPERTY_MAP[mediaQuery] ?? "default";
  let dictionary = Object.assign({}, args.dictionary);
  let tokens = [];

  dictionary.allTokens.forEach(token => {
    // Skip any tokens that belong to a set of overrides.
    if (
      !overrideIdentifier &&
      (OVERRIDE_IDENTIFIERS.some(({ name }) =>
        token.name.includes(`-${name}-`)
      ) ||
        token.override)
    ) {
      return;
    }

    // Ignore base/default tokens if a set of overrides is specified.
    if (overrideIdentifier && !token.name.includes(`-${overrideIdentifier}-`)) {
      return;
    }

    let originalVal = getOriginalTokenValue(token, prop, surface);
    if (originalVal != undefined) {
      let formattedToken = transformToken(
        token,
        originalVal,
        dictionary,
        surface
      );
      tokens.push(formattedToken);
    }
  });

  if (!tokens.length) {
    return "";
  }

  dictionary.allTokens = dictionary.allProperties = tokens;
  let indentation = mediaQuery ? "      " : "    ";
  if (overrideIdentifier) {
    indentation += "  ";
  }

  let formattedVars = formatVariables({
    format: "css",
    dictionary,
    outputReferences: args.options.outputReferences,
    formatting: {
      indentation,
    },
  });

  let layer = `tokens-${mediaQuery ?? "foundation"}${overrideIdentifier ? `-${overrideIdentifier}` : ""}`;
  // Weird spacing below is unfortunately necessary for formatting the built CSS.
  if (mediaQuery) {
    return `
${NEST_MEDIA_QUERIES_COMMENT}
@layer ${layer} {
  @media (${mediaQuery}) {
    :root,
    :host(.anonymous-content-host) {
${formattedVars}
    }
  }
}
`;
  }

  return `@layer ${layer} {
  :root,
  :host(.anonymous-content-host) {
${formattedVars}
  }
}
`;
}

/**
 * Finds the original value of a token for a given media query and surface.
 *
 * @param {object} token - Token object parsed by style-dictionary.
 * @param {string} prop - Name of the property we're querying for.
 * @param {string} surface
 *  The desktop surface we're generating CSS for, either "brand" or "platform".
 * @returns {string} The original token value based on our parameters.
 */
function getOriginalTokenValue(token, prop, surface) {
  if (surface) {
    return token.original.value[surface]?.[prop];
  } else if (prop == "default" && typeof token.original.value != "object") {
    return token.original.value;
  }
  return token.original.value?.[prop];
}

/**
 * Updates a token's value to the relevant original value after resolving
 * variable references. Also checks for surface specific comments.
 *
 * @param {object} token - Token object parsed from JSON by style-dictionary.
 * @param {string} originalVal
 *  Original value of the token for the combination of surface and media query.
 * @param {object} dictionary
 *  Object of transformed tokens and helper fns provided by style-dictionary.
 * @param {string} surface
 *  The desktop surface we're generating CSS for, either "brand", "platform",
 *  or "shared".
 * @returns {object} Token object with an updated value.
 */
function transformToken(token, originalVal, dictionary, surface) {
  let value = originalVal;
  if (dictionary.usesReference(value)) {
    dictionary.getReferences(value).forEach(ref => {
      value = value.replace(`{${ref.path.join(".")}}`, `var(--${ref.name})`);
    });
  }
  let surfaceComment = token.original?.value[surface]?.comment;
  return { ...token, value, comment: surfaceComment ?? token.comment };
}

/**
 * Creates a light-dark transform that works for a given surface. Registers
 * the transform with style-dictionary and returns the transform's name.
 *
 * @param {string} surface
 *  The desktop surface we're generating CSS for, either "brand", "platform",
 *  or "shared".
 * @returns {string} Name of the transform that was registered.
 */
const createLightDarkTransform = surface => {
  let name = `lightDarkTransform/${surface}`;

  // Matcher function for determining if a token's value needs to undergo
  // a light-dark transform.
  let matcher = token => {
    if (surface != "shared") {
      return (
        token.original.value[surface]?.light &&
        token.original.value[surface]?.dark
      );
    }
    return token.original.value.light && token.original.value.dark;
  };

  // Function that uses the token's original value to create a new "default"
  // light-dark value and updates the original value object.
  let transformer = token => {
    if (surface != "shared") {
      let lightDarkVal = `light-dark(${token.original.value[surface].light}, ${token.original.value[surface].dark})`;
      token.original.value[surface].default = lightDarkVal;
      return token.value;
    }
    let value = `light-dark(${token.original.value.light}, ${token.original.value.dark})`;
    token.original.value.default = value;
    return value;
  };

  StyleDictionary.registerTransform({
    type: "value",
    transitive: true,
    name,
    matcher,
    transformer,
  });

  return name;
};

/**
 * Format the tokens dictionary to a string. This mostly defers to
 * StyleDictionary.createPropertyFormatter but first it sorts the tokens based
 * on the groupings in TOKEN_SECTIONS and adds comment headers to CSS output.
 *
 * @param {object} options
 *  Options for tokens to format.
 * @param {string} options.format
 *  The format to output. Supported: "css"
 * @param {object} options.dictionary
 *  The tokens dictionary.
 * @param {string} options.outputReferences
 *  Whether to output variable references.
 * @param {object} options.formatting
 *  The formatting settings to be passed to createPropertyFormatter.
 * @returns {string} The formatted tokens.
 */
function formatVariables({ format, dictionary, outputReferences, formatting }) {
  let lastSection = [];
  let propertyFormatter = createPropertyFormatter({
    outputReferences,
    dictionary,
    format,
    formatting,
  });

  let outputParts = [];
  let remainingTokens = [...dictionary.allTokens];
  let isFirst = true;

  function tokenParts(name) {
    let lastDash = name.lastIndexOf("-");
    let suffix = name.substring(lastDash + 1);
    if (TSHIRT_ORDER.includes(suffix) || STATE_ORDER.includes(suffix)) {
      return [name.substring(0, lastDash), suffix];
    }
    return [name, ""];
  }

  for (let [label, selector] of Object.entries(getTokenSections())) {
    let sectionMatchers = Array.isArray(selector) ? selector : [selector];
    let sectionParts = [];

    remainingTokens = remainingTokens.filter(token => {
      if (
        sectionMatchers.some(m =>
          m.test
            ? m.test(token.name)
            : token.name.startsWith(`${m}-`) || token.name === m
        )
      ) {
        sectionParts.push(token);
        return false;
      }
      return true;
    });

    if (sectionParts.length) {
      sectionParts.sort((a, b) => {
        let aName = formatBaseTokenNames(a.name);
        let bName = formatBaseTokenNames(b.name);
        let [aToken, aSuffix] = tokenParts(aName);
        let [bToken, bSuffix] = tokenParts(bName);
        if (aSuffix || bSuffix) {
          if (aToken == bToken) {
            let aSize = TSHIRT_ORDER.indexOf(aSuffix);
            let bSize = TSHIRT_ORDER.indexOf(bSuffix);
            if (aSize != -1 && bSize != -1) {
              return aSize - bSize;
            }
            let aState = STATE_ORDER.indexOf(aSuffix);
            let bState = STATE_ORDER.indexOf(bSuffix);
            if (aState != -1 && bState != -1) {
              return aState - bState;
            }
          }
        }
        return aToken.localeCompare(bToken, undefined, { numeric: true });
      });

      let headingParts = [];
      if (!isFirst) {
        headingParts.push("");
      }
      isFirst = false;

      let sectionLevel = "**";
      let labelParts = label.split("/");
      for (let i = 0; i < labelParts.length; i++) {
        if (labelParts[i] != lastSection[i]) {
          headingParts.push(
            `${formatting.indentation}/${sectionLevel} ${labelParts[i]} ${sectionLevel}/`
          );
        }
        sectionLevel += "*";
      }
      lastSection = labelParts;

      outputParts = outputParts.concat(
        headingParts.concat(sectionParts.map(propertyFormatter))
      );
    }
  }

  return formatBaseTokenNames(outputParts.join("\n"));
}

// Easy way to grab variable values later for display.
let variableLookupTable = {};

function tokensTableFormat(args, isSemanticTable = false) {
  let dictionary = Object.assign({}, args.dictionary);
  let resolvedTokens = dictionary.allTokens
    // Exclude override tokens from stylelint/storybook token tables.
    .filter(
      token =>
        !token.override &&
        !OVERRIDE_IDENTIFIERS.some(({ name }) =>
          token.name.includes(`-${name}-`)
        )
    )
    .map(token => {
      let tokenVal = resolveReferences(dictionary, token.original);
      return {
        name: token.name,
        ...tokenVal,
      };
    });
  dictionary.allTokens = dictionary.allProperties = resolvedTokens;

  let parsedData = JSON.parse(
    formatBaseTokenNames(
      StyleDictionary.format["javascript/module-flat"]({
        ...args,
        dictionary,
      })
    )
      .trim()
      .replaceAll(/(^module\.exports\s*=\s*|\;$)/g, "")
  );
  let tokensTable = formatTokensTableData(parsedData, isSemanticTable);

  return `${customFileHeader({ platform: "tokens-table" })}
  export const tokensTable = ${JSON.stringify(tokensTable)};

  export const variableLookupTable = ${JSON.stringify(variableLookupTable)};
  `;
}

function resolveReferences(dictionary, originalVal) {
  let resolvedValues = {};
  Object.entries(originalVal).forEach(([key, value]) => {
    if (typeof value === "object" && value != null) {
      resolvedValues[key] = resolveReferences(dictionary, value);
    } else {
      let resolvedVal = getValueWithReferences(dictionary, value);
      resolvedValues[key] = resolvedVal;
    }
  });
  return resolvedValues;
}

function getValueWithReferences(dictionary, value) {
  let valWithRefs = value;
  if (dictionary.usesReference(value)) {
    dictionary.getReferences(value).forEach(ref => {
      valWithRefs = valWithRefs.replace(
        `{${ref.path.join(".")}}`,
        `var(--${ref.name})`
      );
    });
  }
  return valWithRefs;
}

function formatTokensTableData(tokensData, isSemanticTable = false) {
  let tokensTable = {};
  Object.entries(tokensData).forEach(([key, value]) => {
    variableLookupTable[key] = value;
    let formattedToken = {
      value,
      name: `--${key}`,
    };

    const tableName = getTokenCategoryName(
      key,
      isSemanticTable ? PURPOSE.SEMANTIC : PURPOSE.STORYBOOK
    );

    if (tokensTable[tableName]) {
      tokensTable[tableName].push(formattedToken);
    } else {
      tokensTable[tableName] = [formattedToken];
    }
  });
  return tokensTable;
}

function getTokenCategoryName(tokenName, purpose) {
  // Use the token's name to determine the category it belongs to.
  // e.g. --button-background-color-primary goes to "background-color"
  const matchingCategory = TOKEN_CATEGORIES.find(
    ({ name, alternateNames, purposes }) => {
      if (!purposes.includes(purpose)) {
        return false;
      }

      const matchesAsSegment = n =>
        new RegExp(`(^|-)${n}(-|$)`).test(tokenName);

      return matchesAsSegment(name) || alternateNames?.some(matchesAsSegment);
    }
  );

  if (!matchingCategory) {
    return "uncategorized";
  }

  return matchingCategory.name;
}

function getTokenCategory(filePath) {
  const fileName = path.basename(filePath);
  const tokenCategory = fileName.replace(".tokens.json", "");

  return tokenCategory;
}

module.exports = {
  source: ["src/tokens/**/*.json"],
  format: {
    "css/variables/shared": createDesktopFormat(""),
    "css/variables/brand": createDesktopFormat("brand"),
    "css/variables/platform": createDesktopFormat("platform"),
    // Organize tokens to be consumed by Storybook.
    "javascript/tokens-table": args => tokensTableFormat(args, false),
    // Organize tokens to be used by stylelint rules.
    "javascript/semantic-categories": args => tokensTableFormat(args, true),
    ...figmaConfig.formats,
  },
  parsers: [
    {
      pattern: /\.json$/,
      parse: ({ filePath, contents }) =>
        JSON.parse(`{"${getTokenCategory(filePath)}": ${contents}}`),
    },
  ],
  platforms: {
    css: {
      options: {
        outputReferences: true,
        showFileHeader: false,
      },
      transforms: [
        ...StyleDictionary.transformGroup.css,
        ...["shared", "platform", "brand"].map(createLightDarkTransform),
      ],
      files: [
        {
          destination: "dist/tokens-shared.css",
          format: "css/variables/shared",
        },
        {
          destination: "dist/tokens-brand.css",
          format: "css/variables/brand",
          filter: token =>
            typeof token.original.value == "object" &&
            token.original.value.brand,
        },
        {
          destination: "dist/tokens-platform.css",
          format: "css/variables/platform",
          filter: token =>
            typeof token.original.value == "object" &&
            token.original.value.platform,
        },
      ],
    },
    tables: {
      options: {
        outputReferences: true,
        showFileHeader: false,
      },
      transforms: [
        ...StyleDictionary.transformGroup.css,
        ...["shared", "platform", "brand"].map(createLightDarkTransform),
      ],
      files: [
        {
          destination: "dist/tokens-table.mjs",
          format: "javascript/tokens-table",
        },
        {
          destination: "dist/semantic-categories.mjs",
          format: "javascript/semantic-categories",
        },
      ],
    },
    figma: figmaConfig.platform,
  },
};
