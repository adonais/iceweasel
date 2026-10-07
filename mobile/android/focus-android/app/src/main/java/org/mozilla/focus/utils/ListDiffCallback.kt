/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.utils

import androidx.recyclerview.widget.DiffUtil

/** Diffs two lists by [key]; items with the same key are considered the same item and equal in content. */
class ListDiffCallback<T>(
    private val old: List<T>,
    private val new: List<T>,
    private val key: (T) -> Any,
) : DiffUtil.Callback() {
    override fun getOldListSize() = old.size

    override fun getNewListSize() = new.size

    override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int) =
        key(old[oldItemPosition]) == key(new[newItemPosition])

    override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int) = true
}
