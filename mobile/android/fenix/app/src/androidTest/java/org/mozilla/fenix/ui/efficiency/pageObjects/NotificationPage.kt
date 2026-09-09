/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.pageObjects

import android.os.Build
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.test.uiautomator.UiSelector
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestHelper.appName
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRegistry
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep
import org.mozilla.fenix.ui.efficiency.selectors.NotificationSelectors

class NotificationPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {
    override val pageName = "NotificationPage"

    init {
        NavigationRegistry.register(
            from = "HomePage",
            to = pageName,
            steps = listOf(NavigationStep.OpenNotificationsTray),
        )
    }

    // Narrowed return type so the helpers below stay reachable when chained off navigateToPage(), which
    // otherwise hands back a BasePage. Same pattern as SettingsAutofillPage and TabHistoryPage.
    override fun navigateToPage(url: String, forceNavigation: Boolean): NotificationPage {
        super.navigateToPage(url = url, forceNavigation = forceNavigation)
        return this
    }

    /**
     * Opens the notification shade from wherever the app currently is.
     *
     * Prefer this over [navigateToPage]. The shade is a system overlay pulled down from the status bar, so it is
     * reachable from every app state — it is not a screen you route to through the nav graph. The registered HomePage
     * edge only covers one starting state, so navigateToPage() fails with "no navigation path found" from anywhere else
     * (e.g. inside a custom tab). Modelling the remaining states as more graph edges would mean an edge per page for
     * something globally reachable.
     */
    fun openNotificationTray(): NotificationPage {
        mozOpenNotificationsTray()
        try {
            mozVerify(NotificationSelectors.NOTIFICATION_SHADE)
        } catch (e: AssertionError) {
            // The shade is already open at this point, and it holds window focus. Leaving it open makes
            // everything after this fail on an unrelated error — including a retry of this test, which
            // cannot even launch the activity over it. Close it and let the real failure through.
            closeNotificationTray()
            throw e
        }
        return this
    }

    /**
     * Expands a collapsed notification so its action buttons become reachable, by swiping down on its top line.
     * Notifications in the shade are collapsed by default and their action buttons are not in the hierarchy at all
     * until expanded, so this must run before [clickNotificationActionButton].
     */
    fun expandNotification(text: String): NotificationPage {
        mozVerify(NotificationSelectors.SYSTEM_NOTIFICATION(text))
        mDevice
            .findObject(
                UiSelector()
                    .resourceId("android:id/notification_top_line")
                    .childSelector(UiSelector().textContains(text))
            )
            .swipeDown(SWIPE_STEPS)
        return this
    }

    /**
     * Clicks a download notification action button (Pause / Resume / Cancel), tolerating the button already being gone.
     *
     * The button is clicked only if present, and the action is confirmed by it no longer being there: clicking Pause
     * swaps it for Resume, Cancel removes the notification, so the button going away is what proves the action was
     * applied. Treating an already-absent button as done is deliberate -- a large download over a real network can
     * auto-pause before the shade is opened, leaving no Pause button to click, and the resulting paused state is
     * asserted separately. Retries because the shade re-lays-out as the download's state changes and a click can land
     * while the row is being rebuilt.
     */
    fun clickNotificationActionButton(selector: Selector): NotificationPage {
        var lastError: AssertionError? = null
        repeat(ACTION_RETRIES) {
            try {
                mozClickIfPresent(selector)
                mozVerifyElementAbsent(selector)
                return this
            } catch (e: AssertionError) {
                lastError = e
                mDevice.waitForWindowUpdate(null, WINDOW_UPDATE_TIMEOUT)
            }
        }
        throw lastError ?: AssertionError("Could not click notification action button: ${selector.description}")
    }

    /**
     * Clicks a media-session notification transport control (Play / Pause), matched by content description. Mirrors the
     * legacy NotificationRobot.clickMediaNotificationControlButton: a media-style notification shows its controls in
     * the collapsed state, so unlike a download notification it needs no [expandNotification] step first.
     */
    fun clickMediaNotificationControlButton(action: String): NotificationPage {
        val button = NotificationSelectors.MEDIA_NOTIFICATION_CONTROL_BUTTON(action)
        // Wait for the transport control to render before clicking -- it can appear a beat after the
        // notification's title. Mirrors the legacy waitForExists() + click() sequence.
        mozVerify(button)
        mozClick(button)
        return this
    }

