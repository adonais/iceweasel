/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.LinearLayout
import androidx.core.content.withStyledAttributes
import org.mozilla.fenix.R
import org.mozilla.fenix.databinding.TrackingProtectionCategoryBinding

/**
 * A tracking protection category, shown as a title above a description of what it blocks.
 *
 * @attr ref R.styleable.TrackingProtectionCategoryItem_categoryItemTitle
 * @attr ref R.styleable.TrackingProtectionCategoryItem_categoryItemDescription
 */
class TrackingProtectionCategoryItem
@JvmOverloads
constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : LinearLayout(context, attrs, defStyleAttr) {
    private val binding: TrackingProtectionCategoryBinding

    init {
        // A LinearLayout hands its children different default layout params depending on its
        // orientation, so this has to be set before anything is inflated into it.
        orientation = VERTICAL

        binding =
            TrackingProtectionCategoryBinding.inflate(
                LayoutInflater.from(context),
                this,
            )

        context.withStyledAttributes(
            attrs,
            R.styleable.TrackingProtectionCategoryItem,
            defStyleAttr,
            0,
        ) {
            binding.trackingProtectionCategoryTitle.text =
                resources.getString(
                    getResourceId(
                        R.styleable.TrackingProtectionCategoryItem_categoryItemTitle,
                        R.string.etp_cookies_title,
                    )
                )
            binding.trackingProtectionCategoryItemDescription.text =
                resources.getString(
                    getResourceId(
                        R.styleable.TrackingProtectionCategoryItem_categoryItemDescription,
                        R.string.etp_cookies_description,
                    )
                )
        }
    }

    /** The displayed title of this item. */
    val trackingProtectionCategoryTitle = binding.trackingProtectionCategoryTitle

    /** The displayed description of this item. */
    val trackingProtectionCategoryItemDescription = binding.trackingProtectionCategoryItemDescription
}
