/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.navigation.NavController
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.IntentReceiverActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.components.ShortcutManagerCompatWrapper
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.home.HomeFragmentDirections
import org.mozilla.fenix.utils.Settings
import mozilla.components.ui.icons.R as iconsR

/**
 * Manager class responsible for creating the uninstall survey app shortcut
 * and handling its navigation routing.
 *
 * @param context The application context.
 * @param shortcutManagerWrapper The wrapper used to publish or remove dynamic shortcuts.
 * @param settings The [Settings] instance used to retrieve the feature flag state.
 */
class UninstallSurveyManager(
    private val context: Context,
    private val shortcutManagerWrapper: ShortcutManagerCompatWrapper,
    private val settings: Settings = context.components.settings,
) {

    private val logger = Logger("UninstallSurveyManager")
    private val shortcutIntent = Intent(context, IntentReceiverActivity::class.java).apply {
        action = ACTION_UNINSTALL_SURVEY
    }

    /**
     * Programmatically registers or updates the dynamic shortcut on the device home screen.
     */
    fun updateUninstallSurveyShortcut() {
            if (settings.uninstallSurveyFeatureFlagEnabled) {
                val shortcut = ShortcutInfoCompat.Builder(context, SHORTCUT_ID)
                    .setShortLabel(context.getString(R.string.home_screen_shortcut_uninstall_survey))
                    .setIcon(IconCompat.createWithResource(context, iconsR.drawable.mozac_ic_delete_black_24))
                    .setIntent(shortcutIntent)
                    .build()

                try {
                    shortcutManagerWrapper.pushDynamicShortcut(context, shortcut)
                } catch (e: SecurityException) {
                    logger.error("Knox or system security policy blocked shortcut creation", e)
                } catch (e: IllegalStateException) {
                    logger.error("Failed to push dynamic shortcut due to invalid system state", e)
                }
            } else {
                shortcutManagerWrapper.removeDynamicShortcuts(context, listOf(SHORTCUT_ID))
            }
    }

    /**
     * Checks the intent action and routes the user to the uninstall survey dialog if applicable.
     *
     * @param intent The incoming [Intent] containing the action.
     * @param navController The [NavController] used to trigger the navigation.
     */
    fun showUninstallSurvey(intent: Intent?, navController: NavController) {
        if (intent?.action == ACTION_UNINSTALL_SURVEY) {
            val isAlreadyShowing = navController.currentDestination?.id == R.id.uninstallSurveyBottomSheetFragment

            if (!isAlreadyShowing) {
                navController.navigate(
                    HomeFragmentDirections.actionGlobalUninstallSurveyDialog(UNINSTALL_MICROSURVEY_ID),
                )
            }
            intent.action = null
        }
    }

    companion object {
        const val ACTION_UNINSTALL_SURVEY = "org.mozilla.fenix.ACTION_UNINSTALL_SURVEY"
        private const val SHORTCUT_ID = "uninstall_survey_shortcut"
        private const val UNINSTALL_MICROSURVEY_ID = "microsurvey-uninstall-survey"
    }
}
