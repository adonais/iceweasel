/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.test.espresso.ViewInteraction
import androidx.test.espresso.action.ViewActions
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiObject2

/**
 * Do a thing to a located element, whatever backend it came from, so a verb names its action and nothing else. One copy
 * of the four-way dispatch: a backend a verb would have forgotten to handle does the obvious thing instead of failing
 * as "unsupported element type".
 */
object UiActions {

    private val device: UiDevice
        get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    fun click(element: Any) {
        // resolve() hands back the UiElement facade; mozGetElement hands back a raw backend node.
        if (element is UiElement) return element.click()
        dispatch(
            element,
            "click",
            espresso = { it.perform(ViewActions.click()) },
            uiObject = {
                if (!it.exists()) throw AssertionError("UiObject does not exist")
                if (!it.click()) throw AssertionError("Failed to click UiObject")
            },
            uiObject2 = { it.click() },
            compose = {
                it.assertExists()
                it.assertIsDisplayed()
                it.performClick()
            },
        )
    }

    fun longClick(element: Any, durationMillis: Long = 5_000) =
        dispatch(
            element,
            "long click",
            espresso = { it.perform(ViewActions.longClick()) },
            uiObject = {
                if (!it.exists()) throw AssertionError("UiObject does not exist")
                if (!it.longClick()) throw AssertionError("Failed to long click UiObject")
            },
            uiObject2 = { it.longClick() },
            compose = {
                it.assertExists()
                it.assertIsDisplayed()
                it.performTouchInput { longClick(durationMillis = durationMillis) }
            },
        )

    fun enterText(element: Any, text: String) =
        dispatch(
            element,
            "enter text",
            espresso = { it.perform(ViewActions.typeText(text)) },
            uiObject = { it.setText(text) },
            uiObject2 = { it.setText(text) },
            compose = { it.performTextInput(text) },
        )

    fun clear(element: Any) =
        dispatch(
            element,
            "clear",
            espresso = { it.perform(ViewActions.clearText()) },
            uiObject = { it.clearTextField() },
            uiObject2 = { it.clear() },
            compose = { it.performTextClearance() },
        )

    // UiAutomator has no per-element IME action, so the key goes to the focused field via the device -
    // which is what the hand-written copies of this branch already did.
    fun pressEnter(element: Any) =
        dispatch(
            element,
            "press enter",
            espresso = { it.perform(ViewActions.pressImeActionButton()) },
            uiObject = { device.pressEnter() },
            uiObject2 = { device.pressEnter() },
            compose = { it.performImeAction() },
        )

    private inline fun dispatch(
        element: Any,
        action: String,
        espresso: (ViewInteraction) -> Unit,
        uiObject: (UiObject) -> Unit,
        uiObject2: (UiObject2) -> Unit,
        compose: (SemanticsNodeInteraction) -> Unit,
    ) {
        when (element) {
            is ViewInteraction -> espresso(element)
            is UiObject -> uiObject(element)
            is UiObject2 -> uiObject2(element)
            is SemanticsNodeInteraction -> compose(element)
            else -> unsupported(element, action)
        }
    }

    private fun unsupported(element: Any, action: String): Nothing =
        throw AssertionError("Cannot $action a ${element::class.simpleName}")
}
