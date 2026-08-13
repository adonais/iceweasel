/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.mars

const val NEW_TAB_TILE_1_PLACEMENT_KEY = "newtab_mobile_tile_1"
const val NEW_TAB_TILE_2_PLACEMENT_KEY = "newtab_mobile_tile_2"

/**
 * Configuration for the top sites tile request.
 *
 * @property placements List of Ad Placement Ids to request.
 */
data class MacTopSitesRequestConfig(
    val placements: List<String>,
)
