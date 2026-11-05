/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import android.os.Parcel
import androidx.annotation.OptIn
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.not
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.geckoview.ExperimentalGeckoViewApi
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings

@RunWith(AndroidJUnit4::class)
@MediumTest
@OptIn(ExperimentalGeckoViewApi::class)
class SessionProcessPlacementTest : BaseSessionTest() {

    @Test
    fun settingsParcelRoundTrip() {
        val settings = GeckoSessionSettings.Builder().pictureInPictureToken(PLACEMENT_TOKEN).build()

        val parcel = Parcel.obtain()
        settings.writeToParcel(parcel, 0)
        parcel.setDataPosition(0)

        val parceled = GeckoSessionSettings.CREATOR.createFromParcel(parcel)
        assertThat("Parceled settings must match", parceled, equalTo(settings))
        parcel.recycle()
    }

    @Test
    fun defaultSettingsOpenSession() {
        val session = sessionRule.createOpenSession()
        assertUnplaced(session)
    }

    @Test
    fun unknownTokenIsIgnored() {
        assertUnplaced(openSessionWithToken(PLACEMENT_TOKEN))
    }

    @Test
    fun validTokenPlacesSessionWithSource() {
        mainSession.loadTestPath(HELLO_HTML_PATH)
        mainSession.waitForPageStop()

        val token = sessionRule.mintPictureInPicturePlacementToken(mainSession)
        val session = openSessionWithToken(token)
        session.loadTestPath(HELLO_HTML_PATH)
        session.waitForPageStop()

        assertThat(
            "Placed session should join the browsing context group of the source",
            sessionRule.getSessionBrowsingContextGroupId(session),
            equalTo(sessionRule.getSessionBrowsingContextGroupId(mainSession)),
        )
        assertThat(
            "Placed session should keep the remote type of the source",
            sessionRule.getSessionRemoteType(session),
            equalTo(sessionRule.getSessionRemoteType(mainSession)),
        )
        assertThat(
            "Placed session should share the content process of the source",
            sessionRule.getSessionPid(session),
            equalTo(sessionRule.getSessionPid(mainSession)),
        )
    }

    @Test
    fun tokenPlacesASingleSession() {
        mainSession.loadTestPath(HELLO_HTML_PATH)
        mainSession.waitForPageStop()

        val token = sessionRule.mintPictureInPicturePlacementToken(mainSession)
        val placed = openSessionWithToken(token)
        placed.loadTestPath(HELLO_HTML_PATH)
        placed.waitForPageStop()
        assertThat(
            "First session should be placed with the source",
            sessionRule.getSessionBrowsingContextGroupId(placed),
            equalTo(sessionRule.getSessionBrowsingContextGroupId(mainSession)),
        )

        assertUnplaced(openSessionWithToken(token))
    }

    @Test
    fun newerRequestSupersedesPendingToken() {
        mainSession.loadTestPath(HELLO_HTML_PATH)
        mainSession.waitForPageStop()

        val otherSource = sessionRule.createOpenSession()
        otherSource.loadTestPath(HELLO_HTML_PATH)
        otherSource.waitForPageStop()

        val superseded = sessionRule.mintPictureInPicturePlacementToken(mainSession)
        val current = sessionRule.mintPictureInPicturePlacementToken(otherSource)

        assertUnplaced(openSessionWithToken(superseded))

        val placed = openSessionWithToken(current)
        placed.loadTestPath(HELLO_HTML_PATH)
        placed.waitForPageStop()
        assertThat(
            "Superseding token should place its session with the source it was minted from",
            sessionRule.getSessionBrowsingContextGroupId(placed),
            equalTo(sessionRule.getSessionBrowsingContextGroupId(otherSource)),
        )
        assertThat(
            "Superseding token should not place its session with the superseded source",
            sessionRule.getSessionBrowsingContextGroupId(placed),
            not(equalTo(sessionRule.getSessionBrowsingContextGroupId(mainSession))),
        )
    }

    private fun openSessionWithToken(token: String): GeckoSession {
        return sessionRule.createOpenSession(
            GeckoSessionSettings.Builder(mainSession.settings).pictureInPictureToken(token).build()
        )
    }

    private fun assertUnplaced(session: GeckoSession) {
        mainSession.loadTestPath(HELLO_HTML_PATH)
        mainSession.waitForPageStop()

        session.loadTestPath(HELLO_HTML_PATH)
        session.waitForPageStop()

        assertThat(
            "Session should get a content process",
            sessionRule.getSessionPid(session),
            greaterThan(0),
        )
        assertThat(
            "Session should get a browsing context group of its own",
            sessionRule.getSessionBrowsingContextGroupId(session),
            not(equalTo(sessionRule.getSessionBrowsingContextGroupId(mainSession))),
        )
        assertThat(
            "Session should get the predicted remote type",
            sessionRule.getSessionRemoteType(session),
            equalTo(sessionRule.getSessionRemoteType(mainSession)),
        )
    }

    companion object {
        const val PLACEMENT_TOKEN = "{00000000-0000-0000-0000-000000000000}"
    }
}
