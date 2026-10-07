/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.engine.request

/**
 * Enum containing all supported error types that we can display an error page for. This defines the error categories
 * without any UI-specific details.
 */
enum class ErrorType {
    UNKNOWN,
    ERROR_SECURITY_SSL,
    ERROR_SECURITY_BAD_CERT,
    ERROR_NET_INTERRUPT,
    ERROR_NET_TIMEOUT,
    ERROR_CONNECTION_REFUSED,
    ERROR_LOCAL_NETWORK_ACCESS_DENIED,
    ERROR_UNKNOWN_SOCKET_TYPE,
    ERROR_REDIRECT_LOOP,
    ERROR_OFFLINE,
    ERROR_PORT_BLOCKED,
    ERROR_NET_RESET,
    ERROR_UNSAFE_CONTENT_TYPE,
    ERROR_CORRUPTED_CONTENT,
    ERROR_CONTENT_CRASHED,
    ERROR_INVALID_CONTENT_ENCODING,
    ERROR_UNKNOWN_HOST,
    ERROR_NO_INTERNET,
    ERROR_MALFORMED_URI,
    ERROR_UNKNOWN_PROTOCOL,
    ERROR_FILE_NOT_FOUND,
    ERROR_FILE_ACCESS_DENIED,
    ERROR_PROXY_CONNECTION_REFUSED,
    ERROR_UNKNOWN_PROXY_HOST,
    ERROR_SAFEBROWSING_MALWARE_URI,
    ERROR_SAFEBROWSING_UNWANTED_URI,
    ERROR_SAFEBROWSING_HARMFUL_URI,
    ERROR_SAFEBROWSING_PHISHING_URI,
    ERROR_HARMFULADDON_URI,
    ERROR_HTTPS_ONLY,
    ERROR_BAD_HSTS_CERT,
}
