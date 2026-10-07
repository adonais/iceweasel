/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket

import java.util.Locale
import mozilla.components.service.pocket.ext.toCuratedRecommendationLocale

/**
 * Returns whether content recommendations are available in the provided [locale], which requires a supported language
 * and region combination. Consumers should only request content recommendations for a supported locale.
 */
fun isContentRecommendationsLocaleSupported(locale: Locale) = locale.toCuratedRecommendationLocale() != null
