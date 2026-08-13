/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.quicksettings

import android.content.Context
import mozilla.components.concept.engine.permission.SitePermissions
import mozilla.components.concept.engine.permission.SitePermissions.AutoplayStatus
import mozilla.components.feature.sitepermissions.SitePermissionsRules
import mozilla.components.feature.sitepermissions.SitePermissionsRules.AutoplayAction
import org.mozilla.fenix.R
import org.mozilla.fenix.utils.Settings

sealed class AutoplayValue(
    open val label: String,
    open val rules: SitePermissionsRules,
    open val sitePermission: SitePermissions?,
) {
    override fun toString() = label
    abstract fun isSelected(): Boolean
    abstract fun createSitePermissionsFromCustomRules(origin: String, settings: Settings): SitePermissions
    abstract fun updateSitePermissions(sitePermissions: SitePermissions): SitePermissions
    abstract val isEnabled: Boolean

    val isVisible: Boolean get() = isSelected()

    data class AllowAll(
        override val label: String,
        override val rules: SitePermissionsRules,
        override val sitePermission: SitePermissions?,
    ) : AutoplayValue(label, rules, sitePermission) {
        override val isEnabled: Boolean = true
        override fun toString() = super.toString()
        override fun isSelected(): Boolean {
            val actions = if (sitePermission !== null) {
                listOf(
                    sitePermission.autoplayAudible,
                    sitePermission.autoplayInaudible,
                )
            } else {
                listOf(rules.autoplayAudible.toAutoplayStatus(), rules.autoplayInaudible.toAutoplayStatus())
            }

            return actions.all { it == AutoplayStatus.ALLOWED }
        }

        override fun createSitePermissionsFromCustomRules(origin: String, settings: Settings): SitePermissions {
            val rules = settings.getSitePermissionsCustomSettingsRules()
            return rules.copy(
                autoplayAudible = AutoplayAction.ALLOWED,
                autoplayInaudible = AutoplayAction.ALLOWED,
            ).toSitePermissions(origin)
        }

        override fun updateSitePermissions(sitePermissions: SitePermissions): SitePermissions {
            return sitePermissions.copy(
                autoplayAudible = AutoplayStatus.ALLOWED,
                autoplayInaudible = AutoplayStatus.ALLOWED,
            )
        }
    }

    data class BlockAll(
        override val label: String,
        override val rules: SitePermissionsRules,
        override val sitePermission: SitePermissions?,
    ) : AutoplayValue(label, rules, sitePermission) {
        override val isEnabled: Boolean = false
        override fun toString() = super.toString()
        override fun isSelected(): Boolean {
            val actions = if (sitePermission !== null) {
                listOf(
                    sitePermission.autoplayAudible,
                    sitePermission.autoplayInaudible,
                )
            } else {
                listOf(rules.autoplayAudible.toAutoplayStatus(), rules.autoplayInaudible.toAutoplayStatus())
            }

            return actions.all { it == AutoplayStatus.BLOCKED }
        }
        override fun createSitePermissionsFromCustomRules(origin: String, settings: Settings): SitePermissions {
            val rules = settings.getSitePermissionsCustomSettingsRules()
            return rules.copy(
                autoplayAudible = AutoplayAction.BLOCKED,
                autoplayInaudible = AutoplayAction.BLOCKED,
            ).toSitePermissions(origin)
        }

        override fun updateSitePermissions(sitePermissions: SitePermissions): SitePermissions {
            return sitePermissions.copy(
                autoplayAudible = AutoplayStatus.BLOCKED,
                autoplayInaudible = AutoplayStatus.BLOCKED,
            )
        }
    }

    data class BlockAudible(
        override val label: String,
        override val rules: SitePermissionsRules,
        override val sitePermission: SitePermissions?,
    ) : AutoplayValue(label, rules, sitePermission) {
        override val isEnabled: Boolean = false
        override fun toString() = super.toString()
        override fun isSelected(): Boolean {
            val (audible, inaudible) = if (sitePermission !== null) {
                sitePermission.autoplayAudible to sitePermission.autoplayInaudible
            } else {
                rules.autoplayAudible.toAutoplayStatus() to rules.autoplayInaudible.toAutoplayStatus()
            }

            return audible == AutoplayStatus.BLOCKED && inaudible == AutoplayStatus.ALLOWED
        }

        override fun createSitePermissionsFromCustomRules(origin: String, settings: Settings): SitePermissions {
            val rules = settings.getSitePermissionsCustomSettingsRules()
            return rules.copy(autoplayAudible = AutoplayAction.BLOCKED, autoplayInaudible = AutoplayAction.ALLOWED)
                .toSitePermissions(origin)
        }

        override fun updateSitePermissions(sitePermissions: SitePermissions): SitePermissions {
            return sitePermissions.copy(
                autoplayInaudible = AutoplayStatus.ALLOWED,
                autoplayAudible = AutoplayStatus.BLOCKED,
            )
        }
    }

    companion object {
        fun values(
            context: Context,
            settings: Settings,
            sitePermission: SitePermissions?,
        ): List<AutoplayValue> {
            val rules = settings.getSitePermissionsCustomSettingsRules()
            return listOf(
                AllowAll(
                    context.getString(R.string.quick_setting_option_autoplay_allowed),
                    rules,
                    sitePermission,
                ),
                BlockAll(
                    context.getString(R.string.quick_setting_option_autoplay_blocked),
                    rules,
                    sitePermission,
                ),
                BlockAudible(
                    context.getString(R.string.quick_setting_option_autoplay_block_audio),
                    rules,
                    sitePermission,
                ),
            )
        }

        fun getFallbackValue(
            context: Context,
            settings: Settings,
            sitePermission: SitePermissions?,
        ): AutoplayValue {
            val rules = settings.getSitePermissionsCustomSettingsRules()
            return BlockAudible(
                context.getString(R.string.preference_option_autoplay_block_audio2),
                rules,
                sitePermission,
            )
        }
    }
}
