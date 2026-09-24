/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.test.espresso.ViewInteraction
import androidx.test.espresso.action.ViewActions
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiObject2
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

/** Swipe gestures, per backend, once. The direction is a lookup; each backend contributes a line. */
object Gestures {

    private val device: UiDevice
        get() = UiDevice.getInstance(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation())

    /**
     * Swipe on the element itself. [steps] is the UiAutomator motion-event count, so it sets gesture speed: low is a
     * flick, high a slow drag. Some gestures only register as a flick (swiping the navigation toolbar to switch tabs),
     * which is why callers can ask for one.
     */
    fun onElement(element: UiElement, direction: SwipeDirection, steps: Int = 100) {
        val raw = element.backend()
        when (raw) {
            is ViewInteraction ->
                raw.perform(
                    when (direction) {
                        SwipeDirection.UP -> ViewActions.swipeUp()
                        SwipeDirection.DOWN -> ViewActions.swipeDown()
                        SwipeDirection.LEFT -> ViewActions.swipeLeft()
                        SwipeDirection.RIGHT -> ViewActions.swipeRight()
                    }
                )
            is UiObject ->
                when (direction) {
                    SwipeDirection.UP -> raw.swipeUp(steps)
                    SwipeDirection.DOWN -> raw.swipeDown(steps)
                    SwipeDirection.LEFT -> raw.swipeLeft(steps)
                    SwipeDirection.RIGHT -> raw.swipeRight(steps)
                }
            is UiObject2 ->
                raw.swipe(
                    when (direction) {
                        SwipeDirection.UP -> Direction.UP
                        SwipeDirection.DOWN -> Direction.DOWN
                        SwipeDirection.LEFT -> Direction.LEFT
                        SwipeDirection.RIGHT -> Direction.RIGHT
                    },
                    1.0f,
                )
            is SemanticsNodeInteraction ->
                raw.performTouchInput {
                    swipe(start = center, end = center + direction.offset(COMPOSE_DISTANCE), durationMillis = 200L)
                }
            else -> throw IllegalArgumentException("Cannot swipe a ${raw::class.simpleName}")
        }
    }

    /**
     * Swipe the screen rather than an element, from the middle outward. Used to scroll toward something that is not on
     * screen yet, so there is no element to aim at.
     */
    fun onScreen(direction: SwipeDirection) {
        val w = device.displayWidth
        val h = device.displayHeight
        when (direction) {
            SwipeDirection.UP -> device.swipe(w / 2, h / 2, w / 2, h / 4, DEVICE_STEPS)
            SwipeDirection.DOWN -> device.swipe(w / 2, h / 2, w / 2, h * 3 / 4, DEVICE_STEPS)
            SwipeDirection.LEFT -> device.swipe(w * 3 / 4, h / 2, w / 4, h / 2, DEVICE_STEPS)
            SwipeDirection.RIGHT -> device.swipe(w / 4, h / 2, w * 3 / 4, h / 2, DEVICE_STEPS)
        }
    }

    private fun SwipeDirection.offset(distance: Float): Offset =
        when (this) {
            SwipeDirection.UP -> Offset(0f, -distance)
            SwipeDirection.DOWN -> Offset(0f, distance)
            SwipeDirection.LEFT -> Offset(-distance, 0f)
            SwipeDirection.RIGHT -> Offset(distance, 0f)
        }

    private const val COMPOSE_DISTANCE = 1500f
    private const val DEVICE_STEPS = 20
}
