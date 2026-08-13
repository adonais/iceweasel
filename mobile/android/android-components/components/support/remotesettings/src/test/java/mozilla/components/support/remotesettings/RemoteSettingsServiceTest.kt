/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.remotesettings

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.appservices.RustComponentsInitializer
import mozilla.appservices.remotesettings.RemoteSettingsServer
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertNotNull
import mozilla.appservices.remotesettings.RemoteSettingsService as AppServicesRemoteSettingsService

@RunWith(AndroidJUnit4::class)
class RemoteSettingsServiceTest {
    @Test
    fun `GIVEN a service WHEN the lazy app-services service is accessed THEN it is initialized with telemetry`() {
        RustComponentsInitializer.init()

        val service = RemoteSettingsService(
            context = testContext,
            server = RemoteSettingsServer.Prod,
        )

        val appServicesService: AppServicesRemoteSettingsService = service.remoteSettingsService

        assertNotNull(appServicesService)
    }
}
