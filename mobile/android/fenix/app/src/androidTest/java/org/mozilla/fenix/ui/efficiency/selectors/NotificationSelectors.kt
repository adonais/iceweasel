/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import mozilla.components.feature.downloads.R as downloadsR
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object NotificationSelectors {

    const val NOTIFICATION_STACK_SCROLLER_RES_ID = "com.android.systemui:id/notification_stack_scroller"

    // Proof that the shade is open, which is what page presence means for this page. Deliberately not
    // keyed on the app's own notification header (text == appName): that only exists once Firefox has
    // posted a notification and rendered it, so it made "is the shade open" lose a race against the
    // notification it was really waiting for. Tests assert their own notification by text instead.
    val NOTIFICATION_SHADE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RAW_RES_ID,
            value = NOTIFICATION_STACK_SCROLLER_RES_ID,
            description = "System notification shade",
            groups = listOf("requiredForPage"),
        )

    // Everything below matches system UI rather than app UI, so the res-ids are raw "android:id/..."
    // values, not packageName-prefixed ones.

    // A download notification's control buttons. Every action button on a notification shares the
    // res-id android:id/action0, so the label distinguishes them. The labels come from the app strings
    // and are title-case ("Pause"/"Resume"/"Cancel"); the shade matches button text case-sensitively,
    // so the exact resource string must be used rather than an upper-cased literal.
    val DOWNLOAD_NOTIFICATION_PAUSE_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RAW_RES_ID_CONTAINING_TEXT,
            value = "android:id/action0",
            secondaryValue = getStringResource(downloadsR.string.mozac_feature_downloads_button_pause),
            description = "Download notification Pause button",
            groups = listOf(),
        )

    val DOWNLOAD_NOTIFICATION_RESUME_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RAW_RES_ID_CONTAINING_TEXT,
            value = "android:id/action0",
            secondaryValue = getStringResource(downloadsR.string.mozac_feature_downloads_button_resume),
            description = "Download notification Resume button",
            groups = listOf(),
        )

    val DOWNLOAD_NOTIFICATION_CANCEL_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RAW_RES_ID_CONTAINING_TEXT,
            value = "android:id/action0",
            secondaryValue = getStringResource(downloadsR.string.mozac_feature_downloads_button_cancel),
            description = "Download notification Cancel button",
            groups = listOf(),
        )

    // The "Download paused" line a download notification shows once it is paused.
    val DOWNLOAD_PAUSED_NOTIFICATION =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = getStringResource(downloadsR.string.mozac_feature_downloads_paused_notification_text),
            description = "Download paused notification text",
            groups = listOf(),
        )

    // Matched by text anywhere in the shade — a notification's title or body.
    @Suppress("FunctionName")
    fun SYSTEM_NOTIFICATION(text: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = text,
            description = "System notification containing text: $text",
            groups = listOf(),
        )

    // The collapsed notification's top line, used as the swipe handle to expand it.
    @Suppress("FunctionName")
    fun NOTIFICATION_TOP_LINE(text: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_RAW_RES_ID_CONTAINING_TEXT,
            value = "android:id/notification_top_line",
            secondaryValue = text,
            description = "Collapsed notification top line for: $text",
            groups = listOf(),
        )

    // A media-session notification's transport control (Play / Pause / etc.), matched by content
    // description like the legacy NotificationRobot.mediaSystemNotificationButton (itemWithDescription).
    // The Play/Pause toggle is a single button whose description flips between "Play" and "Pause", so the
    // action label both selects the control and identifies its current state.
    //
    // UIAUTOMATOR2 (UiObject2), not the UiSelector variant: pausing media round-trips through the app's
    // MediaSession before the notification rebuilds, so the control's reaction is slow. UiObject.click()
    // clicks via clickAndSync and reports failure when no window update lands inside its ~5.5s budget --
    // a slow-but-successful pause would then throw. UiObject2.click() just injects the gesture (see the
    // strategy note in Selector.kt); the resulting state is asserted separately.
    @Suppress("FunctionName")
    fun MEDIA_NOTIFICATION_CONTROL_BUTTON(action: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_DESCRIPTION_CONTAINS,
            value = action,
            description = "Media notification control button: $action",
            groups = listOf(),
        )

    val all =
        listOf(
            NOTIFICATION_SHADE,
            DOWNLOAD_NOTIFICATION_PAUSE_BUTTON,
            DOWNLOAD_NOTIFICATION_RESUME_BUTTON,
            DOWNLOAD_NOTIFICATION_CANCEL_BUTTON,
            DOWNLOAD_PAUSED_NOTIFICATION,
            SYSTEM_NOTIFICATION(),
            NOTIFICATION_TOP_LINE(),
            MEDIA_NOTIFICATION_CONTROL_BUTTON(),
        )
}
