/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.manager

import androidx.annotation.VisibleForTesting
import java.lang.ref.WeakReference
import java.util.concurrent.TimeUnit
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import mozilla.components.service.fxa.sync.RustSyncManager
import mozilla.components.service.fxa.sync.SyncStateStorage

/**
 * A singleton which exposes an instance of [FxaAccountManager] for internal consumption. Populated during
 * initialization of [FxaAccountManager]. This exists to allow various internal parts without a direct reference to an
 * instance of [FxaAccountManager] to notify it of encountered auth errors via [authError].
 */
internal object GlobalAccountManager {

    private var rustSyncManager: RustSyncManager? = null

    /** A [SyncStateStorage.Provider] to be used to create a [SyncStateStorage] */
    private var syncStorageProvider: SyncStateStorage.Provider? = null
    private var instance: WeakReference<FxaAccountManager>? = null
    private var lastAuthErrorCheckPoint: Long = 0L
    private var authErrorCountWithinWindow: Int = 0

    internal interface Clock {
        fun getTimeCheckPoint(): Long

        /** The [Instant] value representing the current system time. */
        fun now(): Instant
    }

    var systemClock: Clock =
        object : Clock {
            override fun getTimeCheckPoint(): Long {
                // nanoTime to decouple from wall-time.
                return TimeUnit.NANOSECONDS.toMillis(System.nanoTime())
            }

            override fun now(): Instant {
                return kotlin.time.Clock.System.now()
            }
        }
        private set

    internal fun setInstance(am: FxaAccountManager) {
        instance = WeakReference(am)
        lastAuthErrorCheckPoint = 0
        authErrorCountWithinWindow = 0
    }

    internal fun close() {
        instance = null
    }

    internal suspend fun authError(
        operation: String,
        forSync: Boolean = false,
        @VisibleForTesting clock: Clock = systemClock,
    ) {
        val authErrorCheckPoint: Long = clock.getTimeCheckPoint()

        val timeSinceLastAuthErrorMs: Long? =
            if (lastAuthErrorCheckPoint == 0L) {
                null
            } else {
                authErrorCheckPoint - lastAuthErrorCheckPoint
            }
        lastAuthErrorCheckPoint = authErrorCheckPoint

        if (timeSinceLastAuthErrorMs == null) {
            // First error, start our count.
            authErrorCountWithinWindow = 1
        } else if (timeSinceLastAuthErrorMs <= AUTH_CHECK_CIRCUIT_BREAKER_RESET_MS) {
            // In general, skip additional checks inside the `AUTH_CHECK_CIRCUIT_BREAKER_RESET_MS`.
            // This avoids queueing up multiple auth recovery checks when multiple operations run at
            // the same time and result in auth errors.
            //
            // The one exception is sync, which retries on a successful recovery.  In that case we
            // should to run through the recovery process to make sure the sync happens.
            if (!forSync) {
                return
            }
            // Error within the reset time window, increment the count.
            authErrorCountWithinWindow += 1
        } else {
            // Error outside the reset window, reset the count.
            authErrorCountWithinWindow = 1
        }

        instance?.get()?.encounteredAuthError(operation, authErrorCountWithinWindow)
    }

    internal fun requireAccountManager(): FxaAccountManager {
        return requireNotNull(instance?.get()) {
            "Trying to access the account manager without calling GlobalAccountManager.setInstance"
        }
    }

    /** Sets the [RustSyncManager] to be used for sync operations */
    internal fun setRustSyncManager(rustSyncManager: RustSyncManager) {
        this.rustSyncManager = rustSyncManager
    }

    /** Coroutine dispatcher that allows us to test the operation of sync */
    internal var syncIoDispatcher: CoroutineDispatcher = Dispatchers.IO

    internal fun requireRustSyncManager(): RustSyncManager {
        return requireNotNull(rustSyncManager) {
            "Trying to access the rust sync manager without calling GlobalAccountManager.setRustSyncManager"
        }
    }

    internal fun requireSyncStateStorageProvider(): SyncStateStorage.Provider {
        return requireNotNull(syncStorageProvider) {
            "Trying to access the sync state storage provider without calling " +
                "GlobalAccountManager.setSyncStateStorageProvider"
        }
    }

    internal fun setSyncStateStorageProvider(provider: SyncStateStorage.Provider) {
        this.syncStorageProvider = provider
    }

    /** Overrides the [systemClock] for testing purposes */
    @VisibleForTesting
    internal fun setTestClock(clock: Clock) {
        this.systemClock = clock
    }
}