    /**
     * Asserts the media notification's Play/Pause toggle is currently showing [action]. The single toggle button's
     * content description flips between "Play" and "Pause" as playback is paused and resumed, so this doubles as a
     * playback-state check. Mirrors legacy verifyMediaSystemNotificationButtonState.
     */
    fun verifyMediaNotificationButtonState(action: String): NotificationPage {
        mozVerify(NotificationSelectors.MEDIA_NOTIFICATION_CONTROL_BUTTON(action))
        return this
    }

    fun verifyNotificationExists(selector: Selector): NotificationPage {
        mozVerify(selector)
        return this
    }

    fun verifyNotificationDoesNotExist(selector: Selector): NotificationPage {
        mozVerifyElementAbsent(selector)
        return this
    }

    /**
     * Verifies the "close private tabs" notification. On Android 14+ it is a single actionable notification ("Close
     * private tabs?"); below that it is the app's private-session notification with a "Close private tabs" action.
     */
    fun verifyPrivateTabsNotification(): NotificationPage {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            mozVerify(
                NotificationSelectors.SYSTEM_NOTIFICATION(
                    getStringResource(R.string.notification_erase_title_android_14)
                ),
                timeout = PRIVATE_NOTIFICATION_TIMEOUT_MS,
            )
        } else {
            mozVerify(
                NotificationSelectors.SYSTEM_NOTIFICATION("$appName (Private)"),
                timeout = PRIVATE_NOTIFICATION_TIMEOUT_MS,
            )
            mozVerify(
                NotificationSelectors.SYSTEM_NOTIFICATION("Close private tabs"),
                timeout = PRIVATE_NOTIFICATION_TIMEOUT_MS,
            )
        }
        return this
    }

    /**
     * Clicks the close-private-tabs notification, which erases private tabs and returns to the home screen. On Android
     * 14+ the whole notification is the tap target; below that it is the "Close private tabs" action button.
     */
    fun clickClosePrivateTabsNotification(): NotificationPage {
        val closeTarget =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                getStringResource(R.string.notification_erase_title_android_14)
            } else {
                "Close private tabs"
            }
        val selector = NotificationSelectors.SYSTEM_NOTIFICATION(closeTarget)
        mozVerify(selector, timeout = PRIVATE_NOTIFICATION_TIMEOUT_MS)
        mozClick(selector)
        return this
    }

    fun verifyNotificationDoesNotExist(text: String): NotificationPage {
        mozVerifyElementAbsent(NotificationSelectors.SYSTEM_NOTIFICATION(text))
        return this
    }

    /**
     * Closes the shade and returns the app to the foreground.
     *
     * Back is what dismisses the shade, but it does not always take, so the close is confirmed and escalated to home
     * rather than assumed. An open shade is not a recoverable state for a later interaction: it keeps window focus,
     * which blocks both Espresso and the next activity launch.
     */
    fun closeNotificationTray(): NotificationPage {
        mDevice.pressBack()
        mDevice.waitForIdle()
        if (isNotificationTrayOpen()) {
            mDevice.pressHome()
            mDevice.waitForIdle()
        }
        return this
    }

    private fun isNotificationTrayOpen(): Boolean =
        mDevice
            .findObject(UiSelector().resourceId(NotificationSelectors.NOTIFICATION_STACK_SCROLLER_RES_ID))
            .exists() || mDevice.currentPackageName == SYSTEM_UI_PACKAGE

    override fun mozGetSelectorsByGroup(group: String): List<Selector> {
        return NotificationSelectors.all.filter { it.groups.contains(group) }
    }

    private companion object {
        const val SWIPE_STEPS = 10
        const val ACTION_RETRIES = 3
        const val WINDOW_UPDATE_TIMEOUT = 5_000L
        const val SYSTEM_UI_PACKAGE = "com.android.systemui"

        // The private-session notification is a plain foreground-service notification, which Android 14
        // defers from display for ~10s after the service starts (unlike a MediaStyle media notification,
        // which shows immediately). Wait well past that window before giving up.
        const val PRIVATE_NOTIFICATION_TIMEOUT_MS = 20_000L
    }
}
