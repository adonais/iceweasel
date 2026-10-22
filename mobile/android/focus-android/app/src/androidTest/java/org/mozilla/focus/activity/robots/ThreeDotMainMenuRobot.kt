/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.focus.activity.robots

import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.UiScrollable
import androidx.test.uiautomator.UiSelector
import androidx.test.uiautomator.Until
import java.util.regex.Pattern
import junit.framework.TestCase.assertTrue
import org.mozilla.focus.R
import org.mozilla.focus.helpers.TestHelper.getStringResource
import org.mozilla.focus.helpers.TestHelper.mDevice
import org.mozilla.focus.helpers.TestHelper.packageName
import org.mozilla.focus.helpers.TestHelper.progressBar
import org.mozilla.focus.helpers.TestHelper.waitingTime

private const val ANCESTORS_SEARCHED_FOR_SIBLINGS = 2

class ThreeDotMainMenuRobot {

    fun verifyShareButtonExists() = menuItem(getStringResource(R.string.menu_share))

    fun verifyAddToHomeButtonExists() = menuItem(getStringResource(R.string.menu_add_to_home_screen))

    fun verifyFindInPageExists() = menuItem(getStringResource(R.string.find_in_page))

    fun verifyOpenInButtonExists() = menuItem(getStringResource(R.string.menu_open_with_a_browser2))

    fun verifyRequestDesktopSiteExists() =
        menuItem(getStringResource(R.string.preference_performance_request_desktop_site2))

    fun isReloadButtonDisplayed(): Boolean {
        val label = getStringResource(R.string.content_description_reload)
        return mDevice.hasObject(By.text(label)) || mDevice.hasObject(By.desc(label))
    }

    fun verifyRequestDesktopSiteIsEnabled(expectedState: Boolean) {
        val item = menuItem(getStringResource(R.string.preference_performance_request_desktop_site2))
        val badge =
            getStringResource(if (expectedState) R.string.preference_state_on else R.string.preference_state_off)

        // Only the icon and the title of a menu item are merged in one node, the badge is a sibling of them.
        assertTrue(
            "Expected the desktop site item to be badged with $badge",
            item.hasSibling(By.text(badge)),
        )
    }

    fun verifySettingsButtonExists() = menuItem(getStringResource(R.string.menu_settings))

    fun verifyReportSiteIssueButtonExists() {
        menuItem("Report broken site…")
    }

    fun verifyHelpPageLinkExists() = menuItem(getStringResource(R.string.menu_help))

    fun clickOpenInOption() {
        menuItem(getStringResource(R.string.menu_open_with_a_browser2)).click()
    }

    fun verifyOpenInDialog() {
        assertTrue(openInDialogTitle.waitForExists(waitingTime))
        assertTrue(openWithList.waitForExists(waitingTime))
    }

    fun clickOpenInChrome() {
        val chromeBrowser = mDevice.findObject(UiSelector().text("Chrome"))
        if (chromeBrowser.exists()) {
            chromeBrowser.click()
        }
    }

    fun clickAddToShortcuts() {
        menuItem(getStringResource(R.string.menu_add_to_shortcuts)).click()
    }

    class Transition {
        fun openSettings(
            localizedText: String = getStringResource(R.string.menu_settings),
            interact: SettingsRobot.() -> Unit,
        ): SettingsRobot.Transition {
            menuItem(localizedText).click()

            SettingsRobot().interact()
            return SettingsRobot.Transition()
        }

        fun openShareScreen(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.menu_share)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun openAddToHSDialog(interact: AddToHomeScreenRobot.() -> Unit): AddToHomeScreenRobot.Transition {
            menuItem(getStringResource(R.string.menu_add_to_home_screen)).click()

            AddToHomeScreenRobot().interact()
            return AddToHomeScreenRobot.Transition()
        }

        fun clickHelpPageLink(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.menu_help)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun clickReloadButton(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.content_description_reload)).click()
            progressBar.waitUntilGone(waitingTime)

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun clickStopLoadingButton(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.content_description_stop)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun openFindInPage(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.find_in_page)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun switchDesktopSiteMode(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.preference_performance_request_desktop_site2)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun pressBack(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.content_description_back)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }

        fun pressForward(interact: BrowserRobot.() -> Unit): BrowserRobot.Transition {
            menuItem(getStringResource(R.string.content_description_forward)).click()

            BrowserRobot().interact()
            return BrowserRobot.Transition()
        }
    }
}

internal fun menuItem(label: String): UiObject2 {
    val text = Pattern.compile("(?s)${Pattern.quote(label)}(?:\\s.*)?")
    mDevice.waitForIdle()
    mDevice.findObject(By.text(text))?.let {
        return it
    }
    mDevice.findObject(By.desc(label))?.let {
        return it
    }

    val menu = UiScrollable(UiSelector().packageName(packageName).scrollable(true))
    if (menu.exists()) {
        menu.scrollIntoView(UiSelector().textMatches(text.pattern()))
    }

    return mDevice.wait(Until.findObject(By.text(text)), waitingTime)
        ?: throw AssertionError("Menu item not found: $label")
}

/** Whether any of the nodes next to this one, as shown in the same menu item, matches [selector]. */
private fun UiObject2.hasSibling(selector: BySelector): Boolean {
    var ancestor = parent

    repeat(ANCESTORS_SEARCHED_FOR_SIBLINGS) {
        if (ancestor?.hasObject(selector) == true) {
            return true
        }
        ancestor = ancestor?.parent
    }

    return false
}

private val openInDialogTitle = mDevice.findObject(UiSelector().text("Open in…"))

private val openWithList = mDevice.findObject(UiSelector().resourceId("$packageName:id/apps"))
