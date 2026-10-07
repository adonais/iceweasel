/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.errorpages

import android.content.Context
import androidx.core.net.toUri
import mozilla.components.browser.errorpages.ErrorPages.ARCHIVABLE_ERROR_TYPES
import mozilla.components.browser.errorpages.ErrorPages.archiveUrlFor
import mozilla.components.concept.engine.request.ErrorType
import mozilla.components.support.ktx.kotlin.urlEncode

object ErrorPages {

    private const val HTML_RESOURCE_FILE = "error_page_js.html"

    /**
     * Wayback Machine: error types for which offering an archived copy of the page makes sense. These are failures
     * where the live site is unreachable or missing but the user still has connectivity to reach an archive service.
     * Security errors (bad certificate, SSL, HSTS, HTTPS-only, port blocked, safe browsing) and connectivity errors
     * (offline, no internet) are intentionally excluded: the former should not be bypassed via an archive, and the
     * latter mean the archive service is unreachable too.
     */
    private val ARCHIVABLE_ERROR_TYPES =
        setOf(
            ErrorType.ERROR_UNKNOWN_HOST,
            ErrorType.ERROR_CONNECTION_REFUSED,
            ErrorType.ERROR_NET_TIMEOUT,
            ErrorType.ERROR_NET_RESET,
            ErrorType.ERROR_NET_INTERRUPT,
            ErrorType.ERROR_REDIRECT_LOOP,
            ErrorType.ERROR_FILE_NOT_FOUND,
            ErrorType.ERROR_PROXY_CONNECTION_REFUSED,
            ErrorType.ERROR_UNKNOWN_PROXY_HOST,
            ErrorType.ERROR_CORRUPTED_CONTENT,
            ErrorType.ERROR_INVALID_CONTENT_ENCODING,
            ErrorType.ERROR_UNSAFE_CONTENT_TYPE,
        )

    /**
     * Provides an encoded URL for an error page. Supports displaying images
     *
     * @param errorStringsProvider A function that maps an error type and the failed URL to the strings shown on the
     *   page. Defaults to [DefaultErrorStringsProvider], the standard strings provider implemented by this component.
     *   Consumers can override this to provide custom error messages.
     * @param archiveActionEnabled When `true`, and the error type and URL are eligible (see [archiveUrlFor]), the page
     *   is given the parameters needed to offer an archived copy of the failed page. Defaults to `false` so the action
     *   is opt-in per consumer.
     */
    fun createUrlEncodedErrorPage(
        context: Context,
        errorType: ErrorType,
        uri: String? = null,
        htmlResource: String = HTML_RESOURCE_FILE,
        errorStringsProvider: ErrorStringsProvider = DefaultErrorStringsProvider(),
        isPrivate: Boolean = false,
        archiveActionEnabled: Boolean = false,
    ): String {
        val errorStrings = errorStringsProvider.errorStringsFor(context, errorType, uri)

        val title = errorStrings.title
        val button = errorStrings.refreshButton
        val description = errorStrings.message
        val imageName = errorStrings.imageName?.let { "$it.svg" } ?: ""
        val errorCode = errorStrings.errorCode ?: ""

        val showSSLAdvanced: String =
            when (errorType) {
                ErrorType.ERROR_SECURITY_BAD_CERT -> true
                else -> false
            }.toString()

        val showHSTSAdvanced: String =
            when (errorType) {
                ErrorType.ERROR_BAD_HSTS_CERT -> true
                else -> false
            }.toString()

        val showContinueHttp: String = (errorType == ErrorType.ERROR_HTTPS_ONLY).toString()

        /**
         * Warning: When updating these params you WILL cause breaking changes that are undetected by consumers. Update
         * the README accordingly.
         */
        var urlEncodedErrorPage =
            "resource://android/assets/$htmlResource?" +
                "&title=${title.urlEncode()}" +
                "&button=${button.urlEncode()}" +
                "&description=${description.urlEncode()}" +
                "&image=${imageName.urlEncode()}" +
                "&errorCode=${errorCode.urlEncode()}" +
                "&isPrivate=$isPrivate"

        val archiveUrl = archiveUrlFor(errorType, uri)
        val archiveDetails = errorStringsProvider.archiveDetailsFor(context, errorType, uri)
        if (archiveActionEnabled && archiveUrl.isNotEmpty() && archiveDetails != null) {
            urlEncodedErrorPage += "&archiveUrl=${archiveUrl.urlEncode()}" + archiveParamsFor(archiveDetails)
        }

        errorStringsProvider.badCertDetailsFor(context, errorType, uri)?.let { details ->
            urlEncodedErrorPage +=
                "&showSSL=${showSSLAdvanced.urlEncode()}" +
                    "&showHSTS=${showHSTSAdvanced.urlEncode()}" +
                    badCertParamsFor(details)
        }

        errorStringsProvider.continueHttpDetailsFor(context, errorType, uri)?.let { details ->
            urlEncodedErrorPage +=
                "&showContinueHttp=${showContinueHttp.urlEncode()}" +
                    "&continueHttpButton=${details.continueHttpButton.urlEncode()}" +
                    "&backFromHttpButton=${details.backFromHttpButton.urlEncode()}"
        }

        urlEncodedErrorPage = urlEncodedErrorPage.replace("<ul>".urlEncode(), "<ul role=\"presentation\">".urlEncode())
        return urlEncodedErrorPage
    }

