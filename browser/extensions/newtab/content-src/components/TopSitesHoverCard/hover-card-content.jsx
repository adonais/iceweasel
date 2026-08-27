/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CardWebNotifications } from "content-src/components/TopSitesHoverCard/CardWebNotifications/CardWebNotifications";
import { CardAd } from "content-src/components/TopSitesHoverCard/CardAd/CardAd";

/**
 * Ordered content registry for the top-sites hover card. The shell renders
 * exactly one variant — the first whose `match` accepts the tile — so content
 * types never mix in a single card. Order is precedence: a sponsored tile
 * matches the ad variant first, keeping notifications off ad tiles.
 *
 * Each variant component takes `{ link }` and is responsible for rendering
 * nothing when it has nothing to show, so an unmatched-but-empty variant never
 * paints an empty card.
 *
 * @type {Array<{key: string, match: (link: object) => boolean, Component: Function}>}
 */
export const HOVER_CARD_CONTENT = [
  {
    key: "ad",
    match: link =>
      Boolean(
        link?.isSponsored ||
        link?.sponsored_tile_id ||
        link?.show_sponsored_label ||
        link?.sponsored_position
      ),
    Component: CardAd,
  },
  {
    key: "notifications",
    match: () => true,
    Component: CardWebNotifications,
  },
];
