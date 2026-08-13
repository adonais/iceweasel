/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.fetch.okhttp

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.Request
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.tooling.fetch.tests.FetchTestCases
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class OkHttpFetchTestCases : FetchTestCases() {

    override fun createNewClient(): Client = OkHttpClient(okhttp3.OkHttpClient(), testContext)

    // Inherits test methods from generic test suite base class

    @Test
    fun `fetch rejects a private request`() {
        assertFailsWith<IllegalArgumentException> {
            createNewClient().fetch(Request(url = "https://example.org", private = true))
        }
    }

    @Test
    fun `default User-Agent is sent when the request specifies none`() {
        val server = MockWebServer()
        server.enqueue(MockResponse())

        try {
            val client = createNewClient()
            runBlocking(Dispatchers.IO) {
                server.start()
                val response = client.fetch(Request(url = server.url("/").toString()))
                assertEquals(200, response.status)
                response.close()

                val userAgent = server.takeRequest().headers["User-Agent"]
                assertNotNull(userAgent)
                assertTrue(userAgent.startsWith("MozacFetch/"))
            }
        } finally {
            server.close()
        }
    }

    @Test
    fun `getOrCreateCache reuses a single Cache instance`() {
        assertSame(
            OkHttpClient.getOrCreateCache(testContext),
            OkHttpClient.getOrCreateCache(testContext),
        )
    }
}
