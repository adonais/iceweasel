/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.sportswidget

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.base.SelectableChip
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SportsWidgetAction
import org.mozilla.fenix.components.appstate.sports.SportsWidgetState
import org.mozilla.fenix.compose.list.SwitchListItem
import org.mozilla.fenix.home.sports.MatchCard
import org.mozilla.fenix.home.sports.fake.FakeMatchCardScenario
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Debug tool for the Homepage Sports Widget.
 *
 * @param state Current [SportsWidgetState] to display.
 * @param appStore [AppStore] used to dispatch [SportsWidgetAction] actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SportsWidgetDebugTool(
    state: SportsWidgetState,
    appStore: AppStore,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

    ModalBottomSheet(
        onDismissRequest = {
            appStore.dispatch(SportsWidgetAction.DebugToolVisibilityChanged(visible = false))
        },
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = Color.Transparent,
    ) {
        SportsWidgetDebugToolContent(state = state, appStore = appStore)
    }
}

@Composable
private fun SportsWidgetDebugToolContent(
    state: SportsWidgetState,
    appStore: AppStore,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
    ) {
        SwitchListItem(
            label = stringResource(R.string.debug_drawer_sports_widget_tool_world_cup_started),
            checked = state.hasWorldCupStarted,
            showSwitchAfter = true,
            onClick = {
                appStore.dispatch(SportsWidgetAction.WorldCupStartedOverrideUpdated(hasWorldCupStartedOverride = it))
            },
        )

        SwitchListItem(
            label = stringResource(R.string.debug_drawer_sports_widget_tool_one_week_to_world_cup),
            checked = state.isOneWeekToWorldCup,
            showSwitchAfter = true,
            onClick = {
                appStore.dispatch(
                    SportsWidgetAction.OneWeekToWorldCupOverrideUpdated(
                        isOneWeekToWorldCupOverride = it,
                    ),
                )
            },
        )

        SwitchListItem(
            label = stringResource(R.string.debug_drawer_sports_widget_tool_skipped_follow_team),
            checked = state.hasSkippedFollowTeam,
            showSwitchAfter = true,
            onClick = {
                appStore.dispatch(SportsWidgetAction.SkipFollowTeamUpdated(hasSkippedFollowTeam = it))
            },
        )

        HorizontalDivider()

        MatchCardScenariosSection(state = state, appStore = appStore)
    }
}

@Composable
private fun MatchCardScenariosSection(
    state: SportsWidgetState,
    appStore: AppStore,
) {
    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static200),
        horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static50),
    ) {
        val currentCardStates = state.matchCardStates

        FakeMatchCardScenario.entries.forEach { scenario ->
            val matchCardStates: List<MatchCard> = scenario.build()
            val isSelected = currentCardStates == matchCardStates
            SelectableChip(
                text = scenario.label,
                selected = isSelected,
                onClick = {
                    appStore.dispatch(
                        SportsWidgetAction.MatchCardStateUpdated(
                            matchCardStates = if (isSelected) emptyList() else matchCardStates,
                        ),
                    )
                },
            )
        }
    }
}

private class SportsWidgetDebugToolPreviewProvider : PreviewParameterProvider<SportsWidgetState> {
    override val values = sequenceOf(
        SportsWidgetState(),
        SportsWidgetState(
            countriesSelected = setOf("USA", "PAR"),
            isCountdownWidgetVisible = true,
            hasSkippedFollowTeam = false,
            matchCardStates = FakeMatchCardScenario.Live.build(),
        ),
        SportsWidgetState(
            countriesSelected = setOf("USA"),
            isCountdownWidgetVisible = false,
            hasSkippedFollowTeam = true,
            matchCardStates = FakeMatchCardScenario.Final.build(),
        ),
    )
}

@PreviewLightDark
@Composable
private fun SportsWidgetDebugToolPreview(
    @PreviewParameter(SportsWidgetDebugToolPreviewProvider::class) state: SportsWidgetState,
) {
    FirefoxTheme {
        Surface {
            SportsWidgetDebugToolContent(
                state = state,
                appStore = AppStore(),
            )
        }
    }
}
