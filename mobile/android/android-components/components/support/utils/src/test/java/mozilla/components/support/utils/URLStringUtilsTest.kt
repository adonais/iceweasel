/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.utils

import android.text.SpannableString
import android.text.Spanned
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.ktx.util.URLStringUtils
import mozilla.components.support.ktx.util.URLStringUtils.isSearchTerm
import mozilla.components.support.ktx.util.URLStringUtils.isURLLike
import mozilla.components.support.ktx.util.URLStringUtils.toLosslessDisplayUrl
import mozilla.components.support.ktx.util.URLStringUtils.toLosslessEditableUrl
import mozilla.components.support.ktx.util.URLStringUtils.toNormalizedURL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class URLStringUtilsTest {

    @Before
    fun configurePatternFlags() {
        URLStringUtils.flags = URLStringUtils.UNICODE_CHARACTER_CLASS
    }

    @Test
    fun toNormalizedURL() {
        val expectedUrl = "http://mozilla.org"
        assertEquals(expectedUrl, toNormalizedURL("http://mozilla.org"))
        assertEquals(expectedUrl, toNormalizedURL("  http://mozilla.org  "))
        assertEquals(expectedUrl, toNormalizedURL("mozilla.org"))
        assertEquals(expectedUrl, toNormalizedURL("HTTP://mozilla.org"))
        assertEquals("file:///mnt/sdcard/", toNormalizedURL("file:///mnt/sdcard/"))
        assertEquals("http://mozilla.org", toNormalizedURL(" http://mozilla.org"))
        assertEquals("http://localhost", toNormalizedURL("localhost"))

        assertEquals(
            "https://www.mozilla.org/en-US/internet-health/",
            toNormalizedURL("https://www.mozilla.org/en-US/internet-health/"),
        )
    }

    @Test
    fun `toNormalizedURL encodes only the spaces after the authority of HTTP and HTTPS URLs`() {
        assertEquals("http://example.com/a%20b?q=c%20d#e%20f", toNormalizedURL("example.com/a b?q=c d#e f"))
        assertEquals("https://example.com/a%20b%2520", toNormalizedURL("https://example.com/a b%2520"))
        assertEquals("http://some words", toNormalizedURL("some words"))
        assertEquals("custom:a b", toNormalizedURL("custom:a b"))
    }

    @Test
    fun isUrlLike() {
        assertFalse(isURLLike("inurl:mozilla.org advanced search"))
        assertFalse(isURLLike("sf: help"))
        assertFalse(isURLLike("mozilla./~"))
        assertFalse(isURLLike("cnn.com politics"))

        assertTrue(isURLLike("about:config"))
        assertTrue(isURLLike("about:config:8000"))
        assertTrue(isURLLike("file:///home/user/myfile.html"))
        assertTrue(isURLLike("file://////////////home//user/myfile.html"))
        assertTrue(isURLLike("file://C:\\Users\\user\\myfile.html"))
        assertTrue(isURLLike("http://192.168.255.255"))
        assertTrue(isURLLike("link.unknown"))
        // Per https://bugs.chromium.org/p/chromium/issues/detail?id=31405, ICANN will accept
        // purely numeric gTLDs.
        assertTrue(isURLLike("3.14.2019"))
        assertTrue(isURLLike("3-four.14.2019"))
        assertTrue(isURLLike(" cnn.com "))
        assertTrue(isURLLike(" cnn.com"))
        assertTrue(isURLLike("cnn.com "))
        assertTrue(isURLLike("mozilla.com/~userdir"))
        assertTrue(isURLLike("my-domain.com"))
        assertTrue(isURLLike("http://faß.de//"))
        assertTrue(isURLLike("cnn.cơḿ"))
        assertTrue(isURLLike("cnn.çơḿ"))

        // Examples from the code comments:
        assertTrue(isURLLike("c-c.com"))
        assertTrue(isURLLike("c-c-c-c.c-c-c"))
        assertTrue(isURLLike("c-http://c.com"))
        assertTrue(isURLLike("about-mozilla:mozilla"))
        assertTrue(isURLLike("c-http.d-x"))
        assertTrue(isURLLike("www.c.-"))
        assertTrue(isURLLike("3-3.3"))
        assertTrue(isURLLike("www.c-c.-"))

        assertFalse(isURLLike(" -://x.com "))
        assertFalse(isURLLike("  -x.com"))
        assertFalse(isURLLike("http://www-.com"))
        assertFalse(isURLLike("www.c-c-  "))
        assertFalse(isURLLike("3-3 "))

        // Valid IPv6 literals correctly recognized as valid.
        val validIPv6Literals =
            listOf(
                "[::]",
                "[::1]",
                "[1::]",
                "[1:2:3:4:5:6:7:8]",
                "[2001:db8::1.2.3.4]",
                "[::1]:8080",
            )

        validIPv6Literals.forEach { url ->
            assertTrue(isURLLike(url))
            assertTrue(isURLLike("$url/"))
            assertTrue(isURLLike("https://$url"))
            assertTrue(isURLLike("https://$url/"))
            assertTrue(isURLLike("https:$url"))
            assertTrue(isURLLike("https:$url/"))
            assertTrue(isURLLike("http://$url"))
            assertTrue(isURLLike("http://$url/"))
            assertTrue(isURLLike("http:$url"))
            assertTrue(isURLLike("http:$url/"))
        }

        // Invalid IPv6 literals correctly recognized as invalid.
        assertFalse(isURLLike("::1"))
        assertFalse(isURLLike(":::"))
        assertFalse(isURLLike("[[http://]]"))
        assertFalse(isURLLike("[[["))
        assertFalse(isURLLike("[[[:"))
        assertFalse(isURLLike("[[[:/"))
        assertFalse(isURLLike("http://]]]"))

        // Invalid IPv6 literals correctly recognized as something else.
        assertTrue(isURLLike("fe80::"))
        assertTrue(isURLLike("x:["))

        // Invalid IPv6 literals incorrectly recognized as valid.
        // We allow these for now, until bug 1685152 is fixed.
        assertTrue(isURLLike("[:::"))
        assertTrue(isURLLike("http://[::"))
        assertTrue(isURLLike("http://[::/path"))
        assertTrue(isURLLike("http://[::?query"))
        assertTrue(isURLLike("[[http://banana]]"))
        assertTrue(isURLLike("http://[[["))
        assertTrue(isURLLike("[[[::"))
        assertTrue(isURLLike("[[[::/"))
        assertTrue(isURLLike("http://[1.2.3]"))
        assertTrue(isURLLike("https://[1:2:3:4:5:6:7]/"))
        assertTrue(isURLLike("https://[1:2:3:4:5:6:7:8:9]/"))

        // Examples from issues
        assertTrue(isURLLike("https://abc--cba.com/")) // #7096
    }

    @Test
    fun `HTTP paths queries and fragments accept spaces without changing host classification`() {
        listOf(
                "http://example.com/a b",
                "https://example.com/?q=hello world",
                "https://example.com/#section one",
                "example.com/?q=hello world",
                "example.com/a#section one",
                "127.0.0.1/a b",
                "localhost:8000/a b",
                "127.0.0.1:8000/a b",
                "[::1]:8000/a b",
                "example.com:8000/a b",
                "my.app:443/a b",
                "https://例え.テスト/日本 語?q=한 글#café au lait",
                "https://example.com/a%2Fb/%2520?q=a+b%2Bc d",
                "example.com/r?u=https://other.example/a b",
                "https://example.com/r?u=https://other.example/a b",
            )
            .forEach { input ->
                assertTrue(input, isURLLike(input))
                assertFalse(input, isSearchTerm(input))
            }
        listOf(
                "some ordinary words",
                "intranet/a b",
                "example.com/a b",
                "example.unknown/a b",
                "例え.テスト/日本 語",
                "node.js/express tutorial",
                "3.5/5 stars",
                "vue.js/nuxt setup",
                "example.com some words",
                "https://exa mple.com/a",
                "https://example.com some words/a",
                "example.com some words?q=test",
                "example.com some words?u=https://other.example",
                "site:example.com/a b",
                "my.app:open data/a b",
                "tel:12345 67890",
                "javascript:alert('a b')",
                "data:text/plain,a b",
                "file:///a b",
                "https://example.com/a\tb",
                "https://example.com/a\nb",
            )
            .forEach { input ->
                assertFalse(input, isURLLike(input))
                assertTrue(input, isSearchTerm(input))
            }
    }

    @Test
    fun isSearchTerm() {
        assertTrue(isSearchTerm("inurl:mozilla.org advanced search"))
        assertTrue(isSearchTerm("sf: help"))
        assertTrue(isSearchTerm("mozilla./~"))
        assertTrue(isSearchTerm("cnn.com politics"))

        assertFalse(isSearchTerm("about:config"))
        assertFalse(isSearchTerm("about:config:8000"))
        assertFalse(isSearchTerm("file:///home/user/myfile.html"))
        assertFalse(isSearchTerm("file://////////////home//user/myfile.html"))
        assertFalse(isSearchTerm("file://C:\\Users\\user\\myfile.html"))
        assertFalse(isSearchTerm("http://192.168.255.255"))
        assertFalse(isSearchTerm("link.unknown"))
        // Per https://bugs.chromium.org/p/chromium/issues/detail?id=31405, ICANN will accept
        // purely numeric gTLDs.
        assertFalse(isSearchTerm("3.14.2019"))
        assertFalse(isSearchTerm("3-four.14.2019"))
        assertFalse(isSearchTerm(" cnn.com "))
        assertFalse(isSearchTerm(" cnn.com"))
        assertFalse(isSearchTerm("cnn.com "))
        assertFalse(isSearchTerm("my-domain.com"))
        assertFalse(isSearchTerm("camp-firefox.de"))
        assertFalse(isSearchTerm("http://my-domain.com"))
        assertFalse(isSearchTerm("mozilla.com/~userdir"))
        assertFalse(isSearchTerm("http://faß.de//"))
        assertFalse(isSearchTerm("cnn.cơḿ"))
        assertFalse(isSearchTerm("cnn.çơḿ"))

        // Examples from the code comments:
        assertFalse(isSearchTerm("c-c.com"))
        assertFalse(isSearchTerm("c-c-c-c.c-c-c"))
        assertFalse(isSearchTerm("c-http://c.com"))
        assertFalse(isSearchTerm("about-mozilla:mozilla"))
        assertFalse(isSearchTerm("c-http.d-x"))
        assertFalse(isSearchTerm("www.c.-"))
        assertFalse(isSearchTerm("3-3.3"))
        assertFalse(isSearchTerm("www.c-c.-"))

        assertTrue(isSearchTerm(" -://x.com "))
        assertTrue(isSearchTerm("  -x.com"))
        assertTrue(isSearchTerm("http://www-.com"))
        assertTrue(isSearchTerm("www.c-c-  "))
        assertTrue(isSearchTerm("3-3 "))

        // Examples from issues
        assertFalse(isSearchTerm("https://abc--cba.com/")) // #7096
    }

    @Test
    fun stripUrlSchemeUrlWithHttps() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("https://mozilla.com")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripTrailingSlash() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("mozilla.com/")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSchemeUrlWithHttpsAndTrailingSlash() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("https://mozilla.com/")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSchemeUrlWithHttp() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("http://mozilla.com")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSubdomainUrlWithHttps() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("https://www.mozilla.com")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSubdomainUrlWithHttp() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("http://www.mozilla.com")
        assertEquals("mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSchemeUrlWithHttpsFollowedByHttp() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("https://http://mozilla.com")
        assertEquals("http://mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSchemeUrlWithHttpFollowedByHttps() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("http://https://mozilla.com")
        assertEquals("https://mozilla.com", testDisplayUrl)
    }

    @Test
    fun stripUrlSchemeAndSubdomainUrlNoMatch() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("zzz://www.mozillahttp://.com")
        assertEquals("zzz://www.mozillahttp://.com", testDisplayUrl)
    }

    @Test
    fun toDisplayUrlDoesNotAddImplicitDirectionalMarks() {
        val testDisplayUrl = URLStringUtils.toDisplayUrl("http://ختار.ار/www.mozilla.org/1")
        assertEquals("ختار.ار/www.mozilla.org/1", testDisplayUrl)
    }

    @Test
    fun toDisplayUrlHandlesBlankStrings() {
        assertEquals("", URLStringUtils.toDisplayUrl(""))

        assertEquals("  ", URLStringUtils.toDisplayUrl("  "))
    }

    @Test
    fun isHttpOrHttpsUrl() {
        assertFalse(URLStringUtils.isHttpOrHttps(""))
        assertFalse(URLStringUtils.isHttpOrHttps("     "))
        assertFalse(URLStringUtils.isHttpOrHttps("mozilla.org"))
        assertFalse(URLStringUtils.isHttpOrHttps("httpstrf://example.org"))
        assertTrue(URLStringUtils.isHttpOrHttps("https://www.mozilla.org"))
        assertTrue(URLStringUtils.isHttpOrHttps("http://example.org"))
        assertTrue(URLStringUtils.isHttpOrHttps("http://192.168.0.1"))
    }

    @Test
    fun isValidSearchQueryUrl() {
        assertTrue(URLStringUtils.isValidSearchQueryUrl("https://example.com/search/?q=%s"))
        assertTrue(URLStringUtils.isValidSearchQueryUrl("http://example.com/search/?q=%s"))
        assertTrue(URLStringUtils.isValidSearchQueryUrl("http-test-site.com/search/?q=%s"))
        assertFalse(URLStringUtils.isValidSearchQueryUrl("httpss://example.com/search/?q=%s"))
        assertTrue(URLStringUtils.isValidSearchQueryUrl("example.com/search/?q=%s"))
        assertTrue(URLStringUtils.isValidSearchQueryUrl(" example.com/search/?q=%s "))
        assertFalse(URLStringUtils.isValidSearchQueryUrl("htps://example.com/search/?q=%s"))
    }

    @Test
    fun losslessFormattingMatchesFirefoxDesktopReferenceOutputs() {
        val stream = requireNotNull(javaClass.getResourceAsStream("/url-editing/firefox-desktop.tsv"))
        stream.bufferedReader().useLines { lines ->
            lines
                .filter { it.isNotEmpty() && !it.startsWith('#') }
                .forEach { line ->
                    val (source, expected) = line.split('\t')
                    assertEquals(source, expected, toLosslessEditableUrl(source))
                    assertEquals(source, expected.replace(" ", "%20"), toLosslessDisplayUrl(source))
                }
        }
    }

    @Test
    fun losslessFormattingKeepsDelimitersNestedEscapesAndPlusSigns() {
        listOf("/a%5Cb", "?next=https%3A%2F%2Fother.example%2Fa%3Fx%3D1%26y%3D2").forEach { suffix ->
            val url = "https://example.com$suffix"
            assertEquals(url, toLosslessEditableUrl(url))
        }
        val nestedEscape = toLosslessEditableUrl("https://example.com/%25%33%42")
        assertEquals("https://example.com/%253B", nestedEscape)
        assertEquals(nestedEscape, toLosslessEditableUrl(nestedEscape))
        assertEquals(
            "https://example.com/a+b?q=a+b%2Bc d",
            toLosslessEditableUrl("https://example.com/a+b?q=a+b%2Bc%20d"),
        )
    }

    @Test
    fun losslessFormattingEncodesLiteralInvisibleCharactersButKeepsJoiners() {
        assertEquals("https://example.com/a%20%20 b%20", toLosslessEditableUrl("https://example.com/a   b "))
        assertEquals(
            "https://example.com/a%E2%80%AEb%F0%9F%9B%A1",
            toLosslessEditableUrl("https://example.com/a\u202Eb\uD83D\uDEE1"),
        )
        assertEquals(
            "https://example.com/a\u200Cb\u200Dc",
            toLosslessEditableUrl("https://example.com/a%E2%80%8Cb%E2%80%8Dc"),
        )
    }

    @Test
    fun losslessFormattingNeverChangesAnAuthorityOrANonHttpUrl() {
        listOf("about:reader?url=https%3A%2F%2Fexample.com", "data:text/plain,%41", "javascript:%41").forEach {
            assertEquals(it, toLosslessEditableUrl(it))
        }
        assertEquals("https://example.com", toLosslessEditableUrl("https://example.com"))
        assertEquals(
            "https://%41:%42@xn--e1afmkfd.xn--p1ai/A",
            toLosslessEditableUrl("https://%41:%42@xn--e1afmkfd.xn--p1ai/%41"),
        )
    }

    @Test
    fun losslessFormattingOnlyGuardsOnNestedReservedEscapesInTheTail() {
        assertEquals(
            "https://%2540:%252F@example.com/A",
            toLosslessEditableUrl("https://%2540:%252F@example.com/%41"),
        )
        assertEquals(
            "https://%2540@example.com/%252F/%41",
            toLosslessEditableUrl("https://%2540@example.com/%252F/%41"),
        )
    }

    @Test
    fun toDisplayUrlAppliesLosslessFormattingAndKeepsSpans() {
        assertEquals(
            "example.com/тест%20file",
            URLStringUtils.toDisplayUrl("https://example.com/%D1%82%D0%B5%D1%81%D1%82%20file").toString(),
        )

        val marked = SpannableString("https://example.com/%D1%82%D0%B5%D1%81%D1%82")
        val span = Any()
        marked.setSpan(span, "https://".length, "https://example.com".length, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)

        val displayed = URLStringUtils.toDisplayUrl(marked)
        assertEquals("example.com/тест", displayed.toString())
        val spanned = displayed as Spanned
        assertEquals(0, spanned.getSpanStart(span))
        assertEquals("example.com".length, spanned.getSpanEnd(span))
    }
}
