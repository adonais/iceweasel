/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.benchmark.utils

import mockwebserver3.MockWebServer
import mozilla.components.support.android.test.rules.AndroidAssetDispatcher
import org.junit.rules.ExternalResource

/**
 * A JUnit [ExternalResource] that manages the lifecycle of a [MockWebServer] instance.
 *
 * The server will be started before each test and closed after each test.
 *
 * The server is configured with a [Dispatcher] that will return Android assets in the body of
 * requests. If the dispatcher is unable to read a requested asset, it will return a 404 response.
 *
 * @param port The port to start the server on. If 0 (default) a random available port will be used.
 */
class MockWebServerRule(
    private val port: Int = 0,
) : ExternalResource() {

    lateinit var server: MockWebServer
        private set

    override fun before() {
        server = MockWebServer().apply {
            dispatcher = AndroidAssetDispatcher()
            start(this@MockWebServerRule.port)
        }
    }

    override fun after() {
        server.close()
    }
}
