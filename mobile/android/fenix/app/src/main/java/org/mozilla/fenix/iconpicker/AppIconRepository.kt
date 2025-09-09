/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import org.mozilla.fenix.R
import org.mozilla.fenix.utils.Settings

/**
 * An interface for accessing available and selected app icon options, as well as persisting the
 * selected one.
 */
interface AppIconRepository {
    /**
     * The icon selected by the user or the default one.
     */
    var selectedAppIcon: AppIcon

    /**
     * Icons available for the user to choose from.
     */
    val groupedAppIcons: Map<IconGroupTitle, List<AppIcon>>
}

/**
 * Default implementation of the [AppIconRepository]
 *
 * @param settings The settings object used to persist the selected icon.
 */
class DefaultAppIconRepository(
    private val settings: Settings,
) : AppIconRepository {
    override var selectedAppIcon: AppIcon
        get() = AppIcon.fromString(settings.selectedAppIcon)
        set(value) {
            settings.selectedAppIcon = value.aliasSuffix
        }

    override val groupedAppIcons: Map<IconGroupTitle, List<AppIcon>>
        get() = mapOf(
            IconGroupTitle(R.string.alternative_app_icon_group_solid_colors) to listOf(
                AppIcon.AppDefault,
                AppIcon.AppSolidLight,
                AppIcon.AppSolidDark,
                AppIcon.AppSolidRed,
                AppIcon.AppSolidGreen,
                AppIcon.AppSolidBlue,
                AppIcon.AppSolidPurple,
                AppIcon.AppSolidPurpleDark,
            ),
            IconGroupTitle(R.string.alternative_app_icon_group_gradients) to listOf(
                AppIcon.AppGradientSunrise,
                AppIcon.AppGradientGoldenHour,
                AppIcon.AppGradientSunset,
                AppIcon.AppGradientBlueHour,
                AppIcon.AppGradientTwilight,
                AppIcon.AppGradientMidnight,
                AppIcon.AppGradientNorthernLights,
            ),
        )
}
