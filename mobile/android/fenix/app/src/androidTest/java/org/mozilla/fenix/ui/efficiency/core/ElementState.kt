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

    fun probe(element: UiElement, trait: Trait): Boolean = runCatching {
        val raw = element.backend()
        when (raw) {
            is ViewInteraction -> {
                raw.check(
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
                    Trait.ENABLED -> raw.isEnabled
                    Trait.SELECTED -> raw.isSelected
                    Trait.CHECKED -> raw.isChecked
                    Trait.DISPLAYED -> raw.exists()
                }
            is UiObject2 ->
                when (trait) {
                    Trait.ENABLED -> raw.isEnabled
                    Trait.SELECTED -> raw.isSelected
                    Trait.CHECKED -> raw.isChecked
                    Trait.DISPLAYED -> element.isDisplayed()
                }
            is SemanticsNodeInteraction -> {
                when (trait) {
                    Trait.ENABLED -> raw.assertIsEnabled()
                    Trait.SELECTED -> raw.assertIsSelected()
                    Trait.CHECKED -> raw.assertIsOn()
                    Trait.DISPLAYED -> {
                        raw.assertExists()
                        raw.assertIsDisplayed()
                    }
                }
                true
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
    fun isNot(element: UiElement, trait: Trait): Boolean = runCatching {
        val raw = element.backend()
        when (raw) {
            is SemanticsNodeInteraction -> {
                when (trait) {
                    Trait.ENABLED -> raw.assertIsNotEnabled()
                    Trait.SELECTED -> raw.assertIsNotSelected()
                    Trait.CHECKED -> raw.assertIsOff()
                    Trait.DISPLAYED -> return !probe(element, trait)
                }
                true
            }
            is ViewInteraction ->
                when (trait) {
                    Trait.CHECKED -> {
                        raw.check(matches(isNotChecked()))
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
    fun isClickablyVisible(element: UiElement, percent: Int): Boolean =
        element.backend().let { raw ->
            if (raw is ViewInteraction) {
                runCatching {
                        raw.check(matches(isDisplayingAtLeast(percent)))
                        true
                    }
                    .getOrDefault(false)
            } else {
                probe(element, Trait.DISPLAYED)
            }
        }
}
