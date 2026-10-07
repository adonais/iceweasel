/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.engine

import android.content.Context
import mozilla.components.browser.errorpages.DefaultErrorStringsProvider
import mozilla.components.browser.errorpages.ErrorPages
import mozilla.components.browser.errorpages.ErrorStrings
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.request.ErrorType
import mozilla.components.concept.engine.request.RequestInterceptor
import org.mozilla.focus.R
import org.mozilla.focus.ext.components
import org.mozilla.focus.state.AppAction
import org.mozilla.focus.utils.SupportUtils

/**
 * [RequestInterceptor] implementation for the application.
 *
 * Handles special URIs like `about:crashes` and provides custom error pages.
 */
class AppContentInterceptor(private val context: Context) : RequestInterceptor {
    override fun onLoadRequest(
        engineSession: EngineSession,
        uri: String,
        lastUri: String?,
        hasUserGesture: Boolean,
        isSameDomain: Boolean,
        isRedirect: Boolean,
        isDirectNavigation: Boolean,
        isSubframeRequest: Boolean,
    ): RequestInterceptor.InterceptionResponse? {
        return when (uri) {
            "about:crashes" -> {
                context.components.appStore.dispatch(AppAction.OpenCrashList)
                RequestInterceptor.InterceptionResponse.Url("about:blank")
            }

            else ->
                context.components.appLinksInterceptor.onLoadRequest(
                    engineSession,
                    uri,
                    lastUri,
                    hasUserGesture,
                    isSameDomain,
                    isRedirect,
                    isDirectNavigation,
                    isSubframeRequest,
                )
        }
    }

    override fun onErrorRequest(
        session: EngineSession,
        errorType: ErrorType,
        uri: String?,
    ): RequestInterceptor.ErrorResponse {
        val errorPage =
            ErrorPages.createUrlEncodedErrorPage(
                context,
                errorType,
                uri,
                errorStringsProvider = FocusErrorStringsProvider(),
            )
        return RequestInterceptor.ErrorResponse(errorPage)
    }

    override fun interceptsAppInitiatedRequests() = true
}

/**
 * Focus-specific [ErrorStrings] provider.
 *
 * Configure error messages (and some error display behaviour) in Focus-specific ways here.
 */
class FocusErrorStringsProvider : DefaultErrorStringsProvider() {
    override fun errorStringsFor(context: Context, errorType: ErrorType, uri: String?): ErrorStrings {
        val defaultStrings = super.errorStringsFor(context, errorType, uri)
        return when (errorType) {
            ErrorType.ERROR_HTTPS_ONLY ->
                defaultStrings.copy(
                    title = context.getString(R.string.errorpage_httpsonly_title2),
                    message =
                        context.getString(
                            R.string.errorpage_httpsonly_message2,
                            context.getString(R.string.app_name),
                            SupportUtils.getGenericSumoURLForTopic(SupportUtils.SumoTopic.HTTPS_ONLY),
                        ),
                )

            else -> defaultStrings
        }
    }
}
