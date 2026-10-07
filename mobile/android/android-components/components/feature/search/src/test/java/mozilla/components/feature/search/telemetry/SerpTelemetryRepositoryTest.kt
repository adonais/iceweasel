/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.search.telemetry

import kotlinx.coroutines.runBlocking
import mozilla.appservices.RustComponentsInitializer
import mozilla.appservices.remotesettings.RemoteSettingsClient
import mozilla.appservices.remotesettings.RemoteSettingsRecord
import mozilla.appservices.remotesettings.RemoteSettingsServer
import mozilla.appservices.remotesettings.RemoteSettingsService
import mozilla.components.support.remotesettings.RemoteSettingsService as MozillaRemoteSettingsService
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.`when`
import org.robolectric.RobolectricTestRunner

private const val SEARCH_TELEMETRY_COLLECTION_NAME = "search-telemetry-v2"

@RunWith(RobolectricTestRunner::class)
class SerpTelemetryRepositoryTest {

    private lateinit var mockMozillaService: MozillaRemoteSettingsService
    private lateinit var mockRemoteSettingsService: RemoteSettingsService
    private lateinit var mockRemoteSettingsClient: RemoteSettingsClient
    private lateinit var serpTelemetryRepository: SerpTelemetryRepository

    private fun record(id: String, telemetryId: String) =
        RemoteSettingsRecord(
            id,
            40u,
            false,
            null,
            JSONObject(
                """{
      "schema": 1,
      "taggedCodes": [],
      "telemetryId": "$telemetryId",
      "organicCodes": [],
      "codeParamName": "bar",
      "queryParamNames": [],
      "searchPageRegexp": "^https://(?:m|www)\\.foo\\.baz",
      "followOnParamNames": [],
      "extraAdServersRegexps": [],
      "last_modified": 40
    }"""
            ),
        )

    @Before
    fun setup() {
        mockMozillaService = mock()
        mockRemoteSettingsService = mock()
        mockRemoteSettingsClient = mock()

        `when`(mockMozillaService.remoteSettingsService).thenReturn(mockRemoteSettingsService)
        `when`(mockRemoteSettingsService.makeClient("test")).thenReturn(mockRemoteSettingsClient)

        serpTelemetryRepository =
            SerpTelemetryRepository(
                collectionName = "test",
                remoteSettingsService = mockMozillaService,
            )
    }

    @Test
    fun `GIVEN the collection packaged with application-services WHEN updateProviderList is called THEN every record is parsed`() =
        runBlocking {
            RustComponentsInitializer.init()
            val service = MozillaRemoteSettingsService(context = testContext, server = RemoteSettingsServer.Prod)
            val packagedRecords =
                service.remoteSettingsService.makeClient(SEARCH_TELEMETRY_COLLECTION_NAME).getRecords()

            val result =
                SerpTelemetryRepository(
                        collectionName = SEARCH_TELEMETRY_COLLECTION_NAME,
                        remoteSettingsService = service,
                    )
                    .updateProviderList()

            assertFalse(packagedRecords.isNullOrEmpty())
            assertEquals(packagedRecords!!.size, result.size)
            assertTrue(result.any { it.telemetryId == "google" })
        }

    @Test
    fun `GIVEN an empty response WHEN updateProviderList is called THEN an empty list is returned`() = runBlocking {
        `when`(mockRemoteSettingsClient.getRecords()).thenReturn(emptyList<RemoteSettingsRecord>())

        assertTrue(serpTelemetryRepository.updateProviderList().isEmpty())
    }

    @Test
    fun `GIVEN no response WHEN updateProviderList is called THEN an empty list is returned`() = runBlocking {
        `when`(mockRemoteSettingsClient.getRecords()).thenReturn(null)

        assertTrue(serpTelemetryRepository.updateProviderList().isEmpty())
    }

    @Test
    fun `GIVEN a record that cannot be parsed WHEN updateProviderList is called THEN it is skipped`() = runBlocking {
        `when`(mockRemoteSettingsClient.getRecords())
            .thenReturn(
                listOf(
                    RemoteSettingsRecord("1", 40u, false, null, JSONObject()),
                    record("2", "2"),
                )
            )

        val result = serpTelemetryRepository.updateProviderList()

        assertEquals(1, result.size)
        assertEquals("2", result[0].telemetryId)
    }

    @Test
    fun `GIVEN the client throws WHEN updateProviderList is called THEN an empty list is returned`() = runBlocking {
        `when`(mockRemoteSettingsClient.getRecords()).thenThrow(IllegalStateException("no records"))

        assertTrue(serpTelemetryRepository.updateProviderList().isEmpty())
    }
}
