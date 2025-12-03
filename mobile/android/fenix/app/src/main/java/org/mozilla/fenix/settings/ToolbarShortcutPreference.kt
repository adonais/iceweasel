/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import android.content.Context
import android.content.res.ColorStateList
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.TextView
import androidx.annotation.AttrRes
import androidx.annotation.ColorInt
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.core.widget.ImageViewCompat
import androidx.preference.Preference
import androidx.preference.PreferenceViewHolder
import com.google.android.material.color.MaterialColors
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.settings
import com.google.android.material.R as materialR
import mozilla.components.ui.icons.R as iconsR

/**
 * Custom Preference that renders the options list.
 * Selecting an option moves it to the top and persists to SharedPreferences.
 */
class ToolbarShortcutPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : Preference(context, attrs) {

    private val options: List<Option> by lazy {
        listOf(
            Option(
                Keys.NEW_TAB,
                iconsR.drawable.mozac_ic_plus_24,
                R.string.toolbar_customize_shortcut_new_tab,
            ),
            Option(
                Keys.SHARE,
                iconsR.drawable.mozac_ic_share_android_24,
                R.string.toolbar_customize_shortcut_share,
            ),
            Option(
                Keys.BOOKMARK,
                iconsR.drawable.mozac_ic_bookmark_24,
                R.string.toolbar_customize_shortcut_add_bookmark,
            ),
            Option(
                Keys.TRANSLATE,
                iconsR.drawable.mozac_ic_translate_24,
                R.string.toolbar_customize_shortcut_translate,
            ),
            Option(
                Keys.HOMEPAGE,
                iconsR.drawable.mozac_ic_home_24,
                R.string.toolbar_customize_shortcut_homepage,
            ),
            Option(
                Keys.BACK,
                iconsR.drawable.mozac_ic_back_24,
                R.string.toolbar_customize_shortcut_back,
            ),
        )
    }

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

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)

        val settings = context.settings()
        val selectedKey = settings.toolbarShortcutKey

        val selectedContainer = holder.findViewById(R.id.selected_container) as LinearLayout
        val optionsContainer = holder.findViewById(R.id.options_container) as LinearLayout
        val separator = holder.findViewById(R.id.separator) as View

        colorTertiary = holder.itemView.getMaterialColor(materialR.attr.colorTertiary)
        colorOnSurface = holder.itemView.getMaterialColor(materialR.attr.colorOnSurface)
        colorOnSurfaceVariant = holder.itemView.getMaterialColor(materialR.attr.colorOnSurfaceVariant)

        val selected = options.firstOrNull { it.key == selectedKey } ?: options.first()

        selectedContainer.removeAllViews()
        selectedContainer.addView(
            makeRow(
                parent = selectedContainer,
                option = selected,
                isChecked = true,
                isEnabled = false,
                onClick = {},
            ),
        )

        val remaining = options.filter { it.key != selected.key }.distinctBy { it.key }
        optionsContainer.removeAllViews()
        remaining.forEach { opt ->
            optionsContainer.addView(
                makeRow(
                    parent = optionsContainer,
                    option = opt,
                    isChecked = false,
                    isEnabled = true,
                ) { newlySelected ->
                    settings.toolbarShortcutKey = newlySelected.key
                    notifyChanged()
                },
            )
        }

        separator.visibility = if (remaining.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun makeRow(
        parent: ViewGroup,
        option: Option,
        isChecked: Boolean,
        isEnabled: Boolean,
        onClick: (Option) -> Unit,
    ): View {
        val row = LayoutInflater.from(context)
            .inflate(R.layout.toolbar_shortcut_row, parent, false) as LinearLayout

        val radio = row.findViewById<RadioButton>(R.id.row_radio)
        val icon = row.findViewById<ImageView>(R.id.row_icon)
        val label = row.findViewById<TextView>(R.id.row_label)

        icon.setImageResource(option.icon)
        label.setText(option.label)

        radio?.setStartCheckedIndicator()
        radio.isChecked = isChecked
        radio.isEnabled = true

        label.setTextColor(
            if (isChecked) colorTertiary else colorOnSurface,
        )

        ImageViewCompat.setImageTintList(
            icon,
            ColorStateList.valueOf(
                if (isChecked) colorTertiary else colorOnSurface,
            ),
        )

        radio.buttonTintList = ColorStateList(
            arrayOf(
                intArrayOf(android.R.attr.state_checked),
                intArrayOf(-android.R.attr.state_checked),
            ),
            intArrayOf(colorTertiary, colorOnSurfaceVariant),
        )

        if (isEnabled) {
            val clicker = View.OnClickListener {
                onClick(option)
            }
            row.setOnClickListener(clicker)
        }

        row.isEnabled = isEnabled

        return row
    }

    private fun View.getMaterialColor(@AttrRes attr: Int): Int {
        return MaterialColors.getColor(this, attr)
    }

    private data class Option(
        val key: String,
        @param:DrawableRes val icon: Int,
        @param:StringRes val label: Int,
    )

    /**
     * String keys used to persist and map the selected toolbar shortcut option.
     * These values are stored in preferences and also used to resolve the UI/action.
     */
    object Keys {
        const val NEW_TAB = "new_tab"
        const val SHARE = "share"
        const val BOOKMARK = "bookmark"
        const val TRANSLATE = "translate"
        const val HOMEPAGE = "homepage"
        const val BACK = "back"
    }
}
