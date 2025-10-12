/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "resource:///modules/urlbar/private/RealtimeSuggestProvider.sys.mjs";

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

  getViewTemplate(_result) {
    return {};
  }

  getViewUpdate(_result) {
    return {};
  }
}