    private fun badCertParamsFor(details: BadCertDetails): String {
        return "&badCertAdvanced=${details.badCertAdvanced.urlEncode()}" +
            "&badCertTechInfo=${details.badCertTechInfo.urlEncode()}" +
            "&badCertGoBack=${details.badCertGoBack.urlEncode()}" +
            "&badCertAcceptTemporary=${details.badCertAcceptTemporary.urlEncode()}"
    }

    /**
     * Builds the query-string fragment carrying the archived-copy action's privacy-cleaned URL and localized labels, so
     * the error page can offer an archived copy when the live site is unreachable.
     */
    private fun archiveParamsFor(details: ArchiveDetails): String {
        return "&archiveCheckButtonLabel=${details.archiveCheckButtonLabel.urlEncode()}" +
            "&archiveCheckingLabel=${details.archiveCheckingLabel.urlEncode()}" +
            "&archiveDescriptionMessage=${details.archiveDescriptionMessage.urlEncode()}" +
            "&archiveDescriptionLinkLabel=${details.archiveDescriptionLinkLabel.urlEncode()}" +
            "&archiveNotFoundMessage=${details.archiveNotFoundMessage.urlEncode()}" +
            "&archiveSearchWebLabel=${details.archiveSearchWebLabel.urlEncode()}" +
            "&archiveUnreachableMessage=${details.archiveUnreachableMessage.urlEncode()}" +
            "&archiveRetryLabel=${details.archiveRetryLabel.urlEncode()}"
    }

    /**
     * Returns a privacy-cleaned version of [uri] suitable for looking up an archived copy of the page, or an empty
     * string when an archived version does not make sense. This is the case when [errorType] is not one of
     * [ARCHIVABLE_ERROR_TYPES] (for example security or connectivity errors) or when [uri] is not an http(s) URL with a
     * host.
     *
     * @param errorType The type of error encountered.
     * @param uri The URL that failed to load, if known.
     */
    fun archiveUrlFor(errorType: ErrorType, uri: String?): String =
        if (errorType in ARCHIVABLE_ERROR_TYPES) {
            uri?.let { cleanSiteUrl(it) }.orEmpty()
        } else {
            ""
        }

    /**
     * Reduces [uri] to just its scheme, host, port and path, dropping any user info, query parameters and fragment.
     * This ensures no user-specific data (sessions, tracking params, credentials) is leaked when the URL is later
     * handed to an external archive service. Returns an empty string for anything that is not an http(s) URL with a
     * host, since those have no meaningful archived version. The port is preserved when present, since it identifies a
     * distinct service and is part of the address the user was trying to reach. An empty path is normalized to "/",
     * since the archive lookup service does not match a bare-host URL without a trailing slash.
     */
    private fun cleanSiteUrl(uri: String): String {
        val parsed = uri.toUri()
        val scheme = parsed.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            return ""
        }
        val host = parsed.host ?: return ""
        val path = parsed.path?.takeIf { it.isNotEmpty() } ?: "/"
        val port = if (parsed.port != -1) ":${parsed.port}" else ""
        return "$scheme://$host$port$path"
    }
}
