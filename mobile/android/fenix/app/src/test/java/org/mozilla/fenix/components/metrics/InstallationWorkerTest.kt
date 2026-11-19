/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.metrics

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.lib.installation.blockstore.InstallBlockStore
import mozilla.components.lib.installation.blockstore.InstallState
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Installation
import org.mozilla.fenix.GleanMetrics.Pings
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class InstallationWorkerTest {

    @get:Rule val gleanTestRule = FenixGleanTestRule(testContext)

    private suspend fun TestScope.runWorker(
        runAttemptCount: Int = 0,
        recordAppOpen: suspend () -> Result<InstallState?>,
    ): ListenableWorker.Result =
        TestListenableWorkerBuilder<InstallationWorker>(testContext)
            .setWorkerFactory(
                object : WorkerFactory() {
                    override fun createWorker(
                        appContext: Context,
                        workerClassName: String,
                        workerParameters: WorkerParameters,
                    ) =
                        InstallationWorker(
                            appContext,
                            workerParameters,
                            FakeInstallBlockStore(recordAppOpen),
                            StandardTestDispatcher(testScheduler),
                        )
                }
            )
            .setRunAttemptCount(runAttemptCount)
            .build()
            .doWork()

    private fun date(date: String) = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date)

    private fun format(date: Date) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

    @Test
    fun `GIVEN a first install WHEN the worker runs THEN the installation ping is submitted with the install counter and without the last seen date`() =
        runTest {
            val job =
                Pings.installation.testBeforeNextSubmit {
                    assertEquals(1L, Installation.installCounter.testGetValue())
                    assertNull(Installation.lastSeenDate.testGetValue())
                }

            val result = runWorker { Result.success(InstallState(installCount = 1, previousLastSeenDate = null)) }

            job.join()
            assertEquals(ListenableWorker.Result.success(), result)
        }

    @Test
    fun `GIVEN a reinstall WHEN the worker runs THEN the installation ping is submitted with the install counter and last seen date`() =
        runTest {
            val job =
                Pings.installation.testBeforeNextSubmit {
                    assertEquals(3L, Installation.installCounter.testGetValue())
                    assertEquals("2026-09-01", format(Installation.lastSeenDate.testGetValue()!!))
                }

            val result = runWorker {
                Result.success(InstallState(installCount = 3, previousLastSeenDate = date("2026-09-01")))
            }

            job.join()
            assertEquals(ListenableWorker.Result.success(), result)
        }

    @Test
    fun `GIVEN the install was already recorded WHEN the worker runs THEN nothing is set and the installation ping is not submitted`() =
        runTest {
            var submitted = false
            Pings.installation.testBeforeNextSubmit { submitted = true }

            val result = runWorker { Result.success(null) }

            assertEquals(ListenableWorker.Result.success(), result)
            assertFalse(submitted)
            assertNull(Installation.installCounter.testGetValue())
            assertNull(Installation.lastSeenDate.testGetValue())
        }

    @Test
    fun `GIVEN recording fails WHEN the worker runs THEN nothing is set, the installation ping is not submitted and the work is retried`() =
        runTest {
            var submitted = false
            Pings.installation.testBeforeNextSubmit { submitted = true }

            val result = runWorker { Result.failure(IllegalStateException()) }

            assertEquals(ListenableWorker.Result.retry(), result)
            assertFalse(submitted)
            assertNull(Installation.installCounter.testGetValue())
            assertNull(Installation.lastSeenDate.testGetValue())
        }

    @Test
    fun `GIVEN recording fails and the retries are exhausted WHEN the worker runs THEN the work fails`() = runTest {
        val result =
            runWorker(runAttemptCount = InstallationMetricsService.MAX_RETRIES) {
                Result.failure(IllegalStateException())
            }

        assertEquals(ListenableWorker.Result.failure(), result)
    }

    private class FakeInstallBlockStore(private val recordAppOpen: suspend () -> Result<InstallState?>) :
        InstallBlockStore {
        override suspend fun recordAppOpen() = recordAppOpen.invoke()
    }
}
