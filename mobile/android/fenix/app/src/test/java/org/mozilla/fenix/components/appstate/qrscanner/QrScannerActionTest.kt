/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.qrscanner

import mozilla.components.support.test.ext.joinBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.qrScanner.QrScannerState

class QrScannerActionTest {

    @Test
    fun `WHEN the QrScanner is requested THEN state should reflect that`() {
        val store = AppStore(initialState = AppState())

        store.dispatch(AppAction.QrScannerAction.QrScannerRequested).joinBlocking()

        val expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = true,
                inProgress = false,
                lastScanData = null,
            ),
        )

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the QrScanner request is consumed THEN the state should reflect that`() {
        val store = AppStore(initialState = AppState())

        store.dispatch(AppAction.QrScannerAction.QrScannerRequested).joinBlocking()

        var expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = true,
                inProgress = false,
                lastScanData = null,
            ),
        )

        assertEquals(expectedState, store.state)

        store.dispatch(AppAction.QrScannerAction.QrScannerRequestConsumed).joinBlocking()

        expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = false,
                inProgress = true,
                lastScanData = null,
            ),
        )

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the QrScanner Input is ready THEN the state should reflect that`() {
        val store = AppStore(initialState = AppState())

        store.dispatch(AppAction.QrScannerAction.QrScannerInputAvailable("test")).joinBlocking()

        val expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = false,
                inProgress = false,
                lastScanData = "test",
            ),
        )

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the QrScanner Input is consumed THEN the state should reflect that`() {
        val store = AppStore(initialState = AppState())

        store.dispatch(AppAction.QrScannerAction.QrScannerInputAvailable("test")).joinBlocking()

        var expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = false,
                inProgress = false,
                lastScanData = "test",
            ),
        )

        assertEquals(expectedState, store.state)

        store.dispatch(AppAction.QrScannerAction.QrScannerInputConsumed).joinBlocking()

        expectedState = AppState(qrScannerState = QrScannerState.DEFAULT)

        assertEquals(expectedState, store.state)
    }

    @Test
    fun `WHEN the QrScanner is dismissed THEN the state should reflect that`() {
        val store = AppStore(initialState = AppState())

        store.dispatch(AppAction.QrScannerAction.QrScannerRequested).joinBlocking()

        var expectedState = AppState(
            qrScannerState = QrScannerState(
                isRequesting = true,
                inProgress = false,
                lastScanData = null,
            ),
        )

        assertEquals(expectedState, store.state)

        store.dispatch(AppAction.QrScannerAction.QrScannerDismissed).joinBlocking()

        expectedState = AppState(qrScannerState = QrScannerState.DEFAULT)

        assertEquals(expectedState, store.state)
    }
}
