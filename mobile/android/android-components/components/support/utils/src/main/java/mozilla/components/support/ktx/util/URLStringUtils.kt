/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.ktx.util

import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.util.Patterns
import androidx.annotation.VisibleForTesting
import androidx.core.net.toUri
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.regex.Pattern

object URLStringUtils {
    /**
     * Determine whether a string is a URL.
     *
     * This method performs a lenient check to determine whether a string is a URL. Anything that contains a :, ://, or
     * . and has no internal spaces is potentially a URL. HTTP/S URLs may also contain spaces outside the authority,
     * such as in a path, query, or fragment.
     */
    fun isURLLike(string: String) = isURLLenient.matcher(string).matches() || isHttpOrHttpsURLLike(string)

    /** Whether [string] is an HTTP/S or scheme-less URL, allowing spaces in its path, query or fragment. */
    private fun isHttpOrHttpsURLLike(string: String): Boolean {
        val trimmedInput = string.trim()
        val authority = trimmedInput.substring(0, authorityLength(trimmedInput))
        if (' ' in authority || !isURLLenient.matcher(trimmedInput.replace(" ", "%20")).matches()) return false

        val schemeEnd = authority.indexOf(SCHEME_SEPARATOR)
        if (schemeEnd >= 0) {
            val scheme = authority.substring(0, schemeEnd)
            return scheme.equals("http", ignoreCase = true) || scheme.equals("https", ignoreCase = true)
        }
        // Without "://", as in desktop's URIFixup, spaces mean a search unless the input has a port, an IP address as
        // its host, or a "?" or "#" after its first "/".
        return authority.startsWith('[') ||
            possiblyHostPort.matcher(trimmedInput).find() ||
            (':' !in authority && (ipv4Like.matches(authority) || hasQueryOrFragmentAfterSlash(trimmedInput)))
    }

    private fun hasQueryOrFragmentAfterSlash(input: String): Boolean {
        val slash = input.indexOf('/')
        return slash != -1 && input.indexOfAny(charArrayOf('?', '#'), slash) != -1
    }

    /**
     * Determine whether a string is a search term.
     *
     * This method recognizes a string as a search term as anything other than a URL.
     */
    fun isSearchTerm(string: String) = !isURLLike(string)

    /** Normalizes a URL String, encoding the spaces after the authority of an HTTP/S URL as `%20`. */
    fun toNormalizedURL(string: String): String {
        val trimmedInput = string.trim()
        var uri = trimmedInput.toUri()
        if (TextUtils.isEmpty(uri.scheme)) {
            uri = "http://$trimmedInput".toUri()
        } else {
            uri = uri.normalizeScheme()
        }
        return encodeSpacesAfterAuthority(uri.toString())
    }

    /** Encodes the spaces in the path, query and fragment of an HTTP/S [url] as `%20`. Other URLs are unchanged. */
    fun encodeSpacesAfterAuthority(url: String): String {
        if (!url.startsWith(HTTP, ignoreCase = true) && !url.startsWith(HTTPS, ignoreCase = true)) return url
        val tailStart = authorityLength(url)
        return url.substring(0, tailStart) + url.substring(tailStart).replace(" ", "%20")
    }

    /** Length of the scheme and the authority of [url], i.e. where its path, query or fragment starts. */
    private fun authorityLength(url: String): Int {
        val schemeEnd = url.indexOf(SCHEME_SEPARATOR)
        // A "://" in the path, query or fragment, e.g. in a redirect parameter, does not end a scheme.
        val hasScheme = schemeEnd != -1 && url.indexOfAny(tailDelimiters) !in 0 until schemeEnd
        val start = if (hasScheme) schemeEnd + SCHEME_SEPARATOR.length else 0
        val tailStart = url.indexOfAny(tailDelimiters, start)
        return if (tailStart == -1) url.length else tailStart
    }

    private val tailDelimiters = charArrayOf('/', '?', '#')

