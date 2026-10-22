/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.gecko

import kotlin.test.assertNotNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import mozilla.components.concept.engine.EngineSession.TrackingProtectionPolicy
import org.junit.Test
import org.mozilla.fenix.helpers.TestHelper

class CrashPullDelegateTest {

    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)

    @Test
    fun test_crash_pull_delegate_exists() {
        // scope.launch required to run in the correct thread for GeckoRuntime
        // but the test needs to wait on its completion to ensure assert is
        // verified, hence runBlocking.
        //
        // We cannot use runTestOnMain here because it looks not to be available.
        runBlocking {
            scope
                .launch {
                    val runtime =
                        GeckoProvider.getOrCreateRuntime(
                            context = TestHelper.appContext,
                            autofillStorage = lazy { throw UnsupportedOperationException() },
                            loginStorage = lazy { throw UnsupportedOperationException() },
                            trackingProtectionPolicy = TrackingProtectionPolicy.none(),
                            applicationScope = TestScope(),
                        )
                    assertNotNull(runtime.crashPullDelegate)
                    runtime.crashPullDelegate?.onCrashPull(arrayOf("1", "2"))
                }
                .join()
        }
    }
}
