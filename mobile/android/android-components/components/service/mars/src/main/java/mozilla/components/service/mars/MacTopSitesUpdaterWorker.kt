/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.mars

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.support.base.log.logger.Logger

/**
 * An implementation of [CoroutineWorker] to perform MAC top site updates.
 */
internal class MacTopSitesUpdaterWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val logger = Logger("MacTopSitesUpdaterWorker")

    @Suppress("TooGenericExceptionCaught")
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            MacTopSitesUseCases().refreshMacTopSites.invoke()
            Result.success()
        } catch (e: Exception) {
            logger.error("Failed to refresh MAC top sites", e)
            Result.failure()
        }
    }
}
