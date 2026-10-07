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
import androidx.test.espresso.matcher.ViewMatchers.isNotChecked
import androidx.test.espresso.matcher.ViewMatchers.withChild
import androidx.test.espresso.matcher.ViewMatchers.withClassName
import androidx.test.espresso.matcher.ViewMatchers.withParent
import androidx.test.espresso.matcher.ViewMatchers.withResourceName
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.UiSelector
import org.hamcrest.Matchers.allOf
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.endsWith

/**
 * Questions about an element's neighbours.
 *
 * A settings row is usually two nodes - a label and its switch - with no selector reaching both, so "this setting is
 * on" has to be asked as "the label next to a checked switch". True/false rather than throwing, so these hand to
 * [require] like any other trait.
 */
object Relations {

    fun hasSiblingWithText(element: UiElement, text: String): Boolean = runCatching {
        val raw = element.backend()
        when (raw) {
            is ViewInteraction -> {
                raw.check(matches(hasSibling(withText(text))))
                true
            }
            is UiObject -> raw.getFromParent(UiSelector().text(text)).exists()
            is UiObject2 -> raw.parent?.findObject(By.text(text)) != null
            is SemanticsNodeInteraction -> {
                raw.assert(hasAnySibling(hasText(text)))
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
    fun hasCheckedSiblingNamed(element: UiElement, resourceName: String): Boolean =
        element.backend().let { raw ->
            raw is ViewInteraction &&
                runCatching {
                        raw.check(
                            matches(hasSibling(allOf(withResourceName(containsString(resourceName)), isChecked())))
                        )
                        true
                    }
                    .getOrDefault(false)
        }

    /**
     * Does [element]'s preference row own a switch in the given [checked] state? A preference row nests the title and
     * the switch in separate containers, so the switch is the title's *cousin*, not its sibling:
     * `withParent(hasSibling(withChild(switch)))`. Anchoring on the title (unique by text) is how a specific row's
     * switch is addressed, since the shared `switchWidget` id cannot single one out. Espresso only - a View-hierarchy
     * question. Mirrors the legacy `hasCousin(allOf(withClassName(endsWith("Switch")), isChecked(...)))`.
     */
    fun hasCousinSwitch(element: UiElement, checked: Boolean): Boolean =
        element.backend().let { raw ->
            raw is ViewInteraction &&
                runCatching {
                        raw.check(
                            matches(
                                withParent(
                                    hasSibling(
                                        withChild(
                                            allOf(
                                                withClassName(endsWith("Switch")),
                                                if (checked) isChecked() else isNotChecked(),
                                            )
                                        )
                                    )
                                )
                            )
                        )
                        true
                    }
                    .getOrDefault(false)
        }

    /**
     * Does [upper] render above [lower]? Compares the top edge of each element's on-screen bounds, so it answers "A
     * comes before B" for lists whose rows are not one queryable collection - the History screen's UiAutomator
     * RecyclerView, where the Compose collection verbs cannot help. Espresso views have no cheap bounds query here and
     * return false.
     */
    fun isAbove(upper: UiElement, lower: UiElement): Boolean {
        val upperTop = topEdgeOf(upper.backend()) ?: return false
        val lowerTop = topEdgeOf(lower.backend()) ?: return false
        return upperTop < lowerTop
    }

    private fun topEdgeOf(raw: Any): Float? = runCatching {
        when (raw) {
            is UiObject -> raw.bounds.top.toFloat()
            is UiObject2 -> raw.visibleBounds.top.toFloat()
            is SemanticsNodeInteraction -> raw.fetchSemanticsNode().boundsInRoot.top
            else -> null
        }
    }
        .getOrNull()
}
