/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy
import org.mozilla.fenix.ui.efficiency.helpers.SwipeDirection

object SettingsAppIconSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        APP_ICON_ITEMS,
        APP_ICON_GRADIENTS_ITEMS,
        CHANGE_ICON_DIALOG,
    }

    val TOOLBAR_TITLE =
        navigationToolbarTitle(
            title = getStringResource(R.string.preferences_app_icon),
            description = "App icon toolbar title",
        )

    val FEATURED_SECTION =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_group_featured),
            description = "Featured app icon section header",
            groups = setOf(Group.APP_ICON_ITEMS),
            readiness = PageReadinessProfiles.READY_CONTENT,
        )
    val RETRO_2004 =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_retro_2004),
            description = "Retro 2004 app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val PIXELATED =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_pixelated),
            description = "Pixelated app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val CUDDLING =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_cuddling),
            description = "Cuddling app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val PRIDE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_pride),
            description = "Pride app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val FLAMING =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_flaming),
            description = "Flaming app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val MINIMAL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_minimal),
            description = "Minimal app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val MOMO =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_momo),
            description = "Momo app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val MOMO_SUBTITLE =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_momo_subtitle),
            description = "Momo app icon subtitle",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val COOL =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_cool),
            description = "Cool app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val SOLID_COLORS_SECTION =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_group_solid_colors),
            description = "Solid colors app icon section header",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val DEFAULT_ICON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_default),
            description = "Default solid color app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val LIGHT_ICON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_light),
            description = "Light solid color app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val DARK_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_dark),
            description = "Dark solid color app icon option",
            groups = setOf(Group.APP_ICON_ITEMS),
        )
    val RED_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_red),
            description = "Red solid color app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val GREEN_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_green),
            description = "Green solid color app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val BLUE_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_blue),
            description = "Blue solid color app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val PURPLE_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_purple),
            description = "Purple solid color app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val DARK_PURPLE_ICON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_purple_dark),
            description = "Dark Purple solid color app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val SUNRISE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_sunrise),
            description = "Sunrise gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val GOLDEN_HOUR =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_golden_hour),
            description = "Golden Hour gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val SUNSET =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_sunset),
            description = "Sunset gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val BLUE_HOUR =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_blue_hour),
            description = "Blue Hour gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val TWILIGHT =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_twilight),
            description = "Twilight gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val GRADIENTS_SECTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_group_gradients),
            description = "Gradients app icon section header",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val MIDNIGHT =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_midnight),
            description = "Midnight gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )
    val NORTHERN_LIGHTS =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.alternative_app_icon_option_gradient_northern_lights),
            description = "Northern Lights gradient app icon option",
            groups = setOf(Group.APP_ICON_GRADIENTS_ITEMS),
            scrollDirection = SwipeDirection.UP,
        )

    val CHANGE_ICON_DIALOG_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.restart_warning_dialog_title),
            description = "Change app icon dialog title",
            groups = setOf(Group.CHANGE_ICON_DIALOG),
        )
    val CHANGE_ICON_DIALOG_BODY =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.restart_warning_dialog_body_2),
            description = "Change app icon dialog body",
            groups = setOf(Group.CHANGE_ICON_DIALOG),
        )
    val CHANGE_ICON_DIALOG_CANCEL_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.restart_warning_dialog_button_negative),
            description = "Change app icon dialog Cancel button",
            groups = setOf(Group.CHANGE_ICON_DIALOG),
        )
    val CHANGE_ICON_DIALOG_CHANGE_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.restart_warning_dialog_button_positive_2),
            description = "Change app icon dialog Change button",
            groups = setOf(Group.CHANGE_ICON_DIALOG),
        )

    override val scrollTraversalOrder: Map<SelectorGroup, List<Selector>> =
        mapOf(
            Group.APP_ICON_GRADIENTS_ITEMS to
                listOf(
                    RED_ICON,
                    GREEN_ICON,
                    BLUE_ICON,
                    PURPLE_ICON,
                    DARK_PURPLE_ICON,
                    SUNRISE,
                    GOLDEN_HOUR,
                    SUNSET,
                    BLUE_HOUR,
                    TWILIGHT,
                    GRADIENTS_SECTION,
                    MIDNIGHT,
                    NORTHERN_LIGHTS,
                )
        )
}
