/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asImageBitmap
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.isActive
import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import org.mozilla.fenix.compose.TabThumbnailImageData
import org.mozilla.fenix.ext.maxActiveTime
import org.mozilla.fenix.tabstray.ext.toDisplayTitle
import java.util.UUID

/**
 * Data entity representing items in the Tabs Tray.
 *
 * @property id The ID of the item.
 * @property isHomepageItem Whether the entity represents a Homepage item.
 */
sealed class TabsTrayItem(
    open val id: String,
    val isHomepageItem: Boolean,
) {
    /**
     * Data entity representing a tab in the Tabs Tray.
     *
     * @property id The ID of the item.
     * @property url The URL of the tab.
     * @property title The tab's display-friendly title.
     * @property inactive Whether the tab is inactive.
     * @property private Whether the tab is private.
     * @property icon The bitmap of the tab's favicon.
     * @property lastAccess The last time this tab was selected.
     */
    data class Tab(
        override val id: String,
        val url: String,
        val title: String,
        val inactive: Boolean,
        val private: Boolean,
        val icon: Bitmap?,
        val lastAccess: Long,
    ) : TabsTrayItem(
        id = id,
        isHomepageItem = url.equals(ABOUT_HOME_URL, ignoreCase = true),
    ) {
        constructor(tab: TabSessionState) : this(
            id = tab.id,
            url = tab.content.url,
            title = tab.toDisplayTitle(),
            inactive = !tab.isActive(maxActiveTime = maxActiveTime),
            private = tab.content.private,
            icon = tab.content.icon,
            lastAccess = tab.lastAccess,
        )

        /**
         * Constructs a [TabThumbnailImageData] from the given tab data
         */
        fun toThumbnailImageData(): TabThumbnailImageData = TabThumbnailImageData(
            tabId = id,
            isPrivate = private,
            tabUrl = url,
            tabIcon = icon?.asImageBitmap(),
        )
    }

    /**
     * Data entity representing a tab group in the Tabs Tray.
     *
     * @property id The group's ID.
     * @property title The group's display title.
     * @property theme The group's [TabGroupTheme].
     * @property tabs The set of [Tab]s within the group.
     * @property closed Whether the group is closed and does not appear in the main tab item list.
     */
    data class TabGroup(
        override val id: String = UUID.randomUUID().toString(),
        val title: String,
        val theme: TabGroupTheme,
        val tabs: HashSet<Tab>,
        val closed: Boolean = false,
    ) : TabsTrayItem(
        id = id,
        isHomepageItem = false,
    )

    /**
     * @param text The text to search for.
     *
     * @return true if the item contains the given text.
     */
    fun contains(text: String): Boolean {
        return when (this) {
            is Tab -> {
                url.contains(text, ignoreCase = true) ||
                        title.contains(text, ignoreCase = true)
            }
            is TabGroup -> false
        }
    }
}

internal fun createTab(
    url: String,
    id: String = UUID.randomUUID().toString(),
    title: String = "",
    inactive: Boolean = false,
    private: Boolean = false,
    lastAccess: Long = 0L,
): TabsTrayItem.Tab = TabsTrayItem.Tab(
    id = id,
    url = url,
    title = title,
    inactive = inactive,
    private = private,
    icon = null,
    lastAccess = lastAccess,
)

internal fun createTabGroup(
    id: String = UUID.randomUUID().toString(),
    title: String = "",
    theme: TabGroupTheme = TabGroupTheme.default,
    tabs: HashSet<TabsTrayItem.Tab> = hashSetOf(),
    closed: Boolean = false,
): TabsTrayItem.TabGroup = TabsTrayItem.TabGroup(
    id = id,
    title = title,
    theme = theme,
    tabs = tabs,
    closed = closed,
)
