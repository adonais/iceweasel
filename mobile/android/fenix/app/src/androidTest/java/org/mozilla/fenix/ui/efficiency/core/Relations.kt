/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasAnySibling
import androidx.compose.ui.test.hasText
import androidx.test.espresso.ViewInteraction
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.hasSibling
import androidx.test.espresso.matcher.ViewMatchers.isChecked
import androidx.test.espresso.matcher.ViewMatchers.withResourceName
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.UiSelector
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.containsString

/**
 * Questions about an element's neighbours.
 *
 * A settings row is usually two nodes - a label and its switch - with no selector reaching both, so "this setting is
 * on" has to be asked as "the label next to a checked switch". True/false rather than throwing, so these hand to
 * [require] like any other trait.
 */
object Relations {

    fun hasSiblingWithText(element: Any, text: String): Boolean = runCatching {
        when (element) {
            is ViewInteraction -> {
                element.check(matches(hasSibling(withText(text))))
                true
            }
            is UiObject -> element.getFromParent(UiSelector().text(text)).exists()
            is UiObject2 -> element.parent?.findObject(By.text(text)) != null
            is SemanticsNodeInteraction -> {
                element.assert(hasAnySibling(hasText(text)))
                true
            }
            else -> false
        }
    }
        .getOrDefault(false)

    /**
     * Espresso only. A resource-name substring plus checked state is a View-hierarchy question - Compose has no
     * resource names, and UiAutomator cannot ask "checked" of a sibling in one step.
     */
    fun hasCheckedSiblingNamed(element: Any, resourceName: String): Boolean =
        element is ViewInteraction &&
            runCatching {
                    element.check(
                        matches(hasSibling(allOf(withResourceName(containsString(resourceName)), isChecked())))
                    )
                    true
                }
                .getOrDefault(false)
}
