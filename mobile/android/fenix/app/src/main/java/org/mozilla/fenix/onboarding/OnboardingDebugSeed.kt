/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding

import org.mozilla.fenix.Config
import org.mozilla.fenix.utils.Settings

/**
 * Debug builds skip onboarding, leaving [Settings.onboardingCompletedTimestamp] unset. Seed it once with the current
 * time so features gated by it, such as continuous onboarding and the IP protection prompt, can be exercised in debug
 * builds.
 */
internal fun Settings.seedOnboardingCompletedTimestampForDebugIfNeeded(
    now: Long = System.currentTimeMillis(),
    isDebug: Boolean = Config.channel.isDebug,
) {
    if (isDebug && onboardingCompletedTimestamp == -1L) {
        onboardingCompletedTimestamp = now
    }
}
