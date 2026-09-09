/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.generation.behavior

import org.mozilla.fenix.ui.efficiency.navigation.LaunchConfig

/**
 * The launch a behavior case asks for, as a [LaunchConfig].
 *
 * This used to build a BehaviorBaseTestConfig --- a third data class holding the same flags as LaunchConfig, which the
 * shard then spread back into BaseTest's constructor arguments one at a time so BaseTest could reassemble them. Three
 * shapes for one idea, and the call site invoked this function once per field.
 *
 * Note for anyone looking for it: the old type also carried `isUnifiedTrustPanelEnabled`, which BaseTest has never
 * accepted, so it was read from the case and then dropped. A behavior case setting UnifiedTrustPanelEnabled has
 * therefore never had any effect. Not restored here, because inventing a launch flag is a bigger change than this one;
 * recorded so it is not mistaken for a regression.
 */
fun BehaviorContextVariant.toLaunchConfig(): LaunchConfig =
    LaunchConfig(
        skipOnboarding = booleanValue(key = "SkipOnboarding", default = true),
        isPageLoadTranslationsPromptEnabled = booleanValue(key = "PageLoadTranslationsPromptEnabled", default = false),
        isPocketEnabled = booleanValue(key = "PocketEnabled", default = true),
        isRecentlyVisitedFeatureEnabled = booleanValue(key = "RecentlyVisitedEnabled", default = true),
    )

private fun BehaviorContextVariant.booleanValue(
    key: String,
    default: Boolean,
): Boolean {
    return values[key]?.toBooleanStrictOrNull() ?: default
}
