/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix

import android.content.Context
import mozilla.components.browser.errorpages.DefaultErrorStringsProvider
import mozilla.components.browser.errorpages.ErrorStrings
import mozilla.components.concept.engine.request.ErrorType

/**
 * Fenix-specific [ErrorStrings] provider.
 *
 * Configure error messages (and some error display behaviour) in Fenix-specific ways here.
 */
class FenixErrorStringsProvider : DefaultErrorStringsProvider() {
    override fun errorStringsFor(context: Context, errorType: ErrorType, uri: String?): ErrorStrings {
        val defaultStrings = super.errorStringsFor(context, errorType, uri)
        return when (errorType) {
            ErrorType.ERROR_HTTPS_ONLY ->
                defaultStrings.copy(
                    title = context.getString(R.string.errorpage_httpsonly_title),
                    message =
                        context.getString(R.string.errorpage_httpsonly_message_title) +
                            "<br><br>" +
                            context.getString(R.string.errorpage_httpsonly_message_summary),
                )

            else -> defaultStrings
        }
    }
}
