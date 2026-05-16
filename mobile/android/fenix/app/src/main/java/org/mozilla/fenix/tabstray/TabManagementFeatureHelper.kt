/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray

import org.mozilla.fenix.Config
import org.mozilla.fenix.nimbus.FxNimbus

/**
 * Feature helper for managing the release of the Tabs Tray UI enhancements.
 */
interface TabManagementFeatureHelper {

    /**
     * Whether the Tab Manager opening animation is enabled.
     */
    val openingAnimationEnabled: Boolean

    /**
     * Whether the Tab Search feature is enabled.
     */
    val tabSearchEnabled: Boolean

    /**
     * Whether the Tab Groups feature is enabled.
     */
    val tabGroupsEnabled: Boolean

    /**
     * Whether drag and drop is enabled for the Tab Groups feature.
     */
    val tabGroupsDragAndDropEnabled: Boolean
}

/**
 * The default implementation of [TabManagementFeatureHelper].
 */
data object DefaultTabManagementFeatureHelper : TabManagementFeatureHelper {

    override val openingAnimationEnabled: Boolean
        get() = Config.channel.isDebug || FxNimbus.features.tabManagementEnhancements.value().openingAnimationEnabled

    override val tabSearchEnabled: Boolean
        get() = when {
            Config.channel.isNightlyOrDebug -> true
            Config.channel.isBeta -> FxNimbus.features.tabSearch.value().enabled
            Config.channel.isRelease -> FxNimbus.features.tabSearch.value().enabled
            else -> false
        }

    override val tabGroupsEnabled: Boolean
        get() = FxNimbus.features.tabGroups.value().enabled

    override val tabGroupsDragAndDropEnabled: Boolean
        get() = FxNimbus.features.tabGroupsDragAndDrop.value().enabled
}
