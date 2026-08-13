/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.messaging

import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.MessagingAction
import org.mozilla.fenix.helpers.lifecycle.TestLifecycleOwner

class MessagingFeatureTest {

    @Test
    fun `WHEN onResume is called THEN evaluate message`() = runTest {
        val appStore: AppStore = spyk(AppStore())
        val lifecycleOwner = TestLifecycleOwner()
        val binding = MessagingFeature(
            appStore = appStore,
            surface = FenixMessageSurfaceId.HOMESCREEN,
        )

        binding.onResume(lifecycleOwner)
        testScheduler.advanceUntilIdle()

        verify { appStore.dispatch(MessagingAction.Evaluate(FenixMessageSurfaceId.HOMESCREEN)) }
    }
}
