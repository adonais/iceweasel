/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * A middleware for handling side-effects in response to [AppIconAction]s.
 *
 * @param updateAppIcon A interface that updates the main activity alias with the newly selected one.
 */
class AppIconMiddleware(
    private val updateAppIcon: AppIconUpdater,
) : Middleware<AppIconState, AppIconAction> {

    override fun invoke(
        context: MiddlewareContext<AppIconState, AppIconAction>,
        next: (AppIconAction) -> Unit,
        action: AppIconAction,
    ) {
        next(action)

        when (action) {
            is UserAction.Confirmed -> {
                if (updateAppIcon(old = action.newIcon, new = action.oldIcon)) {
                    context.dispatch(SystemAction.Applied(action.newIcon))
                } else {
                    context.dispatch(
                        SystemAction.UpdateFailed(
                            oldIcon = action.oldIcon,
                            newIcon = action.newIcon,
                        ),
                    )
                }
            }

            is UserAction.Dismissed,
            is UserAction.Selected,
            is SystemAction.Applied,
            is SystemAction.DialogDismissed,
            is SystemAction.SnackbarDismissed,
            is SystemAction.SnackbarShown,
            is SystemAction.UpdateFailed,
                -> {
                // no-op
            }
        }
    }
}

/**
 * An interface for applying a new app icon.
 */
fun interface AppIconUpdater : (AppIcon, AppIcon) -> Boolean {
    override fun invoke(old: AppIcon, new: AppIcon): Boolean
}
