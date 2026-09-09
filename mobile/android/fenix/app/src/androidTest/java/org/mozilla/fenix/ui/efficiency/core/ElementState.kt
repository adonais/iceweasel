/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.test.espresso.ViewInteraction
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isChecked
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isDisplayingAtLeast
import androidx.test.espresso.matcher.ViewMatchers.isEnabled
import androidx.test.espresso.matcher.ViewMatchers.isNotChecked
import androidx.test.espresso.matcher.ViewMatchers.isSelected
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiObject2

/**
 * Element state, across the four element types the harness can hand back.
 *
 * Everything here answers true/false and never throws, so the same probe can drive an assertion, a poll predicate or
 * control flow.
 */
object ElementState {

    enum class Trait {
        ENABLED,
        SELECTED,
        CHECKED,
        DISPLAYED,
    }

    fun probe(element: Any, trait: Trait): Boolean = runCatching {
        when (element) {
            is ViewInteraction -> {
                element.check(
                    matches(
                        when (trait) {
                            Trait.ENABLED -> isEnabled()
                            Trait.SELECTED -> isSelected()
                            Trait.CHECKED -> isChecked()
                            Trait.DISPLAYED -> isDisplayed()
                        }
                    )
                )
                true
            }
            is UiObject ->
                when (trait) {
                    Trait.ENABLED -> element.isEnabled
                    Trait.SELECTED -> element.isSelected
                    Trait.CHECKED -> element.isChecked
                    Trait.DISPLAYED -> element.exists()
                }
            is UiObject2 ->
                when (trait) {
                    Trait.ENABLED -> element.isEnabled
                    Trait.SELECTED -> element.isSelected
                    Trait.CHECKED -> element.isChecked
                    // UiAutomator2 only hands back an object it already found on screen.
                    Trait.DISPLAYED -> true
                }
            is SemanticsNodeInteraction -> {
                when (trait) {
                    Trait.ENABLED -> element.assertIsEnabled()
                    Trait.SELECTED -> element.assertIsSelected()
                    Trait.CHECKED -> element.assertIsOn()
                    Trait.DISPLAYED -> {
                        element.assertExists()
                        element.assertIsDisplayed()
                    }
                }
                true
            }
            is UiElement ->
                when (trait) {
                    Trait.DISPLAYED -> element.isDisplayed()
                    else -> element.exists()
                }
            else -> false
        }
    }
        .getOrDefault(false)

    /**
     * The negative of a trait, asserted rather than inferred. Compose distinguishes "not enabled" from "no enabled
     * semantics at all", so `!isEnabled` is not the same claim as `isNotEnabled` - which is exactly the trap
     * mozClickWhenEnabled fell into.
     */
    fun isNot(element: Any, trait: Trait): Boolean = runCatching {
        when (element) {
            is SemanticsNodeInteraction -> {
                when (trait) {
                    Trait.ENABLED -> element.assertIsNotEnabled()
                    Trait.SELECTED -> element.assertIsNotSelected()
                    Trait.CHECKED -> element.assertIsOff()
                    Trait.DISPLAYED -> return !probe(element, trait)
                }
                true
            }
            is ViewInteraction ->
                when (trait) {
                    Trait.CHECKED -> {
                        element.check(matches(isNotChecked()))
                        true
                    }
                    else -> !probe(element, trait)
                }
            else -> !probe(element, trait)
        }
    }
        .getOrDefault(false)

    /**
     * Visible enough to be clicked, not merely present.
     *
     * Espresso's click() refuses a view displayed under [percent], so a swipe-to-element loop that stops at "exists"
     * leaves the caller with something it cannot tap. The other backends have no equivalent notion, so they fall back
     * to presence.
     */
    fun isClickablyVisible(element: Any, percent: Int): Boolean =
        if (element is ViewInteraction) {
            runCatching {
                    element.check(matches(isDisplayingAtLeast(percent)))
                    true
                }
                .getOrDefault(false)
        } else {
            probe(element, Trait.DISPLAYED)
        }
}