    private val isURLLenient by lazy {
        // Be lenient about what is classified as potentially a URL.
        // (\w+-+)*[\w\[]+(://[/]*|:|\.)(\w+-+)*[\w\[:]+([\S&&[^\w-]]\S*)?
        // --------                     --------
        // 0 or more pairs of consecutive word letters or dashes
        //         -------                      --------
        // followed by at least a single word letter or [ipv6::] character.
        // ---------------              ----------------
        // Combined, that means "w", "w-w", "w-w-w", etc match, but "w-", "w-w-", "w-w-w-" do not.
        //                --------------
        // That surrounds :, :// or .
        //                                                               -
        // At the end, there may be an optional
        //                                               ------------
        // non-word, non-- but still non-space character (e.g., ':', '/', '.', '?' but not 'a', '-', '\t')
        //                                                           ---
        // and 0 or more non-space characters.
        //
        // These are some (odd) examples of valid urls according to this pattern:
        // c-c.com
        // c-c-c-c.c-c-c
        // c-http://c.com
        // about-mozilla:mozilla
        // c-http.d-x
        // www.c-
        // 3-3.3
        // www.c-c.-
        //
        // There are some examples of non-URLs according to this pattern:
        // -://x.com
        // -x.com
        // http://www-.com
        // www.c-c-
        // 3-3
        Pattern.compile(
            "^\\s*(\\w+-+)*[\\w\\[]+(://[/]*|:|\\.)(\\w+-+)*[\\w\\[:]+([\\S&&[^\\w-]]\\S*)?\\s*$",
            flags,
        )
    }

    // Mirrors possiblyHostPortRegex in docshell/base/URIFixup.sys.mjs.
    private val possiblyHostPort by lazy {
        Pattern.compile("^[a-z0-9-]+(\\.[a-z0-9-]+)*:[0-9]{1,5}([/?#]|$)", Pattern.CASE_INSENSITIVE)
    }

