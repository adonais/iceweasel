/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.widget.ImageView
import androidx.annotation.AttrRes
import androidx.annotation.ColorInt
import androidx.preference.Preference
import androidx.preference.PreferenceViewHolder
import com.google.android.material.color.MaterialColors
import org.mozilla.fenix.GleanMetrics.CustomizationSettings
import org.mozilla.fenix.R
import org.mozilla.fenix.utils.view.addToRadioGroup
import com.google.android.material.R as materialR

/**
 * Custom Preference that renders the options list.
 * Selecting an option moves it to the top and persists to SharedPreferences.
 */
internal abstract class ToolbarShortcutPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : Preference(context, attrs) {

    @ColorInt
    private var colorTertiary: Int = 0

    @ColorInt
    private var colorOnSurface: Int = 0

    @ColorInt
    private var colorOnSurfaceVariant: Int = 0

    init {
        layoutResource = R.layout.preference_toolbar_shortcut
        isSelectable = false
    }

    protected abstract val options: List<ShortcutOption>
    protected abstract fun readSelectedKey(): String
    protected abstract fun writeSelectedKey(key: String)
    protected abstract fun getToolbarType(): String
    protected abstract fun getSelectedIconImageView(holder: PreferenceViewHolder): ImageView

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)

        val selectedIcon = getSelectedIconImageView(holder)

        colorTertiary = holder.itemView.getMaterialColor(materialR.attr.colorTertiary)
        colorOnSurface = holder.itemView.getMaterialColor(materialR.attr.colorOnSurface)
        colorOnSurfaceVariant = holder.itemView.getMaterialColor(materialR.attr.colorOnSurfaceVariant)

        selectedIcon.setImageResource(getSelectedOption().icon)
    }

    private fun getSelectedOption(): ShortcutOption {
        val selectedKey = readSelectedKey()
        return options.firstOrNull {
            it.key == ShortcutType.fromValue(selectedKey)
        } ?: options.first()
    }

    @Suppress("SpreadOperator")
    fun getShortcutOptions(): List<RadioButtonPreference> {
        val shortcutOptions = options
            .distinctBy { it.key }
            .map { newOption ->
                createShortcutRadioButton(
                    newOption = newOption,
                    selectedOption = getSelectedOption(),
                )
            }

        addToRadioGroup(*shortcutOptions.toTypedArray())
        return shortcutOptions
    }

    private fun createShortcutRadioButton(
        newOption: ShortcutOption,
        selectedOption: ShortcutOption,
    ): RadioButtonPreference = RadioButtonPreference(context).apply {
        key = newOption.key.value
        title = context.getString(newOption.label)
        setCheckedWithoutClickListener(newOption == selectedOption)
        onClickListener {
            CustomizationSettings.toolbarShortcutSelection.record(
                CustomizationSettings.ToolbarShortcutSelectionExtra(
                    toolbarType = getToolbarType(),
                    item = newOption.key.value,
                ),
            )
            writeSelectedKey(newOption.key.value)
            notifyChanged()
        }
    }

    private fun View.getMaterialColor(
        @AttrRes attr: Int,
    ): Int {
        return MaterialColors.getColor(this, attr)
    }
}
