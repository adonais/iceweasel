/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.startupCrash

import android.content.Intent
import android.content.Intent.FLAG_ACTIVITY_NEW_TASK
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.mozilla.fenix.FenixApplication
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.components.components
import org.mozilla.fenix.crashes.StartupCrashCanary
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The [StartupCrashActivity] is the app activity launched when the ExceptionHandler is invoked
 * before the visualCompletenessQueue is ready. It will handle the crash report and app restart.
 */
class StartupCrashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_startup_crash)

        findViewById<ComposeView>(R.id.startupCrashActivity).setContent {
            FirefoxTheme {
                StartupCrashScreen(
                    store = StartupCrashStore(
                        initialState = StartupCrashState(UiState.Idle),
                        middleware = listOf(
                            StartupCrashMiddleware(
                                settings = LocalContext.current.settings(),
                                crashReporter = components.analytics.crashReporter,
                                reinitializeHandler = ::initializeAndRestartFenix,
                                startupCrashCanaryCache =
                                    StartupCrashCanary.build(applicationContext),
                            ),
                        ),
                    ),
                )
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
    }

    private suspend fun initializeAndRestartFenix() = withContext(Dispatchers.Main) {
        val fenixApplication = applicationContext as FenixApplication
        fenixApplication.initialize()
        val homeActivityIntent = Intent(applicationContext, HomeActivity::class.java)
        homeActivityIntent.flags = FLAG_ACTIVITY_NEW_TASK
        applicationContext.startActivity(homeActivityIntent)
        finish()
    }
}
