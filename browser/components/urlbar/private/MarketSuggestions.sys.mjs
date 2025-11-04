/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "moz-src:///browser/components/urlbar/private/RealtimeSuggestProvider.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarSearchUtils:
    "moz-src:///browser/components/urlbar/UrlbarSearchUtils.sys.mjs",
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

  getViewTemplateForDescriptionTop(index) {
    return [
      {
        name: `name_${index}`,
        tag: "span",
        classList: ["urlbarView-market-name"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        name: `ticker_${index}`,
        tag: "span",
      },
    ];
  }

  getViewTemplateForDescriptionBottom(index) {
    return [
      {
        name: `todays_change_perc_${index}`,
        tag: "span",
        classList: ["urlbarView-market-todays-change-perc"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        name: `last_price_${index}`,
        tag: "span",
        classList: ["urlbarView-market-last-price"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        name: `exchange_${index}`,
        tag: "span",
        classList: ["urlbarView-market-exchange"],
      },
    ];
  }

  getViewUpdateForValues(values) {
    return Object.assign(
      {},
      ...values.flatMap((v, i) => {
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

        return {
          [`item_${i}`]: {
            attributes: {
              change: changeDescription,
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
        };
      })
    );
  }
}
