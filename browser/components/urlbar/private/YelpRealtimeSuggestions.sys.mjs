/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "moz-src:///browser/components/urlbar/private/RealtimeSuggestProvider.sys.mjs";

/**
 * A feature that supports Yelp realtime suggestions.
 */
export class YelpRealtimeSuggestions extends RealtimeSuggestProvider {
  get realtimeType() {
    // Ideally this would simply be "yelp" but we want to avoid confusion with
    // offline Yelp suggestions.
    return "yelpRealtime";
  }

  get isSponsored() {
    return true;
  }

  get merinoProvider() {
    return "yelp";
  }

  makeMerinoResult(queryContext, suggestion, searchString) {
    return super.makeMerinoResult(queryContext, suggestion, searchString, {
      // Group label settings.
      hideRowLabel: false,
      rowLabel: {
        id: "urlbar-result-yelp-realtime-group-label",
      },
    });
  }

  getViewTemplateForDescriptionTop(index) {
    return [
      {
        name: `title_${index}`,
        tag: "span",
        classList: ["urlbarView-yelpRealtime-title"],
      },
    ];
  }

  getViewTemplateForDescriptionBottom(index) {
    return [
      {
        name: `address_${index}`,
        tag: "span",
        classList: ["urlbarView-yelpRealtime-description-address"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        name: `pricing_${index}`,
        tag: "span",
        classList: ["urlbarView-yelpRealtime-description-pricing"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        name: `business_hours_${index}`,
        tag: "span",
        classList: ["urlbarView-yelpRealtime-description-business-hours"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator"],
      },
      {
        tag: "span",
        classList: ["urlbarView-yelpRealtime-description-popularity-star"],
      },
      {
        name: `popularity_${index}`,
        tag: "span",
        classList: ["urlbarView-yelpRealtime-description-popularity"],
      },
    ];
  }

  getViewUpdateForValues(values) {
    return Object.assign(
      {},
      ...values.flatMap((v, i) => {
        return {
          [`item_${i}`]: {
            attributes: {
              state: v.business_hours[0].is_open_now ? "open" : "closed",
            },
          },
          [`image_${i}`]: {
            attributes: {
              src: v.image_url,
            },
          },
          [`title_${i}`]: {
            textContent: v.name,
          },
          [`address_${i}`]: {
            textContent: v.address,
          },
          [`pricing_${i}`]: {
            textContent: v.pricing,
          },
          [`business_hours_${i}`]: {
            l10n: {
              id: v.business_hours[0].is_open_now
                ? "urlbar-result-yelp-realtime-business-hours-open"
                : "urlbar-result-yelp-realtime-business-hours-closed",
              args: {
                // TODO: Need to pass "time until keeping the status" after resolving
                // the timezone issue.
                timeUntil: new Intl.DateTimeFormat(undefined, {
                  hour: "numeric",
                }).format(new Date()),
              },
              parseMarkup: true,
              cacheable: true,
              excludeArgsFromCacheKey: true,
            },
          },
          [`popularity_${i}`]: {
            l10n: {
              id: "urlbar-result-yelp-realtime-popularity",
              args: {
                rating: v.rating,
                review_count: v.review_count,
              },
              cacheable: true,
              excludeArgsFromCacheKey: true,
            },
          },
        };
      })
    );
  }
}
