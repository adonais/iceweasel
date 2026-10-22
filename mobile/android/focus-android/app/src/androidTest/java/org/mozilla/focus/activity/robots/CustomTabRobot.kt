/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.focus.activity.robots

import android.net.Uri
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.ViewInteraction
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withContentDescription
import androidx.test.uiautomator.UiObject
import androidx.test.uiautomator.UiSelector
import junit.framework.TestCase.assertTrue
import mozilla.components.feature.customtabs.R as customtabsR
import org.junit.Assert
import org.mozilla.focus.R
import org.mozilla.focus.helpers.TestHelper.getStringResource
import org.mozilla.focus.helpers.TestHelper.mDevice
import org.mozilla.focus.helpers.TestHelper.packageName
import org.mozilla.focus.helpers.TestHelper.waitingTime
import org.mozilla.focus.idlingResources.SessionLoadedIdlingResource

class CustomTabRobot {

    private lateinit var sessionLoadedIdlingResource: SessionLoadedIdlingResource

    val progressBar: UiObject = mDevice.findObject(UiSelector().resourceId("$packageName:id/progress"))

    fun verifyCustomTabActionButton(buttonDescription: String) {
        actionButton(buttonDescription).check(matches(isDisplayed()))
    }

    fun verifyCustomMenuItem(buttonDescription: String) {
        menuItem(buttonDescription)
    }

    fun openCustomTabMenu() = menuButton.click()

    fun verifyShareButtonIsDisplayed(): ViewInteraction = shareButton.check(matches(isDisplayed()))

    fun verifyTheStandardMenuItems() {
        menuItem(getStringResource(R.string.menu_add_to_home_screen))
        menuItem(getStringResource(R.string.find_in_page))
        menuItem(getStringResource(R.string.menu_open_with_a_browser2))
        menuItem(getStringResource(R.string.menu_open_with_default_browser2))
        menuItem(getStringResource(R.string.preference_performance_request_desktop_site2))
        menuItem(getStringResource(R.string.menu_custom_tab_branding))
        // Removed until https://github.com/mozilla-mobile/android-components/issues/10791 is fixed
        // menuItem("Report broken site…")
    }

    fun closeCustomTab() {
        closeCustomTabButton.check(matches(isDisplayed())).perform(click())
    }

    fun verifyCustomTabUrl(url: String) {
        val uri = Uri.parse(url)
        val expectedText = uri.host ?: url // fallback if host is null

        verifyPageURL(expectedText)
    }

    fun verifyPageURL(expectedText: String) {
        sessionLoadedIdlingResource = SessionLoadedIdlingResource()

        runWithIdleRes(sessionLoadedIdlingResource) {
            mDevice.findObject(UiSelector().textContains(expectedText)).waitForExists(waitingTime)
            assertTrue(
                "Actual url: ${customTabUrl.text}",
                customTabUrl.text.contains(expectedText),
            )
        }
    }

    fun verifyPageContent(expectedText: String) {
        val sessionLoadedIdlingResource = SessionLoadedIdlingResource()

        mDevice.findObject(UiSelector().resourceId("$packageName:id/engineView")).waitForExists(waitingTime)

        runWithIdleRes(sessionLoadedIdlingResource) {
            Assert.assertTrue(mDevice.findObject(UiSelector().textContains(expectedText)).waitForExists(waitingTime))
        }
    }

    fun clickLinkMatchingText(expectedText: String) {
        mDevice.findObject(UiSelector().textContains(expectedText)).waitForExists(waitingTime)
        mDevice.findObject(UiSelector().textContains(expectedText)).also { it.click() }
    }

    class Transition {
        fun clickOpenInFocusButton(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.menu_open_with_default_browser2)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun openCustomTabMenu(interact: ThreeDotMainMenuRobot.() -> Unit): ThreeDotMainMenuRobot.Transition {
            menuButton.click()

            ThreeDotMainMenuRobot().interact()
            return ThreeDotMainMenuRobot.Transition()
        }
    }
}

fun customTab(interact: CustomTabRobot.() -> Unit): CustomTabRobot.Transition {
    CustomTabRobot().interact()
    return CustomTabRobot.Transition()
}

private fun actionButton(description: String) = onView(withContentDescription(description))

private val menuButton
    get() = mDevice.findObject(UiSelector().description(getStringResource(R.string.content_description_menu)))

private val shareButton = onView(withContentDescription("Share link"))

private val closeCustomTabButton =
    onView(withContentDescription(customtabsR.string.mozac_feature_customtabs_exit_button))

private val customTabUrl = mDevice.findObject(UiSelector().resourceId("$packageName:id/mozac_browser_toolbar_url_view"))
