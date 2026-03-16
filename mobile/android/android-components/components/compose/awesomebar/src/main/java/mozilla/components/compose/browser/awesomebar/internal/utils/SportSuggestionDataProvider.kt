/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal.utils

import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions.SportSuggestionDate
import mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions.SportSuggestionStatus
import mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions.SportSuggestionStatusType
import mozilla.components.compose.browser.awesomebar.internal.optimizedsuggestions.SportSuggestionTeam

internal class SportSuggestionDataProvider : PreviewParameterProvider<SportSuggestionPreviewModel> {

    override val values = sequenceOf(
        SportSuggestionPreviewModel(
            sport = "NBA",
            status = SportSuggestionStatus.FinalOverTime,
            statusType = SportSuggestionStatusType.PAST,
            date = SportSuggestionDate.General("28 Oct 2025"),
            awayTeam = SportSuggestionTeam(name = "Lakers", score = 107),
            homeTeam = SportSuggestionTeam(name = "Clippers", score = 103),
        ),
        SportSuggestionPreviewModel(
            sport = "NFL",
            status = SportSuggestionStatus.InProgress,
            statusType = SportSuggestionStatusType.LIVE,
            date = SportSuggestionDate.Today,
            awayTeam = SportSuggestionTeam(name = "Columbus Blue Jackets", score = 14),
            homeTeam = SportSuggestionTeam(name = "Minnesota Vikings", score = 12),
        ),
        SportSuggestionPreviewModel(
            sport = "MLB",
            status = SportSuggestionStatus.Scheduled,
            statusType = SportSuggestionStatusType.SCHEDULED,
            date = SportSuggestionDate.Tomorrow("5PM"),
            awayTeam = SportSuggestionTeam(name = "Yankees", score = null),
            homeTeam = SportSuggestionTeam(name = "Diamondbacks", score = null),
        ),
        SportSuggestionPreviewModel(
            sport = "NHL",
            status = SportSuggestionStatus.NotNecessary,
            statusType = SportSuggestionStatusType.PAST,
            date = SportSuggestionDate.General("28 Nov 24"),
            awayTeam = SportSuggestionTeam(name = "Lightning", score = 1),
            homeTeam = SportSuggestionTeam(name = "Canucks", score = 0),
        ),
    )
}

internal data class SportSuggestionPreviewModel(
    val sport: String,
    val status: SportSuggestionStatus,
    val statusType: SportSuggestionStatusType,
    val date: SportSuggestionDate,
    val homeTeam: SportSuggestionTeam,
    val awayTeam: SportSuggestionTeam,
)
