/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import android.content.res.Resources
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import mozilla.components.browser.state.search.RegionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.top.sites.DefaultTopSitesProvider
import mozilla.components.feature.top.sites.TopSite
import mozilla.components.lib.crash.CrashReporter
import org.mozilla.fenix.R
import org.mozilla.fenix.home.blocklist.BlocklistHandler
import org.mozilla.fenix.home.topsites.utils.fetchDefaultTopSites

/**
 * A [DefaultTopSitesProvider] that retrieves the default shortcuts from `default_shortcuts.json`. The default shortcuts
 * are used to populate the top sites screen along with the frecent top sites.
 *
 * @param browserStore The [BrowserStore] used to read the user's region.
 * @param resources [Resources] used for accessing the raw resource.
 * @param crashReporter [CrashReporter] used for recording caught exceptions.
 * @param blocklistHandler [BlocklistHandler] holding the shortcuts the user has dismissed.
 * @param ioDispatcher The dispatcher used for reading and parsing the raw resource.
 */
class FenixDefaultTopSitesProvider(
    private val browserStore: BrowserStore,
    private val resources: Resources,
    private val crashReporter: CrashReporter,
    private val blocklistHandler: BlocklistHandler,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : DefaultTopSitesProvider {

    private val mutex = Mutex()

    @Volatile private var cachedTopSites: CachedTopSites? = null

    override suspend fun getDefaultTopSites(): List<TopSite.Default> {
        val region = browserStore.state.search.region?.current ?: RegionState.Default.current

        val defaultSites =
            topSitesList(region = region).map {
                TopSite.Default(
                    id = it.id.toLongOrNull(),
                    title = it.displayTitle(),
                    url = it.url,
                    createdAt = null,
                )
            }

        return with(blocklistHandler) { defaultSites.filteredByBlocklist() }
    }

    private suspend fun topSitesList(region: String): List<DefaultTopSiteItem> {
        val cached = cachedTopSitesFor(region)
        if (cached != null) return cached

        return mutex.withLock {
            // Another caller may have populated the cache for this region while we waited for the lock.
            cachedTopSitesFor(region)
                ?: readTopSites(region).also { topSites ->
                    cachedTopSites = CachedTopSites(region = region, topSites = topSites)
                }
        }
    }

    private fun cachedTopSitesFor(region: String): List<DefaultTopSiteItem>? =
        cachedTopSites?.takeIf { it.region == region }?.topSites

    private suspend fun readTopSites(region: String): List<DefaultTopSiteItem> =
        withContext(ioDispatcher) {
            fetchDefaultTopSites(
                resources = resources,
                rawResId = R.raw.default_shortcuts,
                crashReporter = crashReporter,
                region = region,
            )
        }

    /**
     * The top sites that were read for a region.
     *
     * @property region The region the top sites were read for.
     * @property topSites The top sites available in [region].
     */
    private data class CachedTopSites(val region: String, val topSites: List<DefaultTopSiteItem>)
}
