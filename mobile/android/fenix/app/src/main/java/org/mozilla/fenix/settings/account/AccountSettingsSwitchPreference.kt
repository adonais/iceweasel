/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.account

import android.content.Context
import android.util.AttributeSet
import androidx.appcompat.content.res.AppCompatResources
import androidx.preference.PreferenceViewHolder
import androidx.preference.SwitchPreferenceCompat
import com.google.android.material.materialswitch.MaterialSwitch
import org.mozilla.fenix.R

/** Switch preference with the Account Settings-specific track tint. */
class AccountSettingsSwitchPreference
@JvmOverloads
constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : SwitchPreferenceCompat(context, attrs) {

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        (holder.findViewById(R.id.switchWidget) as? MaterialSwitch)?.trackTintList =
            AppCompatResources.getColorStateList(context, R.color.account_settings_switch_track_tint)
    }
}
