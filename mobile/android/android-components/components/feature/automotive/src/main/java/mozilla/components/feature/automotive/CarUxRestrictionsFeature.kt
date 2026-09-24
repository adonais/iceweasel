/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.automotive

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.state.SessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.media.ext.playing
import mozilla.components.lib.state.ext.flowScoped
import mozilla.components.support.base.log.logger.Logger

/**
 * Feature that keeps media from playing while the car's UX restrictions forbid it, e.g. while the user is driving.
 *
 * For as long as the restriction is active the store is observed and every media session that reports playback gets
 * paused again. That way media which only starts after the user began driving - a delayed autoplay, a newly opened tab,
 * or a tap on a play button - is stopped as well.
 *
 * @param applicationContext the application's [Context].
 * @param store reference to the browser store where the media session state of every tab is located.
 * @param mainDispatcher dispatcher used for main thread operations.
 */
class CarUxRestrictionsFeature(
    private val applicationContext: Context,
    private val store: BrowserStore,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
) {
    @VisibleForTesting internal var scope: CoroutineScope? = null

    private val logger = Logger("CarUxRestrictionsFeature")

    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null

    /**
     * Starts observing the car's UX restrictions.
     *
     * Does nothing if this is not an Android Automotive OS device.
     */
    @Suppress("TooGenericExceptionCaught")
    fun start() {
        if (!applicationContext.isAndroidAutomotiveAvailable()) return

        try {
            // The other Car.createCar overloads block the calling thread until the car service is up, which can take a
            // while right after the car booted. This one returns immediately and calls back on the main thread instead.
            val connectingCar =
                Car.createCar(
                    applicationContext,
                    Handler(Looper.getMainLooper()),
                    Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT,
                ) { car, ready ->
                    onCarLifecycleChanged(car, ready)
                }

            // If the car service was already up the listener ran before we got here and stored the car itself. This
            // only covers the other case, so that stop() can disconnect while the connection is still being set up.
            if (car == null) {
                car = connectingCar
            }
        } catch (e: Exception) {
            logger.warn("Could not connect to the car service", e)
        }
    }

    /** Stops observing the car's UX restrictions. Media that was paused because of a restriction stays paused. */
    @Suppress("TooGenericExceptionCaught")
    fun stop() {
        stopPausingMedia()

        try {
            manager?.unregisterListener()
            car?.disconnect()
        } catch (e: Exception) {
            logger.warn("Could not disconnect from the car service", e)
        }

        manager = null
        car = null
    }

    @Suppress("TooGenericExceptionCaught")
    private fun onCarLifecycleChanged(car: Car, ready: Boolean) {
        // Car.createCar calls this synchronously when the car service is already up, i.e. before it returned the Car to
        // assign to the property below, so the instance handed to us here is the only one we can rely on.
        this.car = car

        if (!ready) {
            // The car service died. It is restarted by the system and this is called again with ready = true, but until
            // then there is no way to tell whether the restriction is still active, so keep pausing media if we were.
            manager = null
            return
        }

        try {
            val manager = car.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager ?: return
            this.manager = manager

            manager.registerListener { restrictions -> onUxRestrictionsChanged(restrictions) }
            // The app can be started while already driving, so seed the state instead of waiting for the first change.
            onUxRestrictionsChanged(manager.currentCarUxRestrictions)
        } catch (e: Exception) {
            logger.warn("Could not observe the car's UX restrictions", e)
        }
    }

    private fun onUxRestrictionsChanged(restrictions: CarUxRestrictions?) {
        val isRestricted =
            restrictions != null && restrictions.activeRestrictions and CarUxRestrictions.UX_RESTRICTIONS_NO_VIDEO != 0

        setMediaRestricted(isRestricted)
    }

    @VisibleForTesting
    internal fun setMediaRestricted(restricted: Boolean) {
        if (restricted) startPausingMedia() else stopPausingMedia()
    }

    private fun startPausingMedia() {
        if (scope != null) return

        scope =
            store.flowScoped(dispatcher = mainDispatcher) { flow ->
                flow
                    .map { state -> (state.tabs + state.customTabs).mapNotNull { it.playingMediaController() } }
                    .distinctUntilChanged()
                    .collect { controllers -> controllers.forEach { it.pause() } }
            }
    }

    private fun stopPausingMedia() {
        scope?.cancel()
        scope = null
    }

    private fun SessionState.playingMediaController() = mediaSessionState?.takeIf { it.playing() }?.controller
}
