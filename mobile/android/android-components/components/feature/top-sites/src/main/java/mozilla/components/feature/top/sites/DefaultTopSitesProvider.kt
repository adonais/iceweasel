/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.top.sites

/** A contract that indicates how a provider of the application's own default top sites must behave. */
interface DefaultTopSitesProvider {

    /** Returns a list of default top sites. */
    suspend fun getDefaultTopSites(): List<TopSite.Default>
}
