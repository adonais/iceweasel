/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.middleware

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.mozilla.fenix.GleanMetrics.FirefoxLabs
import org.mozilla.fenix.settings.labs.store.DialogState
import org.mozilla.fenix.settings.labs.store.LabsAction
import org.mozilla.fenix.settings.labs.store.LabsState

/**
 * Middleware that records Firefox Labs telemetry for the [LabsAction]s dispatched to the Labs
 * store.
 */
class LabsTelemetryMiddleware : Middleware<LabsState, LabsAction> {

    override fun invoke(
        store: Store<LabsState, LabsAction>,
        next: (LabsAction) -> Unit,
        action: LabsAction,
    ) {
        when (action) {
            is LabsAction.UpdateLabsItems -> {
                if (action.items.isEmpty()) {
                    FirefoxLabs.emptyStateShown.record()
                }
                recordInitialLabsFetch(action)
            }
            is LabsAction.FetchFailed -> FirefoxLabs.fetchFailed.record()
            is LabsAction.ToggleCompleted -> FirefoxLabs.toggleButtonPressed.record(
                FirefoxLabs.ToggleButtonPressedExtra(
                    slugId = action.slug,
                    enabled = action.enabled,
                    status = action.status,
                ),
            )
            is LabsAction.RestoreDefaultsCompleted -> FirefoxLabs.restoreDefaultsDialog.record(
                FirefoxLabs.RestoreDefaultsDialogExtra(
                    slugIds = action.itemsChanged.joinToString(","),
                    count = action.itemsChanged.size,
                    didUserConfirm = true,
                    succeeded = action.succeeded,
                ),
            )
            is LabsAction.ToggleLabsItem -> {
                if (store.state.dialogState is DialogState.ToggleLabsItem) {
                    FirefoxLabs.toggledDialog.record(
                        FirefoxLabs.ToggledDialogExtra(
                            slugId = action.item.slug,
                            didUserConfirm = true,
                        ),
                    )
                }
            }
            is LabsAction.ShowRestoreDefaultsDialog -> {
                FirefoxLabs.restoreDefaultsButtonPressed.record()
            }
            is LabsAction.CloseDialog -> {
                // Inspect dialogState before next() so we see the dialog that is being closed.
                when (val dialog = store.state.dialogState) {
                    is DialogState.ToggleLabsItem -> {
                        FirefoxLabs.toggledDialog.record(
                            FirefoxLabs.ToggledDialogExtra(
                                slugId = dialog.item.slug,
                                didUserConfirm = false,
                            ),
                        )
                    }
                    // User canceled dialog
                    is DialogState.RestoreDefaults -> {
                        FirefoxLabs.restoreDefaultsDialog.record(
                            FirefoxLabs.RestoreDefaultsDialogExtra(
                                didUserConfirm = false,
                                slugIds = "",
                                count = 0,
                                succeeded = false,
                            ),
                        )
                    }
                    else -> Unit
                }
            }
            is LabsAction.ShareFeedbackClicked -> {
                FirefoxLabs.shareFeedbackOpened.record(
                    FirefoxLabs.ShareFeedbackOpenedExtra(
                        slugId = action.item.slug,
                    ),
                )
            }
            else -> Unit
        }

        next(action)
    }

    private fun recordInitialLabsFetch(action: LabsAction.UpdateLabsItems) {
        FirefoxLabs.initialLabsFetch.record(
            FirefoxLabs.InitialLabsFetchExtra(
                slugIds = action.items.joinToString(",") { it.slug },
                count = action.items.size,
            ),
        )
    }
}
