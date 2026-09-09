/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.store

import mozilla.components.lib.state.Action
import org.mozilla.fenix.settings.labs.LabsItem

/** Actions to dispatch through the [LabsStore] to modify the [LabsState]. */
sealed class LabsAction : Action {

    /**
     * [LabsAction] dispatched to indicate that the store is initialized and ready to use. This action is dispatched
     * automatically before any other action is processed. Its main purpose is to trigger initialization logic in
     * middlewares.
     */
    data object InitAction : LabsAction()

    /**
     * [LabsAction] dispatched to refresh the Labs against the latest from Nimbus, reconciling them with what is on
     * screen. Unlike [InitAction] this preserves the currently displayed items.
     */
    data object RefreshLabs : LabsAction()

    /**
     * [LabsAction] dispatched when the list of Labs items is updated.
     *
     * @property items The new list of [LabsItem]s to store.
     */
    data class UpdateLabsItems(val items: List<LabsItem>) : LabsAction()

    /** [LabsAction] dispatched when fetching the available Labs from Nimbus failed. */
    data object FetchFailed : LabsAction()

    /**
     * [LabsAction] dispatched when a Labs item is toggled.
     *
     * @property item The [LabsItem] to toggle.
     */
    data class ToggleLabsItem(val item: LabsItem) : LabsAction()

    /**
     * [LabsAction] dispatched to remove a Labs item from the screen, used when Nimbus reports the Lab is no longer
     * available.
     *
     * @property slug The Nimbus slug identifying the [LabsItem] to remove.
     */
    data class RemoveLabsItem(val slug: String) : LabsAction()

    /**
     * [LabsAction] dispatched after Nimbus processes a toggle.
     *
     * @property slug The Nimbus slug of the toggled Labs item.
     * @property enabled The enrollment state the user attempted to set.
     * @property status The raw Nimbus enroll/unenroll status (lowercased), or "exception" if the Nimbus call threw.
     */
    data class ToggleCompleted(
        val slug: String,
        val enabled: Boolean,
        val status: String,
    ) : LabsAction()

    /** [LabsAction] dispatched to restore the default settings without any Labs items enabled. */
    data object RestoreDefaults : LabsAction()

    /**
     * [LabsAction] dispatched after Nimbus processes a restore-defaults request.
     *
     * @property succeeded Whether unenrolling from all Firefox Labs completed without error.
     * @property itemsChanged The Nimbus slugs of the items that were enrolled when defaults were restored.
     */
    data class RestoreDefaultsCompleted(
        val succeeded: Boolean,
        val itemsChanged: List<String>,
    ) : LabsAction()

    /** [LabsAction] dispatched to restart the application. */
    data object RestartApplication : LabsAction()

    /**
     * [LabsAction] dispatched to show the confirmation dialog for toggling a [LabsItem] that requires an application
     * restart.
     *
     * @property item The [LabsItem] that will be toggled.
     */
    data class ShowToggleLabsItemDialog(val item: LabsItem) : LabsAction()

    /** [LabsAction] dispatched to show the dialog for restoring all the [LabsItem]s to their default disabled state. */
    data object ShowRestoreDefaultsDialog : LabsAction()

    /** [LabsAction] dispatched to close the current dialog. */
    data object CloseDialog : LabsAction()

    /**
     * [LabsAction] dispatched when the user taps a Labs item's "Share feedback" link.
     *
     * @property item The [LabsItem] whose feedback link was tapped.
     */
    data class ShareFeedbackClicked(val item: LabsItem) : LabsAction()
}