    // Mirrors IPv4LikeRegex in docshell/base/URIFixup.sys.mjs, which also accepts a shorthand with two dots.
    private val ipv4Like by lazy { Regex("(\\d{1,3}\\.){2,3}\\d{1,3}") }

    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE) internal const val UNICODE_CHARACTER_CLASS: Int = 0x100

    // To run tests on a non-Android device (like a computer), Pattern.compile
    // requires a flag to enable unicode support. Set a value like flags here with a local
    // copy of UNICODE_CHARACTER_CLASS. Use a local copy because that constant is not
    // available on Android platforms < 24 (Fenix targets 21). At runtime this is not an issue
    // because, again, Android REs are always unicode compliant.
    // NB: The value has to go through an intermediate variable; otherwise, the linter will
    // complain that this value is not one of the predefined enums that are allowed.
    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE) internal var flags = 0

    private const val SCHEME_SEPARATOR = "://"
    private const val HTTP = "http://"
    private const val HTTPS = "https://"
    private const val WWW = "www."

    /**
     * Generates a shorter version of the provided URL for display purposes by applying the lossless formatting of
     * [toLosslessDisplayUrl] and then stripping it of https/http and/or WWW prefixes and/or trailing slash when
     * applicable.
     *
     * Any spans already set on [originalUrl] are preserved.
     */
    fun toDisplayUrl(originalUrl: CharSequence): CharSequence =
        maybeStripTrailingSlash(maybeStripUrlProtocol(losslessFormat(originalUrl, decodeSpaces = false)))

    private fun maybeStripUrlProtocol(url: CharSequence): CharSequence {
        if (url.startsWith(HTTPS)) {
            return maybeStripUrlSubDomain(url.removePrefix(HTTPS))
        } else if (url.startsWith(HTTP)) {
            return maybeStripUrlSubDomain(url.removePrefix(HTTP))
        }
        return url
    }

    private fun maybeStripUrlSubDomain(url: CharSequence): CharSequence = url.removePrefix(WWW)

    private fun maybeStripTrailingSlash(url: CharSequence): CharSequence {
        return url.trimEnd('/')
    }

    private const val ESCAPE_LENGTH = 3
    private const val HEX_RADIX = 16

    private val nestedReservedEscape = Regex("%25(?:3B|2F|3F|3A|40|26|3D|2B|24|2C|23)", RegexOption.IGNORE_CASE)
    private val malformedEscape = Regex("%(?![0-9a-f]{2})", RegexOption.IGNORE_CASE)

    // decodeURI's reserved characters, plus `%`, which could start a new escape, and `\`, which URLs read as `/`.
    private val decodableEscapes =
        Regex("(?:%(?!3B|2F|3F|3A|40|26|3D|2B|24|2C|23|25|5C)[0-9a-f]{2})+", RegexOption.IGNORE_CASE)
    private val invisibleCharacters = Regex("""[\p{Z}\p{Cc}\u2800\uFFFC&&[^\u0020]]|\u0020(?=[\p{C}\p{Z}])|\s$""")
    private val unsafeCharacters =
        Regex(
            """[\p{Cf}&&[^\u200C\u200D]]|[\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180D\u3164""" +
                """\uFE00-\uFE0F\uFFA0\uFFF0-\uFFFB\p{Cn}\p{Co}\x{E0000}-\x{E0FFF}\x{1F50F}-\x{1F513}\x{1F6E1}]"""
        )

    /**
     * Decodes the path, query and fragment of an HTTP/S [url] when that is lossless, following desktop's
     * `losslessDecodeDisplaySpec`; spaces stay `%20`. Other URLs are returned unchanged. Meant for URLs the browser
     * owns, not for text the user typed.
     */
    fun toLosslessDisplayUrl(url: String): String = losslessFormat(url, decodeSpaces = false).toString()

    /** Same as [toLosslessDisplayUrl] but also decodes the spaces that can be shown, for an editable address bar. */
    fun toLosslessEditableUrl(url: String): String = losslessFormat(url, decodeSpaces = true).toString()

    private fun losslessFormat(url: CharSequence, decodeSpaces: Boolean): CharSequence {
        val original = url.toString()
        if (!original.startsWith(HTTP, ignoreCase = true) && !original.startsWith(HTTPS, ignoreCase = true)) return url
        val tailStart = authorityLength(original).takeIf { it < original.length } ?: return url

        val tail = original.substring(tailStart)
        val decoded = decodeTail(tail, decodeSpaces)
        return when {
            decoded == tail -> url
            // Only the tail changes, so spans on the authority keep their indexes.
            url is Spanned -> SpannableStringBuilder(url).replace(tailStart, url.length, decoded)
            else -> original.substring(0, tailStart) + decoded
        }
    }

    private fun decodeTail(tail: String, decodeSpaces: Boolean): String {
        val decoded = if (nestedReservedEscape.containsMatchIn(tail)) tail else decodeUri(tail)
        val visible = invisibleCharacters.replace(decoded) { escape(it.value) }
        val safe = unsafeCharacters.replace(visible) { escape(it.value) }
        return if (decodeSpaces) safe else safe.replace(" ", "%20")
    }

    private fun decodeUri(value: String): String {
        if (malformedEscape.containsMatchIn(value)) return value
        val decoder =
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
        return try {
            decodableEscapes.replace(value) { match ->
                val bytes =
                    ByteArray(match.value.length / ESCAPE_LENGTH) { index ->
                        val start = index * ESCAPE_LENGTH + 1
                        match.value.substring(start, start + 2).toInt(HEX_RADIX).toByte()
                    }
                decoder.decode(ByteBuffer.wrap(bytes)).toString()
            }
        } catch (_: CharacterCodingException) {
            value
        }
    }

    private fun escape(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    /** Determines whether a string is http or https URL */
    fun isHttpOrHttps(url: String): Boolean {
        return !TextUtils.isEmpty(url) && (url.startsWith("http:") || url.startsWith("https:"))
    }

    /** Determine whether a string is a valid search query URL. */
    fun isValidSearchQueryUrl(url: String): Boolean {
        var trimmedUrl = url.trim()
        if (!trimmedUrl.matches("^.+?://.+?".toRegex())) {
            // UI hint url doesn't have http scheme, so add it if necessary
            trimmedUrl = "http://$trimmedUrl"
        }
        val isNetworkUrl = isHttpOrHttps(trimmedUrl)
        val containsToken = trimmedUrl.contains("%s")
        return isNetworkUrl && containsToken
    }

    /** Determines whether a string is a valid host. */
    fun isValidHost(host: String): Boolean = host.isNotBlank() && Patterns.WEB_URL.matcher(host).matches()
}
