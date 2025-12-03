/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.logins.ui

import android.view.Window
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.ext.settings

@Composable
internal fun RequireAuthorization(
    store: LoginsStore,
    content: @Composable () -> Unit,
) {
    val state by store.observeAsState(store.state.biometricAuthenticationState) {
        it.biometricAuthenticationState
    }

    ObserveLifecycle(store)

    when (state) {
        is BiometricAuthenticationState.Inert -> StartAuthorization(store)
        is BiometricAuthenticationState.ReadyToLock -> NotAuthorized(store)
        is BiometricAuthenticationState.InProgress -> BiometricAuthenticationDialog(store)
        is BiometricAuthenticationState.Failed -> NotAuthorized(store)
        is BiometricAuthenticationState.Authorized -> content()
    }
}

@Composable
private fun StartAuthorization(store: LoginsStore) {
    LaunchedEffect(Unit) {
        store.dispatch(BiometricAuthenticationAction.Started)
    }
}

@Composable
private fun NotAuthorized(store: LoginsStore) {
    UnlockLoginsScreen(
        onUnlockClicked = { store.dispatch(UnlockScreenAction.UnlockTapped) },
        onLeaveClicked = { store.dispatch(UnlockScreenAction.LeaveTapped) },
    )
}

@Composable
private fun ObserveLifecycle(store: LoginsStore) {
    val activityContext = LocalActivity.current as ComponentActivity

    DisposableEffect(LocalLifecycleOwner.current) {
        val lifecycle = ProcessLifecycleOwner.get().lifecycle
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) {
                super.onPause(owner)
                activityContext.window?.lock()
                store.dispatch(LifecycleAction.OnPause)
            }

            override fun onResume(owner: LifecycleOwner) {
                super.onResume(owner)
                if (activityContext.settings().allowScreenCaptureInSecureScreens) {
                    activityContext.window?.unlock()
                } else {
                    activityContext.window?.lock()
                }
                store.dispatch(LifecycleAction.OnResume)
            }
        }
        lifecycle.addObserver(observer)

        onDispose {
            activityContext.window?.unlock()
            store.dispatch(ViewDisposed)
            lifecycle.removeObserver(observer)
        }
    }
}

private fun Window.lock() = addFlags(WindowManager.LayoutParams.FLAG_SECURE)
private fun Window.unlock() = clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
