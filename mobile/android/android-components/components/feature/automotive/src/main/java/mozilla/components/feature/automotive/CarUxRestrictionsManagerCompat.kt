/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.automotive

import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import androidx.annotation.VisibleForTesting
import androidx.core.content.ContextCompat
import java.util.concurrent.Executor
import mozilla.components.support.base.log.logger.Logger

private val logger = Logger("CarUxRestrictionsManagerCompat")

/**
 * Whether the device has the UI context variants of the [CarUxRestrictionsManager] listener API.
 *
 * `android.car` is a shared library loaded from the system image and is versioned independently of the SDK this is
 * compiled against, so a method that links at build time can still be missing at runtime. Registering and unregistering
 * have to agree on which variant they use, hence the single flag.
 */
@VisibleForTesting
internal val supportsUiContextApi: Boolean =
    try {
        CarUxRestrictionsManager::class
            .java
            .getMethod(
                "registerListenerForUiContext",
                Context::class.java,
                Executor::class.java,
                CarUxRestrictionsManager.OnUxRestrictionsChangedListener::class.java,
            )
        true
    } catch (e: NoSuchMethodException) {
        logger.info("The car library has no UI context API, falling back to the deprecated one", e)
        false
    }

@Suppress("DEPRECATION")
internal fun CarUxRestrictionsManager.registerRestrictionsListener(
    context: Context,
    listener: CarUxRestrictionsManager.OnUxRestrictionsChangedListener,
) =
    if (supportsUiContextApi) {
        registerListenerForUiContext(context, ContextCompat.getMainExecutor(context), listener)
    } else {
        registerListener(listener)
    }

@Suppress("DEPRECATION")
internal fun CarUxRestrictionsManager.unregisterRestrictionsListener(
    listener: CarUxRestrictionsManager.OnUxRestrictionsChangedListener
) = if (supportsUiContextApi) unregisterListenerForUiContext(listener) else unregisterListener()

@Suppress("DEPRECATION")
internal fun CarUxRestrictionsManager.currentRestrictions(context: Context): CarUxRestrictions? =
    if (supportsUiContextApi) getCurrentCarUxRestrictions(context) else currentCarUxRestrictions
