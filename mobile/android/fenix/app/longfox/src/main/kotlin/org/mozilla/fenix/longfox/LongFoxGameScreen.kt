/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

package org.mozilla.fenix.longfox

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.mozilla.fenix.longfox.GameState.Companion.CELL_SIZE_DP
import org.mozilla.fenix.longfox.GameState.Companion.GAME_INTERVAL_TIME_MS
import org.mozilla.fenix.longfox.GameState.Companion.MAX_JUST_EATEN_COUNTDOWN
import org.mozilla.fenix.longfox.GameState.Companion.MAX_SCORE_CELEBRATION_COUNTDOWN

/**
 * The main composable container for the game.
 * Holds the game state and callbacks for resizing the screen, handling touch, playing sounds etc.
 */
@Composable
fun LongFoxGameScreen() {
    var celebrationShown by remember { mutableStateOf(false) }
    var celebrationSeed by remember { mutableIntStateOf(0) }
    GameBackground(celebrationShown, celebrationSeed) {
        // Make a square game grid that fits on the screen
        val density = LocalDensity.current.density
        val numCells = (minOf(maxWidth, maxHeight).value / CELL_SIZE_DP).toInt()
        val canvasSizePx = CELL_SIZE_DP * numCells * density
        var gameState by remember(numCells) {
            mutableStateOf(GameState(numCells = numCells, size = Size(canvasSizePx, canvasSizePx), isGameOver = true))
        }
        val restartGame = { gameState = GameState(numCells = numCells, size = Size(canvasSizePx, canvasSizePx)) }
        SideEffect {
            if (gameState.shouldCelebrateScore && !celebrationShown) celebrationSeed = gameState.score
            celebrationShown = gameState.shouldCelebrateScore
        }

        // Tap and swipe events need to be passed through to the game.
        // Position should be recalculated if the screen is resized / configuration changed.
        val canvasOffsetXPx = (maxWidth.value * density - canvasSizePx) / 2f
        val canvasOffsetYPx = (maxHeight.value * density - canvasSizePx) / 2f
        val onTap by rememberUpdatedState { offset: Offset ->
            gameState = gameState.onTap(
                Offset(offset.x - canvasOffsetXPx, offset.y - canvasOffsetYPx),
            )
        }
        val onSwipe by rememberUpdatedState { direction: Direction ->
            gameState = gameState.onSwipe(direction)
        }
        val context = LocalContext.current
        val coroutineScope = rememberCoroutineScope()
        val longFoxDataStore = remember(context) { LongFoxDataStore(context) }
        val soundOn by longFoxDataStore.soundOnFlow()
            .collectAsState(initial = false, coroutineScope.coroutineContext)
        val soundEffectsPlayer = remember(soundOn) { SoundEffectsPlayer(context, soundOn) }

        DisposableEffect(soundEffectsPlayer) {
            onDispose { soundEffectsPlayer.release() }
        }
        LaunchedEffect(gameState.isGameOver) {
            if (gameState.isGameOver) soundEffectsPlayer.playSound(R.raw.sadwobble)
        }
        // This is the main game loop:
        // While the game is not over, wait a clock tick, move the fox and check for collisions.
        // Play a sound effect if that seems appropriate.
        LaunchedEffect(gameState) {
            while (!gameState.isGameOver) {
                delay(GAME_INTERVAL_TIME_MS)
                val moved = gameState.moveFox()
                if (moved.scoreCelebrationCountdown == MAX_SCORE_CELEBRATION_COUNTDOWN) {
                    soundEffectsPlayer.playSound(R.raw.happyvibes)
                } else if (moved.justEatenCountdown == MAX_JUST_EATEN_COUNTDOWN) {
                    soundEffectsPlayer.playSound(R.raw.eatfood)
                } else if (!moved.shouldCelebrateScore) {
                    if (moved.beepNext) {
                        soundEffectsPlayer.playSound(R.raw.beep)
                    } else {
                        soundEffectsPlayer.playSound(R.raw.boop)
                    }
                }
                gameState = moved.toggleBeepNext()
            }
            coroutineScope.launch { longFoxDataStore.saveIfHiscore(gameState.score) }
        }

        val minSwipeDistance = 50f
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(onTap = { onTap(it) })
                }
                .pointerInput(Unit) {
                    var totalDrag = Offset.Zero
                    detectDragGestures(
                        onDrag = { change, dragAmount ->
                            change.consume()
                            totalDrag += dragAmount
                        },
                        onDragEnd = {
                            val (dx, dy) = totalDrag
                            if (maxOf(kotlin.math.abs(dx), kotlin.math.abs(dy)) >= minSwipeDistance) {
                                val direction = if (kotlin.math.abs(dx) > kotlin.math.abs(dy)) {
                                    if (dx > 0) Direction.RIGHT else Direction.LEFT
                                } else {
                                    if (dy > 0) Direction.DOWN else Direction.UP
                                }
                                onSwipe(direction)
                            }
                            totalDrag = Offset.Zero
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            if (gameState.isGameOver) {
                NewGameScreen(
                    longFoxDataStore = longFoxDataStore,
                    initialGameState = gameState,
                    startGame = restartGame,
                )
            } else {
                GameCanvas(gameState)
            }
            Sparkles(
                headCentre = Offset(
                    (gameState.fox.first().x + 0.5f) * gameState.cellSize,
                    (gameState.fox.first().y + 0.5f) * gameState.cellSize,
                ),
                numCells = gameState.numCells,
                active = gameState.justEaten,
            )
        }
        Row(modifier = Modifier
            .padding(12.dp)
            .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val onBackPressedDispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
            Image(
                painter = painterResource(id = R.drawable.outline_arrow_back_24),
                modifier = Modifier
                    .padding(top = 12.dp, bottom = 12.dp, end = 12.dp)
                    .clickable {
                        onBackPressedDispatcher?.onBackPressed()
                    },
                contentDescription = stringResource(R.string.back)
            )
            if (gameState.score > 0) {
                ScoreContainer(gameState.score)
            }
        }
    }
}

@Preview
@Composable
fun LongFoxGameScreenPreview() {
    MaterialTheme {
        LongFoxGameScreen()
    }
}
