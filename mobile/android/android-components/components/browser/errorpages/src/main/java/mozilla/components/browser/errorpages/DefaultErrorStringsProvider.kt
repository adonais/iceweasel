/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.errorpages

import android.content.Context
import mozilla.components.concept.engine.request.ErrorType
import mozilla.components.support.ktx.android.content.appName
import mozilla.components.ui.icons.R as iconsR

/**
 * Provide the default error strings and behaviour defined in this package.
 *
 * This includes special strings and behaviour for handling bad certificates ([ErrorType.ERROR_SECURITY_BAD_CERT]) and
 * bad HSTS configurations ([ErrorType.ERROR_BAD_HSTS_CERT]), and special strings for searching for "archived" versions
 * of some web pages.
 */
open class DefaultErrorStringsProvider : ErrorStringsProvider {
    /**
     * Maps an [ErrorType] to the standard strings provided by this component. This is the default
     * `errorStringsProvider` for [ErrorPages.createUrlEncodedErrorPage]; consumers can provide their own mapping
     * function to customize the strings.
     *
     * @param uri The URL that failed to load. Some messages name the failed URL, so this is passed as a format
     *   argument.
     */
    override fun errorStringsFor(context: Context, errorType: ErrorType, uri: String?): ErrorStrings =
        when (errorType) {
            ErrorType.UNKNOWN ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_generic_title),
                    message = context.getString(R.string.mozac_browser_errorpages_generic_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_SECURITY_SSL ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_security_ssl_title),
                    message = context.getString(R.string.mozac_browser_errorpages_security_ssl_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_lock),
                )

            ErrorType.ERROR_SECURITY_BAD_CERT ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_title),
                    message = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_lock),
                )

            ErrorType.ERROR_NET_INTERRUPT ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_net_interrupt_title),
                    message = context.getString(R.string.mozac_browser_errorpages_net_interrupt_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_eye_roll),
                )

            ErrorType.ERROR_NET_TIMEOUT ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_net_timeout_title),
                    message = context.getString(R.string.mozac_browser_errorpages_net_timeout_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_asleep),
                )

            ErrorType.ERROR_CONNECTION_REFUSED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_connection_failure_title),
                    message = context.getString(R.string.mozac_browser_errorpages_connection_failure_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_LOCAL_NETWORK_ACCESS_DENIED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_connection_failure_title),
                    message = context.getString(R.string.mozac_browser_errorpages_connection_failure_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_UNKNOWN_SOCKET_TYPE ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_unknown_socket_type_title),
                    message = context.getString(R.string.mozac_browser_errorpages_unknown_socket_type_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_REDIRECT_LOOP ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_redirect_loop_title),
                    message = context.getString(R.string.mozac_browser_errorpages_redirect_loop_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_surprised),
                )

            ErrorType.ERROR_OFFLINE ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_offline_title),
                    message = context.getString(R.string.mozac_browser_errorpages_offline_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_no_internet),
                )

            ErrorType.ERROR_PORT_BLOCKED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_port_blocked_title),
                    message = context.getString(R.string.mozac_browser_errorpages_port_blocked_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_lock),
                )

            ErrorType.ERROR_NET_RESET ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_net_reset_title),
                    message = context.getString(R.string.mozac_browser_errorpages_net_reset_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_unplugged),
                )

            ErrorType.ERROR_UNSAFE_CONTENT_TYPE ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_unsafe_content_type_title),
                    message = context.getString(R.string.mozac_browser_errorpages_unsafe_content_type_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_inspect),
                )

            ErrorType.ERROR_CORRUPTED_CONTENT ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_corrupted_content_title),
                    message = context.getString(R.string.mozac_browser_errorpages_corrupted_content_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_shred_file),
                )

            ErrorType.ERROR_CONTENT_CRASHED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_content_crashed_title),
                    message = context.getString(R.string.mozac_browser_errorpages_content_crashed_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_surprised),
                )

            ErrorType.ERROR_INVALID_CONTENT_ENCODING ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_invalid_content_encoding_title),
                    message = context.getString(R.string.mozac_browser_errorpages_invalid_content_encoding_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_surprised),
                )

            ErrorType.ERROR_UNKNOWN_HOST ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_unknown_host_title),
                    message = context.getString(R.string.mozac_browser_errorpages_unknown_host_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_NO_INTERNET ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_no_internet_title_2),
                    message = context.getString(R.string.mozac_browser_errorpages_no_internet_message_2),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_no_internet_refresh_button),
                    imageName = context.getString(iconsR.string.mozac_error_no_internet_connection),
                    errorCode = context.getString(R.string.mozac_browser_errorpages_no_internet_error_code),
                )

            ErrorType.ERROR_MALFORMED_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_malformed_uri_title),
                    message = context.getString(R.string.mozac_browser_errorpages_malformed_uri_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_UNKNOWN_PROTOCOL ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_unknown_protocol_title),
                    message = context.getString(R.string.mozac_browser_errorpages_unknown_protocol_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_FILE_NOT_FOUND ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_file_not_found_title),
                    message = context.getString(R.string.mozac_browser_errorpages_file_not_found_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_FILE_ACCESS_DENIED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_file_access_denied_title),
                    message = context.getString(R.string.mozac_browser_errorpages_file_access_denied_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_question_file),
                )

            ErrorType.ERROR_PROXY_CONNECTION_REFUSED ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_proxy_connection_refused_title),
                    message = context.getString(R.string.mozac_browser_errorpages_proxy_connection_refused_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_confused),
                )

            ErrorType.ERROR_UNKNOWN_PROXY_HOST ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_unknown_proxy_host_title),
                    message = context.getString(R.string.mozac_browser_errorpages_unknown_proxy_host_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_unplugged),
                )

            ErrorType.ERROR_SAFEBROWSING_MALWARE_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_safe_browsing_malware_uri_title),
                    message =
                        context.getString(
                            R.string.mozac_browser_errorpages_safe_browsing_malware_uri_message,
                            uri,
                        ),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_SAFEBROWSING_UNWANTED_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_safe_browsing_unwanted_uri_title),
                    message =
                        context.getString(
                            R.string.mozac_browser_errorpages_safe_browsing_unwanted_uri_message,
                            uri,
                        ),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_SAFEBROWSING_HARMFUL_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_safe_harmful_uri_title),
                    message = context.getString(R.string.mozac_browser_errorpages_safe_harmful_uri_message, uri),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_SAFEBROWSING_PHISHING_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_safe_phishing_uri_title),
                    message = context.getString(R.string.mozac_browser_errorpages_safe_phishing_uri_message, uri),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_HARMFULADDON_URI ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_harmful_addon_uri_title),
                    message = context.getString(R.string.mozac_browser_errorpages_harmful_addon_uri_message, uri),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                )

            ErrorType.ERROR_HTTPS_ONLY ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_httpsonly_title),
                    message = context.getString(R.string.mozac_browser_errorpages_httpsonly_message, uri),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_lock),
                )

            ErrorType.ERROR_BAD_HSTS_CERT ->
                ErrorStrings(
                    title = context.getString(R.string.mozac_browser_errorpages_security_bad_hsts_cert_title),
                    message = context.getString(R.string.mozac_browser_errorpages_security_bad_hsts_cert_message),
                    refreshButton = context.getString(R.string.mozac_browser_errorpages_page_refresh),
                    imageName = context.getString(iconsR.string.mozac_error_lock),
                )
        }

    override fun badCertDetailsFor(context: Context, errorType: ErrorType, uri: String?): BadCertDetails? =
        when (errorType) {
            ErrorType.ERROR_SECURITY_BAD_CERT ->
                BadCertDetails(
                    badCertAdvanced = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_advanced),
                    badCertTechInfo =
                        context.getString(
                            R.string.mozac_browser_errorpages_security_bad_cert_techInfo,
                            context.appName,
                            uri,
                        ),
                    badCertGoBack = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_back),
                    badCertAcceptTemporary =
                        context.getString(R.string.mozac_browser_errorpages_security_bad_cert_accept_temporary),
                )

            ErrorType.ERROR_BAD_HSTS_CERT ->
                BadCertDetails(
                    badCertAdvanced = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_advanced),
                    badCertTechInfo =
                        context.getString(
                            R.string.mozac_browser_errorpages_security_bad_hsts_cert_techInfo2,
                            uri,
                            context.appName,
                        ),
                    badCertGoBack = context.getString(R.string.mozac_browser_errorpages_security_bad_cert_back),
                    badCertAcceptTemporary =
                        context.getString(R.string.mozac_browser_errorpages_security_bad_cert_accept_temporary),
                )

            else -> null
        }

    override fun archiveDetailsFor(context: Context, errorType: ErrorType, uri: String?): ArchiveDetails? {
        val waybackMachineLabel = context.getString(R.string.mozac_browser_errorpages_archive_wayback_machine)
        return ArchiveDetails(
            archiveCheckButtonLabel = context.getString(R.string.mozac_browser_errorpages_archive_check_button),
            archiveCheckingLabel = context.getString(R.string.mozac_browser_errorpages_archive_checking),
            archiveDescriptionMessage =
                context.getString(
                    R.string.mozac_browser_errorpages_archive_description,
                    context.appName,
                    waybackMachineLabel,
                ),
            waybackMachineLabel,
            archiveNotFoundMessage = context.getString(R.string.mozac_browser_errorpages_archive_not_found),
            archiveSearchWebLabel = context.getString(R.string.mozac_browser_errorpages_archive_search_web),
            archiveUnreachableMessage = context.getString(R.string.mozac_browser_errorpages_archive_unreachable),
            archiveRetryLabel = context.getString(R.string.mozac_browser_errorpages_archive_retry),
        )
    }

    override fun continueHttpDetailsFor(context: Context, errorType: ErrorType, uri: String?): ContinueHttpDetails? =
        ContinueHttpDetails(
            continueHttpButton = context.getString(R.string.mozac_browser_errorpages_httpsonly_button),
            backFromHttpButton = context.getString(R.string.mozac_browser_errorpages_httpsonly_back),
        )
}
