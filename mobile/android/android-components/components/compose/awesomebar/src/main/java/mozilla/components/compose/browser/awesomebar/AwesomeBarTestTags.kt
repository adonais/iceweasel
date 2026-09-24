/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar

/** Test tags for the [AwesomeBar] composable. */
object AwesomeBarTestTags {
    private const val TAG = "mozac.awesomebar"

    /** Test tag of each individual suggestion shown in the AwesomeBar. */
    const val SUGGESTION = "$TAG.suggestion"

    /** Test tag for the list of all suggestions shown in the AwesomeBar. */
    const val SUGGESTIONS = "$TAG.suggestions"

    /** Test tag for the current site details (icon, title, URL) shown in the AwesomeBar. */
    const val CURRENT_SITE_DETAILS = "$TAG.currentSiteDetails"

    /** Test tag for the current URL shown in the AwesomeBar. */
    const val CURRENT_URL_IN_SITE_DETAILS = "$TAG.currentUrlInSiteDetails"

    /** Test tag for the share current site details button shown in the AwesomeBar. */
    const val SHARE_CURRENT_SITE_DETAILS_BUTTON = "$TAG.shareCurrentSiteDetailsButton"

    /** Test tag for the copy current site details button shown in the AwesomeBar. */
    const val COPY_CURRENT_SITE_DETAILS_BUTTON = "$TAG.copyCurrentSiteDetailsButton"

    /** Test tag for the edit current site URL button shown in the AwesomeBar. */
    const val EDIT_CURRENT_SITE_URL_BUTTON = "$TAG.editCurrentSiteUrlButton"
}
