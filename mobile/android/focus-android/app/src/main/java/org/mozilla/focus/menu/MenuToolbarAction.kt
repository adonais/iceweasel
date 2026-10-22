/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import android.view.View
import android.view.ViewGroup
import androidx.annotation.ColorInt
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.res.colorResource
import kotlinx.coroutines.CoroutineScope
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.concept.toolbar.Toolbar
import org.mozilla.focus.R
import org.mozilla.focus.ui.theme.FocusTheme

/**
 * [Toolbar.Action] showing the browser menu button and when clicked the menu itself in a popup anchored to this button.
 *
 * [iconTintColor] overrides the color the other toolbar icons use, which custom tabs need since the application that
 * opened them can theme their toolbar.
 */
class MenuToolbarAction(
    @param:ColorInt private val iconTintColor: Int? = null,
    override val weight: () -> Int = { -1 },
    private val buildMenuStore: (scope: CoroutineScope, onDismiss: () -> Unit) -> MenuStore,
) : Toolbar.Action {

    override fun createView(parent: ViewGroup): View =
        ComposeView(parent.context).apply {
            setContent {
                FocusTheme {
                    MenuButton(
                        iconTint = iconTintColor?.let { Color(it) } ?: colorResource(R.color.primaryText),
                        buildMenuStore = buildMenuStore,
                    )
                }
            }
        }

    override fun bind(view: View) = Unit
}
