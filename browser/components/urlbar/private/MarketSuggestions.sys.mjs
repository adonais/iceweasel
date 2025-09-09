/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "resource:///modules/urlbar/private/RealtimeSuggestProvider.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarSearchUtils: "resource:///modules/UrlbarSearchUtils.sys.mjs",
});

/**
 * A feature that supports Market suggestions like stocks, indexes, and funds.
 */
export class MarketSuggestions extends RealtimeSuggestProvider {
  get realtimeType() {
    return "market";
  }

  get isSponsored() {
    return false;
  }

  get merinoProvider() {
    return "polygon";
  }

  makeMerinoResult(queryContext, suggestion, searchString) {
    if (!suggestion.custom_details?.polygon?.values?.length) {
      return null;
    }

    let engine = lazy.UrlbarSearchUtils.getDefaultEngine(
      queryContext.isPrivate
    );
    if (!engine) {
      return null;
    }

    let result = super.makeMerinoResult(queryContext, suggestion, searchString);
    if (!result) {
      return null;
    }

    result.payload.engine = engine.name;

    return result;
  }

  getViewTemplate(result) {
    let hasMultipleValues = result.payload.polygon.values.length > 1;
    return {
      name: "root",
      overflowable: true,
      attributes: {
        selectable: hasMultipleValues ? null : "",
      },
      children: result.payload.polygon.values.map((_v, i) => ({
        name: `item_${i}`,
        tag: "span",
        classList: ["urlbarView-market-item"],
        attributes: {
          selectable: !hasMultipleValues ? null : "",
        },
        children: [
          // Create an image inside a container so that the image appears inset
          // into a square. This is atypical because we normally use only an
          // image and give it padding and a background color to achieve that
          // effect, but that only works when the image size is fixed.
          // Unfortunately Merino serves market icons of different sizes due to
          // its reliance on a third-party API.
          {
            name: `image_container_${i}`,
            tag: "span",
            classList: ["urlbarView-market-image-container"],
            children: [
              {
                name: `image_${i}`,
                tag: "img",
                classList: ["urlbarView-market-image"],
              },
            ],
          },
          {
            tag: "span",
            classList: ["urlbarView-market-description"],
            children: [
              {
                tag: "div",
                classList: ["urlbarView-market-description-top"],
                children: [
                  {
                    name: `name_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-name"],
                  },
                  {
                    name: `top_separator_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-description-separator"],
                  },
                  {
                    name: `ticker_${i}`,
                    tag: "span",
                  },
                ],
              },
              {
                tag: "div",
                classList: ["urlbarView-market-description-bottom"],
                children: [
                  {
                    name: `todays_change_perc_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-todays-change-perc"],
                  },
                  {
                    name: `bottom_separator_1_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-description-separator"],
                  },
                  {
                    name: `last_price_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-last-price"],
                  },
                  {
                    name: `bottom_separator_2_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-description-separator"],
                  },
                  {
                    name: `exchange_${i}`,
                    tag: "span",
                    classList: ["urlbarView-market-exchange"],
                  },
                ],
              },
            ],
          },
        ],
      })),
    };
  }

  getViewUpdate(result) {
    return Object.fromEntries([
      [
        "root",
        {
          dataset: {
            // This `query` will be used when there's only one value.
            query: result.payload.polygon.values[0].query,
          },
        },
      ],
      ...result.payload.polygon.values.flatMap((v, i) => {
        let arrowImageUri;
        let changeDescription;
        let changePercent = parseFloat(v.todays_change_perc);
        if (changePercent < 0) {
          changeDescription = "down";
          arrowImageUri = "chrome://browser/skin/urlbar/market-down.svg";
        } else if (changePercent > 0) {
          changeDescription = "up";
          arrowImageUri = "chrome://browser/skin/urlbar/market-up.svg";
        } else {
          changeDescription = "unchanged";
          arrowImageUri = "chrome://browser/skin/urlbar/market-unchanged.svg";
        }

        let imageUri = v.image_url;
        let isImageAnArrow = false;
        if (!imageUri) {
          isImageAnArrow = true;
          imageUri = arrowImageUri;
        }

        return Object.entries({
          [`item_${i}`]: {
            attributes: {
              change: changeDescription,
            },
            dataset: {
              // These `query`s will be used when there are multiple values.
              query: v.query,
            },
          },
          [`image_container_${i}`]: {
            attributes: {
              "is-arrow": isImageAnArrow ? "" : null,
            },
          },
          [`image_${i}`]: {
            attributes: {
              src: imageUri,
            },
          },
          [`name_${i}`]: {
            textContent: v.name,
          },
          [`ticker_${i}`]: {
            textContent: v.ticker,
          },
          [`todays_change_perc_${i}`]: {
            textContent: `${v.todays_change_perc}%`,
          },
          [`last_price_${i}`]: {
            textContent: v.last_price,
          },
          [`exchange_${i}`]: {
            textContent: v.exchange,
          },
          [`top_separator_${i}`]: {
            textContent: "·",
          },
          [`bottom_separator_1_${i}`]: {
            textContent: "·",
          },
          [`bottom_separator_2_${i}`]: {
            textContent: "·",
          },
        });
      }),
    ]);
  }
}
