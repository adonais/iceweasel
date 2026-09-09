/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.state.store

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.state.recover.toRecoverableTab
import org.junit.Test
import org.junit.runner.RunWith

// These tests are in a separate class because they needs to run with
// Robolectric (different runner, slower) while all other tests only
// need a Java VM (fast).
@RunWith(AndroidJUnit4::class)
class BrowserStoreExceptionTest {

    @Test(expected = IllegalArgumentException::class)
    fun `AddTabAction - Exception is thrown if parent doesn't exist`() {
        val store = BrowserStore()
        val parent = createTab("https://www.mozilla.org")
        val child = createTab("https://www.firefox.com", parent = parent)

        store.dispatch(TabListAction.AddTabAction(child))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `AddTabAction - Exception is thrown if tab already exists`() {
        val store = BrowserStore()
        val tab1 = createTab("https://www.mozilla.org")
        store.dispatch(TabListAction.AddTabAction(tab1))
        store.dispatch(TabListAction.AddTabAction(tab1))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `RestoreTabAction - Exception is thrown if tab already exists`() {
        val store = BrowserStore()
        val tab1 = createTab("https://www.mozilla.org")
        store.dispatch(TabListAction.AddTabAction(tab1))
        store.dispatch(
            TabListAction.RestoreAction(
                listOf(tab1.toRecoverableTab()),
                restoreLocation = TabListAction.RestoreAction.RestoreLocation.BEGINNING,
            )
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun `AddMultipleTabsAction - Exception is thrown in tab with id already exists`() {
        val store = BrowserStore(BrowserState(tabs = listOf(createTab(id = "a", url = "https://www.mozilla.org"))))

        store.dispatch(
            TabListAction.AddMultipleTabsAction(tabs = listOf(createTab(id = "a", url = "https://www.example.org")))
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun `AddMultipleTabsAction - Exception is thrown if parent id is set`() {
        val store = BrowserStore()

        val tab1 =
            createTab(
                id = "a",
                url = "https://www.mozilla.org",
            )

        val tab2 =
            createTab(
                id = "b",
                url = "https://www.firefox.com",
                private = true,
                parent = tab1,
            )

        store.dispatch(TabListAction.AddMultipleTabsAction(tabs = listOf(tab1, tab2)))
    }
}
