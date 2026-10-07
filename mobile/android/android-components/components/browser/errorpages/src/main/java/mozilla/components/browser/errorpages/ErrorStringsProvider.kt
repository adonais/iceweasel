/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.errorpages

import android.content.Context
import mozilla.components.concept.engine.request.ErrorType

/**
 * The strings shown on an error page for a given [ErrorType].
 *
 * Consumers can supply a custom mapping function to [ErrorPages.createUrlEncodedErrorPage] to override these strings.
 *
 * @param title The page title.
 * @param message The description of the error.
 * @param refreshButton The label of the button that reloads the page.
 * @param imageName The name, without extension, of the SVG illustration to show, or `null` for no illustration.
 * @param errorCode The engine error code to show, or `null` to not show one.
 */
data class ErrorStrings(
    val title: String,
    val message: String,
    val refreshButton: String,
    val imageName: String? = null,
    val errorCode: String? = null,
)

/** The strings shown on an error page for certain types of bad certificates. */
data class BadCertDetails(
    val badCertAdvanced: String,
    val badCertTechInfo: String,
    val badCertGoBack: String,
    val badCertAcceptTemporary: String,
)

/** The strings shown on an error page for searching for "archived" versions of some web pages. */
data class ArchiveDetails(
    val archiveCheckButtonLabel: String,
    val archiveCheckingLabel: String,
    val archiveDescriptionMessage: String,
    val archiveDescriptionLinkLabel: String,
    val archiveNotFoundMessage: String,
    val archiveSearchWebLabel: String,
    val archiveUnreachableMessage: String,
    val archiveRetryLabel: String,
)

/** The strings shown on an error page, for the "continue to HTTP site" button. */
data class ContinueHttpDetails(
    val continueHttpButton: String,
    val backFromHttpButton: String,
)

/**
 * Provide error strings and customize (some) error-display behavior.
 *
 * This can include:
 * - special strings and behavior for handling bad certificates; and
 * - special strings for searching for "archived" versions of some web pages.
 */
interface ErrorStringsProvider {
    /** Provide localized title, message, image, etc. for the given [errorType]. */
    fun errorStringsFor(context: Context, errorType: ErrorType, uri: String? = null): ErrorStrings

    /** Provide localized strings for handling bad certificates. Return null to not provide special handling. */
    fun badCertDetailsFor(context: Context, errorType: ErrorType, uri: String? = null): BadCertDetails?

    /**
     * Provide localized strings for offering to search for archived versions of the given URI. Return null to not offer
     * such searching.
     */
    fun archiveDetailsFor(context: Context, errorType: ErrorType, uri: String? = null): ArchiveDetails?

    /** Provide localized strings for the "continue to HTTP site" button, if one will be displayed. */
    fun continueHttpDetailsFor(context: Context, errorType: ErrorType, uri: String? = null): ContinueHttpDetails?
}
