package org.mozilla.fenix.ui.efficiency.tests

import org.junit.Test
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.TabDrawerSelectors

class TabbedBrowsingTest : BaseTest() {

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1046683
    @Test
    fun verifySyncedTabsWhenUserIsNotSignedInTest() {
        on.tabDrawer.navigateToPage()
            .mozVerifyElementIsNotSelected(TabDrawerSelectors.SYNCED_TABS_BUTTON)
        on.tabDrawer
            .mozClick(TabDrawerSelectors.SYNCED_TABS_BUTTON)
            .mozVerifyElementIsSelected(TabDrawerSelectors.SYNCED_TABS_BUTTON)
        on.tabDrawer
            .mozVerifyElementsByGroup("tabDrawerUnauthenticatedSyncedTabs")
            .mozClick(TabDrawerSelectors.SIGN_IN_TO_SYNC_BUTTON)
        on.settingsTurnOnSync
            .mozVerifyElementsByGroup()
    }
}
