/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.merino.manifest

import android.content.res.AssetManager
import androidx.core.net.toUri
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.ktx.android.net.hostWithoutCommonPrefixes
import java.io.IOException

internal const val ASSET_FILE_PATH = "manifest/manifest.json"

/**
 * Provides lookups into an embedded snapshot of the Merino manifest, which contains metadata for
 * websites including icons, titles, and categories.
 *
 * The manifest is read from [assetManager] on first use and cached for subsequent calls.
 *
 * @param assetManager Used to open the embedded manifest asset.
 */
class MerinoManifestProvider(private val assetManager: AssetManager) {

    private val manifestMap: Map<String, ManifestEntry> by lazy { buildDomainMap() }
    private val logger = Logger("MerinoManifestProvider")
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Returns the icon URL for the given [host], or null if no entry exists in the manifest or
     * the entry has no icon.
     *
     * @param host The bare hostname of a URL with common prefixes (e.g. `www.`) already stripped,
     * such as `"google.com"` or `"wikipedia.org"`.
     */
    fun getIconUrl(host: String): String? = manifestMap[host]?.icon?.takeIf { it.isNotBlank() }

    /**
     * Returns the [ManifestEntry] for the given [host], or null if no entry exists.
     *
     * @param host The bare hostname of a URL with common prefixes (e.g. `www.`) already stripped,
     * such as `"google.com"` or `"wikipedia.org"`.
     */
    fun getManifestEntry(host: String): ManifestEntry? = manifestMap[host]

    /**
     * Returns websites from the manifest sorted by rank ascending (rank 1 = most popular) and
     * excludes entries that matches one of the [excludedDomains].
     *
     * @param limit Maximum number of entries to return. Defaults to all entries.
     * @param excludedDomains Set of hostnames to filter out.
     */
    fun getTopDomains(
        limit: Int = Int.MAX_VALUE,
        excludedDomains: Set<String> = emptySet(),
    ): List<ManifestEntry> =
        manifestMap.entries.asSequence()
            .filterNot { (host, _) -> host in excludedDomains }
            .map { (_, entry) -> entry }
            .take(limit)
            .toList()

    private fun buildDomainMap(): Map<String, ManifestEntry> {
        return try {
            val text = assetManager.open(ASSET_FILE_PATH).bufferedReader().readText()
            val manifest = json.decodeFromString<MerinoManifest>(text)
            val domainMap = LinkedHashMap<String, ManifestEntry>(manifest.domains.size)

            // LinkedHashMap will preserve the rank order based on the insertion order.
            manifest.domains
                .sortedBy { it.rank }
                .forEach { entry ->
                    val host = entry.url.toUri().hostWithoutCommonPrefixes ?: return@forEach
                    domainMap.putIfAbsent(host, entry)
                }

            domainMap
        } catch (e: IOException) {
            logger.error("IOException when loading Merino manifest from assets", e)
            emptyMap()
        } catch (e: SerializationException) {
            logger.error("SerializationException when loading Merino manifest", e)
            emptyMap()
        }
    }
}
