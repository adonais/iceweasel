/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.helpers

import android.util.Log
import mockwebserver3.MockWebServer
import mozilla.components.support.android.test.rules.AndroidAssetDispatcher
import org.junit.rules.ExternalResource
import org.mozilla.fenix.helpers.Constants.TAG

/**
 * A JUnit [ExternalResource] that manages the lifecycle of a [MockWebServer] instance backed
 * by an [AndroidAssetDispatcher].
 *
 * The server will be started before each test and closed after each test.
 */
class MockWebServerRule : ExternalResource() {

    lateinit var server: MockWebServer
        private set

    override fun before() {
        server = MockWebServer().apply {
            dispatcher = AndroidAssetDispatcher()
        }
        try {
            Log.i(TAG, "MockWebServerRule: Starting mockWebServer")
            server.start()
        } catch (e: Exception) {
            Log.i(TAG, "MockWebServerRule: Exception caught, re-starting mockWebServer")
            server.close()
            server.start()
        }
    }

    override fun after() {
        if (::server.isInitialized) {
            server.close()
        }
    }
}
