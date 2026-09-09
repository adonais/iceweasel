/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import kotlin.test.assertIs
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.android.NotificationsDelegate
import mozilla.components.support.test.fakes.engine.FakeEngine
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PrivacyReportWorkerFactoryTest {

    private val factory =
        PrivacyReportWorkerFactory(
            settings = Settings(testContext),
            trackingProtectionUseCases = TrackingProtectionUseCases(BrowserStore(), FakeEngine()),
            notificationsDelegate = NotificationsDelegate(NotificationManagerCompat.from(testContext)),
        )

    @Test
    fun `GIVEN the PrivacyReportNotificationWorker class name WHEN createWorker is called THEN it builds a PrivacyReportNotificationWorker`() {
        val workerParameters = buildWorkerParameters()

        val worker =
            factory.createWorker(
                testContext,
                PrivacyReportNotificationWorker::class.java.name,
                workerParameters,
            )

        assertIs<PrivacyReportNotificationWorker>(worker)
    }

    @Test
    fun `GIVEN an unrecognized worker class name WHEN createWorker is called THEN it returns null`() {
        val workerParameters = buildWorkerParameters()

        val worker = factory.createWorker(testContext, "unrelated.WorkerClassName", workerParameters)

        assertNull(worker)
    }

    /**
     * [WorkerParameters] has no public constructor, so a real instance is obtained the same way
     * [TestListenableWorkerBuilder] does it internally: build a worker via a capturing [WorkerFactory] and keep the
     * [WorkerParameters] it was handed.
     */
    private fun buildWorkerParameters(): WorkerParameters {
        lateinit var capturedParameters: WorkerParameters

        TestListenableWorkerBuilder<PrivacyReportNotificationWorker>(testContext)
            .setWorkerFactory(
                object : WorkerFactory() {
                    override fun createWorker(
                        appContext: Context,
                        workerClassName: String,
                        workerParameters: WorkerParameters,
                    ): ListenableWorker {
                        capturedParameters = workerParameters
                        return factory.createWorker(appContext, workerClassName, workerParameters)!!
                    }
                }
            )
            .build()

        return capturedParameters
    }
}
