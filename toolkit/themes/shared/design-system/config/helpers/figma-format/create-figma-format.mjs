/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { getReferences, usesReferences } from "style-dictionary/utils";
import { attemptPaddingMarginDestructuring } from "./attempt-padding-margin-destructuring.mjs";
import { attemptShadowDestructuring } from "./attempt-shadow-destructuring.mjs";
import { defaultFilter, mergeFilters, overrideFilter } from "./filters.mjs";
import { transformTokenValue } from "./transform-token-value.mjs";
import { getTokenCollection } from "./get-token-collection.mjs";

/**
 * Formats design tokens based on the provided arguments and options.
 *
 * @param {string} collection - The name of the token collection to filter by.
 * @param {string} overrideIdentifier - The name of the set of override tokens to handle separately.
 * @returns {Function} A function that takes an object with `dictionary` and `options` properties
 * and returns a formatted JSON string of the tokens.
 */
export const createFigmaFormat =
  (collection, overrideIdentifier = "") =>
  args => {
    let dictionary = Object.assign({}, args.dictionary);
    let tokens = [];
    const filter = mergeFilters(
      defaultFilter,
      token => overrideFilter(token, overrideIdentifier),
      token => token.attributes?.collection === collection
    );

    dictionary.allTokens.forEach(token => {
      // check whether the base token's collection still applies to the override value
      if (token.attributes?.collection) {
        token.attributes.collection = getTokenCollection(
          token,
          dictionary,
          overrideIdentifier
        );
      }

      let originalVal = token.original.value;
      if (
        overrideIdentifier &&
        token.original.value[overrideIdentifier]?.value
      ) {
        originalVal = token.original.value[overrideIdentifier].value;
      }

      if (originalVal === undefined) {
        throw new Error(
          `[createFigmaFormat] Token ${token.name} has an undefined original value. Please check your tokens.`
        );
      }

      // If the current token references another token that will be destructured,
      // we skip it altogether
      if (usesReferences(originalVal)) {
        const references = getReferences(originalVal, dictionary.tokens);
        if (references.some(ref => ref.attributes.willBeDestructured)) {
          console.warn(
            `[createFigmaFormat] Skipping token ${token.name} because it references a token that will be destructured`
          );
          return;
        }
      }

      // If the token is a CSS box-shadow shorthand, attempt to destructure it
      // into its subtokens and process each subtoken
      const potentialShadowTokens = attemptShadowDestructuring(
        token,
        originalVal
      );
      if (potentialShadowTokens) {
        potentialShadowTokens.forEach(
          ({ token: sToken, originalVal: sOriginalVal }) => {
            // Check if the subtoken should be filtered out
            if (!filter(sToken)) {
              return;
            }
            // Transform the subtoken value and add it to the tokens array
            let formattedToken = transformTokenValue(
              sToken,
              sOriginalVal,
              dictionary,
              overrideIdentifier
            );
            tokens.push(formattedToken);
          }
        );
        return;
      }

      // If the token is a padding/margin shorthand, attempt to destructure it
      const potentialPaddingMarginTokens = attemptPaddingMarginDestructuring(
        token,
        originalVal
      );
      if (potentialPaddingMarginTokens) {
        potentialPaddingMarginTokens.forEach(
          ({ token: sToken, originalVal: sOriginalVal }) => {
            // Check if the subtoken should be filtered out
            if (!filter(sToken)) {
              return;
            }
            // Transform the subtoken value and add it to the tokens array
            let formattedToken = transformTokenValue(
              sToken,
              sOriginalVal,
              dictionary,
              overrideIdentifier
            );
            tokens.push(formattedToken);
          }
        );
        return;
      }

      // Check if the token should be filtered out
      if (!filter(token)) {
        return;
      }

      // Otherwise transform the original token value and add it to the tokens array
      let formattedToken = transformTokenValue(
        token,
        originalVal,
        dictionary,
        overrideIdentifier
      );
      tokens.push(formattedToken);
    });

    if (!tokens.length) {
      return "{}\n";
    }

    dictionary.allTokens = dictionary.allProperties = tokens;
    return (
      "{\n" +
      dictionary.allTokens
        .map(function (token) {
          return `  "${token.name}": ${JSON.stringify(
            args.options.usesDtcg ? token.$value : token.value,
            null,
            2
          ).replace(/\n/g, "\n  ")}`;
        })
        .join(",\n") +
      "\n}" +
      "\n"
    );
  };
