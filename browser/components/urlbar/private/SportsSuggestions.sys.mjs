/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "moz-src:///browser/components/urlbar/private/RealtimeSuggestProvider.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

/**
 * A feature that manages sports realtime suggestions.
 */
export class SportsSuggestions extends RealtimeSuggestProvider {
  get realtimeType() {
    return "sports";
  }

  get isSponsored() {
    return false;
  }

  get merinoProvider() {
    return "sports";
  }

  getViewTemplateForImage(item, index) {
    if (itemIcon(item)) {
      return super.getViewTemplateForImage(item, index);
    }

    return [
      {
        name: `scheduled-date-chiclet-day-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-scheduled-date-chiclet-day"],
      },
      {
        name: `scheduled-date-chiclet-month-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-scheduled-date-chiclet-month"],
      },
    ];
  }

  getViewTemplateForDescriptionTop(item, index) {
    return stringifiedScore(item.home_team.score) &&
      stringifiedScore(item.away_team.score)
      ? this.#viewTemplateTopWithScores(index)
      : this.#viewTemplateTopWithoutScores(index);
  }

  #viewTemplateTopWithScores(index) {
    return [
      {
        name: `home-team-name-${index}`,
        tag: "span",
      },
      {
        name: `home-team-score-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-score"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `away-team-name-${index}`,
        tag: "span",
      },
      {
        name: `away-team-score-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-score"],
      },
    ];
  }

  #viewTemplateTopWithoutScores(index) {
    return [
      {
        name: `team-names-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-team-names"],
      },
    ];
  }

  getViewTemplateForDescriptionBottom(item, index) {
    return [
      {
        name: `sport-${index}`,
        tag: "span",
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `date-${index}`,
        tag: "span",
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `status-${index}`,
        tag: "span",
        classList: ["urlbarView-sports-status"],
      },
    ];
  }

  getViewUpdateForPayloadItem(item, index) {
    let topUpdate =
      stringifiedScore(item.home_team.score) &&
      stringifiedScore(item.away_team.score)
        ? this.#viewUpdateTopWithScores(item, index)
        : this.#viewUpdateTopWithoutScores(item, index);

    return {
      ...topUpdate,
      ...this.#viewUpdateImageAndBottom(item, index),
      [`item_${index}`]: {
        attributes: {
          "sport-category": item.sport_category,
          status: item.status_type,
        },
      },
    };
  }

  #viewUpdateTopWithScores(item, i) {
    return {
      [`home-team-name-${i}`]: {
        textContent: item.home_team.name,
      },
      [`home-team-score-${i}`]: {
        textContent: stringifiedScore(item.home_team.score),
      },
      [`away-team-name-${i}`]: {
        textContent: item.away_team.name,
      },
      [`away-team-score-${i}`]: {
        textContent: stringifiedScore(item.away_team.score),
      },
    };
  }

  #viewUpdateTopWithoutScores(item, i) {
    return {
      [`team-names-${i}`]: {
        l10n: {
          id: "urlbar-result-sports-team-names",
          args: {
            homeTeam: item.home_team.name,
            awayTeam: item.away_team.name,
          },
        },
      },
    };
  }

  #viewUpdateImageAndBottom(item, i) {
    let date = new Date(item.date);
    let icon = itemIcon(item);

    let {
      formattedDate,
      formattedTime,
      parseDateResult: { daysUntil, zonedNow },
    } = lazy.UrlbarUtils.formatDate(date, {
      // If the item has an icon, the date chiclet won't be shown, so show the
      // absolute date in the bottom part of the row.
      forceAbsoluteDate: !!icon,
      includeTimeZone: true,
      capitalizeRelativeDate: true,
    });

    // Create the image update.
    let imageUpdate;
    if (icon) {
      // The image container will contain the icon.
      imageUpdate = {
        [`image_container_${i}`]: {
          attributes: {
            // Remove the fallback attribute by setting it to null.
            "is-fallback": null,
          },
        },
        [`image_${i}`]: {
          attributes: {
            src: icon,
          },
        },
      };
    } else {
      // Instead of an icon, the image container will be a date chiclet
      // containing the item's date as text, with the day above the month.
      let partsArray = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: zonedNow.timeZoneId,
      }).formatToParts(date);
      let partsMap = Object.fromEntries(
        partsArray.map(({ type, value }) => [type, value])
      );
      if (partsMap.day && partsMap.month) {
        imageUpdate = {
          [`image_container_${i}`]: {
            attributes: {
              "is-fallback": "",
            },
          },
          [`scheduled-date-chiclet-day-${i}`]: {
            textContent: partsMap.day,
          },
          [`scheduled-date-chiclet-month-${i}`]: {
            textContent: partsMap.month,
          },
        };
      } else {
        // This shouldn't happen.
        imageUpdate = {};
      }
    }

    // Create the date update in the bottom part of the row.
    let dateUpdate;
    if (formattedTime) {
      dateUpdate = {
        [`date-${i}`]: {
          l10n: {
            id: "urlbar-result-sports-game-date-with-time",
            args: {
              date: formattedDate,
              time: formattedTime,
            },
          },
        },
      };
    } else {
      dateUpdate = {
        [`date-${i}`]: {
          textContent: formattedDate,
        },
      };
    }

    // Create the status update. Show the status if the game is live or if it
    // happened earlier today. Otherwise clear the status.
    let statusUpdate;
    if (item.status_type == "live") {
      statusUpdate = {
        [`status-${i}`]: {
          l10n: {
            id: "urlbar-result-sports-status-live",
          },
        },
      };
    } else if (daysUntil == 0 && item.status_type == "past") {
      statusUpdate = {
        [`status-${i}`]: {
          l10n: {
            id: "urlbar-result-sports-status-final",
          },
        },
      };
    } else {
      statusUpdate = {
        [`status-${i}`]: {
          // Clear the status by setting its text to an empty string.
          textContent: "",
        },
      };
    }

    return {
      ...imageUpdate,
      ...dateUpdate,
      ...statusUpdate,
      [`sport-${i}`]: {
        textContent: item.sport,
      },
    };
  }
}

function itemIcon(item) {
  return item.icon || item.home_team?.icon || item.away_team?.icon;
}

function stringifiedScore(scoreValue) {
  let s = scoreValue;
  if (typeof s == "number") {
    s = String(s);
  }
  return typeof s == "string" ? s : "";
}
