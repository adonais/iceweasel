/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

package org.mozilla.fenix.longfox

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.mozilla.fenix.longfox.GameState.Companion.CELL_SIZE_DP
import org.mozilla.fenix.longfox.GameState.Companion.GAME_INTERVAL_TIME_MS

/**
 * A little intro screen to launch the game and provide high score and sound on/off switch.
 * @param initialGameState the current game state.
 * @param longFoxDataStore a data store to save game default preferences.
 * @param startGame a callback to start the game.
 */
@Composable
fun NewGameScreen(
    initialGameState: GameState,
    longFoxDataStore: LongFoxDataStore,
    startGame: () -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()

    val hiscore by longFoxDataStore.hiscoreFlow()
        .collectAsState(initial = 0, coroutineScope.coroutineContext)
    val soundOn by longFoxDataStore.soundOnFlow()
        .collectAsState(initial = false, coroutineScope.coroutineContext)
    var gameState by remember(initialGameState.numCells) {
        mutableStateOf(
            initialGameState.copy(
                fox = listOf(
                    GridPoint(1, 5),
                    GridPoint(1, 4),
                    GridPoint(1, 3),
                    GridPoint(1, 2)
                ),
                direction = Direction.DOWN,
                food = null,
            )
        )
    }

    LaunchedEffect(gameState) {
        while (true) {
            delay(GAME_INTERVAL_TIME_MS)
            gameState = gameState.foxAnimationDemo()
        }
    }

    Box(
        modifier = Modifier
            .size((CELL_SIZE_DP * gameState.numCells).dp)
            .border(1.dp, LongFoxColors.mortarColor)
            .clickable { startGame() },
    ) {
        GameCanvas(
            state = gameState,
        )
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xffff5500),
                text = stringResource(R.string.longfox)
            )
            Text(
                fontSize = 14.sp,
                color = Color.Yellow,
                text = stringResource(R.string.likes_cookies)
            )
            Text(
                modifier = Modifier.padding(top = 8.dp),
                fontSize = 16.sp,
                fontStyle = FontStyle.Italic,
                color = Color.Green,
                text = stringResource(R.string.tap_to_play)
            )
            Text(
                modifier = Modifier.padding(top = 36.dp, bottom = 36.dp),
                fontSize = 22.sp,
                color = Color.Cyan,
                text = stringResource(R.string.hiscore, hiscore)
            )
            Text(
                modifier = Modifier
                    .border(width = 2.dp, Color.DarkGray)
                    .padding(8.dp)
                    .clickable { coroutineScope.launch { longFoxDataStore.toggleSoundOn() } },
                fontSize = 16.sp,
                color = if (soundOn) Color.White else Color.Gray,
                text = if (soundOn) stringResource(R.string.sound_on) else stringResource(R.string.sound_off)
            )
        }
    }
}

@Preview
@Composable
fun NewGameScreenPreview() {
    val numCells = 18
    val canvasSizePx = CELL_SIZE_DP * numCells * LocalDensity.current.density
    NewGameScreen(
        initialGameState = GameState(numCells = numCells, size = Size(canvasSizePx, canvasSizePx), isGameOver = true),
        longFoxDataStore = LongFoxDataStore(LocalContext.current),
        startGame = {},
    )
}
