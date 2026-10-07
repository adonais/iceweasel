/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket

import android.content.Context
import mozilla.components.service.pocket.isContentRecommendationsLocaleSupported
import mozilla.components.support.locale.LocaleManager
import mozilla.components.support.locale.LocaleManager.getSystemDefault

/** Utility singleton for providing helper functions related to content recommendations feature flags. */
object ContentRecommendationsFeatureHelper {
    /** Show Pocket sponsored stories in between Pocket recommended stories on home. */
    fun isPocketSponsoredStoriesFeatureEnabled(context: Context): Boolean {
        return isContentRecommendationsFeatureEnabled(context)
    }

    /**
     * Returns true if the current locale is part of the supported locales for content recommendations, and false
     * otherwise.
     */
    fun isContentRecommendationsFeatureEnabled(context: Context): Boolean {
        val locale = LocaleManager.getCurrentLocale(context) ?: getSystemDefault()
        return isContentRecommendationsLocaleSupported(locale)
    }
}
