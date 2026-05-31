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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.home.sports.MatchCard
import org.mozilla.fenix.home.sports.MatchStatus
import org.mozilla.fenix.home.sports.SportCardErrorState
import org.mozilla.fenix.home.sports.fake.FakeMatchCardScenario
import org.mozilla.fenix.theme.FirefoxTheme

private const val DISABLED_CHIP_ALPHA = 0.4f

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

        MockServerSection(appStore = appStore)

        HorizontalDivider()

        MatchCardScenariosSection(state = state, appStore = appStore)

        HorizontalDivider()

        ErrorStateScenariosSection(state = state, appStore = appStore)
    }
}

@Composable
private fun MockServerSection(appStore: AppStore) {
    val settings = LocalContext.current.settings()
    var useMockServer by remember { mutableStateOf(settings.useMockWorldCupServer) }
    var sessionId by remember { mutableStateOf(settings.mockWorldCupServerSession) }

    SwitchListItem(
        label = stringResource(R.string.debug_drawer_sports_widget_tool_use_mock_server),
        checked = useMockServer,
        showSwitchAfter = true,
        onClick = { checked ->
            useMockServer = checked
            settings.useMockWorldCupServer = checked
            // Re-trigger a fetch so the change is visible immediately.
            appStore.dispatch(SportsWidgetAction.FetchMatches)
        },
    )

    if (useMockServer) {
        OutlinedTextField(
            value = sessionId,
            onValueChange = { newValue ->
                sessionId = newValue
                settings.mockWorldCupServerSession = newValue
            },
            label = { Text(stringResource(R.string.debug_drawer_sports_widget_tool_mock_server_session)) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = FirefoxTheme.layout.space.static200),
        )
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

@Composable
private fun ErrorStateScenariosSection(
    state: SportsWidgetState,
    appStore: AppStore,
) {
    val hasLiveMatch = state.matchCardStates.any { card ->
        card.matches.any { match ->
            match.matchStatus is MatchStatus.Live || match.matchStatus is MatchStatus.Penalties
        }
    }

    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = FirefoxTheme.layout.space.static200),
        horizontalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static50),
    ) {
        SportCardErrorState.entries.forEach { errorState ->
            val isSelected = state.errorState == errorState
            val action: SportsWidgetAction? = when {
                !hasLiveMatch -> null
                isSelected -> SportsWidgetAction.MatchCardStateUpdated(matchCardStates = state.matchCardStates)
                else -> SportsWidgetAction.FetchFailed(error = errorState)
            }
            SelectableChip(
                text = errorState.name,
                selected = isSelected,
                modifier = Modifier.alpha(if (hasLiveMatch) 1f else DISABLED_CHIP_ALPHA),
                onClick = { action?.let(appStore::dispatch) },
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
