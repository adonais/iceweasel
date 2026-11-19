/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store.state

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import kotlin.time.Instant

/**
 * Usage quota containing information like [resetTime], [max] volume, [remaining] volume.
 *
 * A usage quota is either [UsageQuota.Metered] or [UsageQuota.Unmetered]
 */
@Stable
sealed interface UsageQuota {

    /** The end of the usage cycle. When this is null, it means the quota does not have any time-based restrictions */
    val resetTime: Instant?

    /**
     * The maximum amount of [DataVolume] that can be used in the current quota. This value is equal to
     * [DataVolume.Unlimited] when the quota is [Unmetered].
     */
    val max: DataVolume

    /**
     * The amount of [DataVolume] that is remaining in the current quota. This value is [DataVolume.Unlimited] when the
     * quota is [Unmetered].
     *
     * For [UsageQuota.Metered], [remaining] must always be less than or equal to [max].
     */
    val remaining: DataVolume

    /**
     * A metered type of [UsageQuota].
     *
     * @property max The maximum amount of [DataVolume] that can be used in the current quota.
     * @property remaining The amount of [DataVolume] that is remaining in the current quota.
     * @property resetTime The time the quota will be reset. When this is null, it means the metered quota does not have
     *   any known reset time
     */
    @Immutable
    data class Metered(
        override val max: DataVolume,
        override val remaining: DataVolume,
        override val resetTime: Instant? = null,
    ) : UsageQuota

    /**
     * An unmetered type of [UsageQuota].
     *
     * @property resetTime Optional instant that the quota will be reset. When this is null, it means the unmetered
     *   quota does not have any known reset time
     */
    @Immutable
    data class Unmetered(override val resetTime: Instant? = null) : UsageQuota {
        override val max: DataVolume
            get() = DataVolume.Unlimited

        override val remaining: DataVolume
            get() = DataVolume.Unlimited
    }
}

/** Amount of [DataVolume] that is used so far. */
val UsageQuota.Metered.used: DataVolume
    get() = max - remaining
