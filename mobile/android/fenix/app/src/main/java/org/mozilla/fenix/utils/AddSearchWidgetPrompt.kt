/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.utils

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import org.mozilla.fenix.onboarding.WidgetPinnedReceiver
import org.mozilla.gecko.search.SearchWidgetProvider

/**
 * Displays the "add search widget" prompt for capable devices.
 *
 * @param activity the parent [Activity].
 */
fun maybeShowAddSearchWidgetPrompt(activity: Activity) {
    val appWidgetManager = AppWidgetManager.getInstance(activity)

    // We don't use canShowAddSearchWidgetPrompt here directly as lint does not pick on the version check.
    if (appWidgetManager.isRequestPinAppWidgetSupported) {
        val searchWidgetProvider = ComponentName(activity, SearchWidgetProvider::class.java)
        val successCallback = WidgetPinnedReceiver.getPendingIntent(activity)
        appWidgetManager.requestPinAppWidget(searchWidgetProvider, null, successCallback)
    }
}

/**
 * Displays the "add search widget" prompt if the device supports it.
 *
 * This function checks if the current Android version is Oreo (API 26) or higher
 * and if the `AppWidgetManager` supports pinning app widgets. If both conditions are met,
 * it requests to pin the search widget.
 *
 * @param packageName The package name of the application.
 * @param appWidgetManager An instance of [AppWidgetManager] to interact with app widgets.
 * @param successCallback A [PendingIntent] that will be sent when the widget is successfully pinned.
 */
fun showAddSearchWidgetPromptIfSupported(
    packageName: String,
    appWidgetManager: AppWidgetManager,
    successCallback: PendingIntent,
) {
    if (canShowAddSearchWidgetPrompt(appWidgetManager)) {
        val searchWidgetProvider = ComponentName(
            packageName,
            SearchWidgetProvider::class.java.name,
        )
        appWidgetManager.requestPinAppWidget(searchWidgetProvider, null, successCallback)
    }
}

/**
 * Checks whether the device is capable of displaying the "add search widget" prompt.
 */
fun canShowAddSearchWidgetPrompt(appWidgetManager: AppWidgetManager) =
    appWidgetManager.isRequestPinAppWidgetSupported
