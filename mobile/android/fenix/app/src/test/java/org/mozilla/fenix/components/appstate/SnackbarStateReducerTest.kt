/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate

import mozilla.components.support.test.ext.joinBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SnackbarAction
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.DeletingBrowserDataInProgress
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.Dismiss
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.None

class SnackbarStateReducerTest {
    private val appStore = AppStore(
        initialState = AppState(
            snackbarState = DeletingBrowserDataInProgress,
        ),
    )

    @Test
    fun `WHEN snackbar dismissed action is dispatched THEN state is updated`() {
        appStore.dispatch(SnackbarAction.SnackbarDismissed).joinBlocking()

        assertTrue(appStore.state.snackbarState is Dismiss)
        assertTrue((appStore.state.snackbarState as Dismiss).previous == DeletingBrowserDataInProgress)
    }

    @Test
    fun `WHEN snackbar shown action is dispatched THEN state is updated`() {
        appStore.dispatch(SnackbarAction.SnackbarShown).joinBlocking()

        assertTrue(appStore.state.snackbarState is None)
        assertTrue((appStore.state.snackbarState as None).previous == DeletingBrowserDataInProgress)
    }

    @Test
    fun `WHEN reset action is dispatched THEN state is updated`() {
        appStore.dispatch(SnackbarAction.Reset).joinBlocking()

        assertTrue(appStore.state.snackbarState is None)
        assertTrue((appStore.state.snackbarState as None).previous == DeletingBrowserDataInProgress)
    }
}
