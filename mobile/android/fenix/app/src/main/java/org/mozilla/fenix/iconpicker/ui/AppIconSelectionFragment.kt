/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import android.content.ComponentName
import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import mozilla.components.support.base.feature.UserInteractionHandler
import org.mozilla.fenix.GleanMetrics.AppIconSelection
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.ext.showToolbar
import org.mozilla.fenix.iconpicker.AppIconRepository
import org.mozilla.fenix.iconpicker.DefaultAppIconRepository
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.ShortcutManagerWrapperDefault
import org.mozilla.fenix.utils.ShortcutsUpdaterDefault
import org.mozilla.fenix.utils.changeAppLauncherIcon

/**
 * Fragment that displays a list of alternative app icons.
 */
class AppIconSelectionFragment : Fragment(), UserInteractionHandler {

    private val appIconRepository: AppIconRepository by lazy {
        DefaultAppIconRepository(requireContext().settings())
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        FirefoxTheme {
            AppIconSelection(
                currentAppIcon = appIconRepository.selectedAppIcon,
                groupedIconOptions = appIconRepository.groupedAppIcons,
                onAppIconSelected = { selectedAppIcon ->
                    val currentAliasSuffix = appIconRepository.selectedAppIcon.aliasSuffix
                    appIconRepository.selectedAppIcon = selectedAppIcon

                    AppIconSelection.appIconSelectionConfirmed.record(
                        extra = AppIconSelection.AppIconSelectionConfirmedExtra(
                            oldIcon = currentAliasSuffix,
                            newIcon = selectedAppIcon.aliasSuffix,
                        ),
                    )

                    updateAppIcon(
                        currentAliasSuffix = currentAliasSuffix,
                        newAliasSuffix = selectedAppIcon.aliasSuffix,
                    )
                },
            )
        }
    }

    private fun updateAppIcon(
        currentAliasSuffix: String,
        newAliasSuffix: String,
    ) {
        with(requireContext()) {
            changeAppLauncherIcon(
                packageManager = packageManager,
                shortcutManager = ShortcutManagerWrapperDefault(this),
                shortcutInfo = ShortcutsUpdaterDefault(this),
                appAlias = ComponentName(this, "$packageName.$currentAliasSuffix"),
                newAppAlias = ComponentName(this, "$packageName.$newAliasSuffix"),
            )
        }
    }

    override fun onResume() {
        super.onResume()
        showToolbar(getString(R.string.preferences_app_icon))
    }

    override fun onBackPressed() = findNavController().popBackStack()
}
