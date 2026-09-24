/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getTokenSections } from "./get-token-sections.mjs";

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

const tokenParts = token => {
  const [variableName] = token.split(":");
  let lastDash = variableName.lastIndexOf("-");
  let suffix = variableName.substring(lastDash + 1);
  if (TSHIRT_ORDER.includes(suffix) || STATE_ORDER.includes(suffix)) {
    return [variableName.substring(0, lastDash), suffix];
  }
  return [variableName, ""];
};

export const groupAndSortTokens = ({ tokens, componentName }) => {
  const tokenSections = getTokenSections();
  const tokenGroups = Object.keys(tokenSections).reduce(
    (acc, section) => ({ ...acc, [section]: [] }),
    { uncategorized: [] }
  );

  for (const { comment, token } of tokens) {
    const [variableName] = token.split(":");
    const matchingSection = Object.keys(tokenSections).find(
      section =>
        variableName.startsWith(`--${section}-`) ||
        variableName === `--${section}`
    );
    if (matchingSection) {
      tokenGroups[matchingSection].push({ comment, token });
    } else {
      tokenGroups.uncategorized.push({ comment, token });
    }
  }

  let sortedTokens = [];
  for (const [section, sectionTokens] of Object.entries(tokenGroups)) {
    if (!sectionTokens.length) {
      continue;
    }

    if (!componentName) {
      sortedTokens.push({ comment: section, token: "" });
    }
    sortedTokens.push(
      sectionTokens.sort((a, b) => {
        const [aToken, aSuffix] = tokenParts(a.token);
        const [bToken, bSuffix] = tokenParts(b.token);
        if (aSuffix || bSuffix) {
          if (aToken === bToken) {
            const aSize = TSHIRT_ORDER.indexOf(aSuffix);
            const bSize = TSHIRT_ORDER.indexOf(bSuffix);
            if (aSize !== -1 && bSize !== -1) {
              return aSize - bSize;
            }

            const aState = STATE_ORDER.indexOf(aSuffix);
            const bState = STATE_ORDER.indexOf(bSuffix);
            if (aState !== -1 && bState !== -1) {
              return aState - bState;
            }
          }
        }

        return aToken.localeCompare(bToken, undefined, { numeric: true });
      })
    );
  }

  return sortedTokens.flat().map(({ comment, token }) => {
    if (comment && !token) {
      return `\n  /** ${comment} **/`;
    }

    if (comment && token) {
      return `/* ${comment} */\n  ${token}`;
    }

    return token;
  });
};
