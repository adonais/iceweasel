/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.utils.ext

import android.content.Context
import android.content.ContextWrapper
import android.os.Build.VERSION.SDK_INT
import android.os.Build.VERSION_CODES.TIRAMISU
import android.view.View
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.OnBackPressedDispatcherOwner
import androidx.activity.addCallback
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.findViewTreeLifecycleOwner

/**
 * Helper method to allow catching all back button presses and back gesture events.
 * On Android 33+ this will also catch the back press / gesture events that would close the keyboard.
 *
 * This will start observing back presses / back gesture events right away and
 * will handle the automatic observers cleanup whenever the view is destroyed.
 *
 * @param onBack The action to invoke for back presses or back gestures.
 */
fun View.handleBackEvents(onBack: () -> Unit) {
    val backInvokedDispatcher = if (SDK_INT >= TIRAMISU) {
        context.getActivityWindow()?.onBackInvokedDispatcher
    } else {
        null
    }
    val backInvokedCallback = if (SDK_INT >= TIRAMISU) {
        OnBackInvokedCallback { onBack() }
    } else {
        null
    }
    val backPressedDispatcher: OnBackPressedDispatcher? =
        (findViewTreeOnBackPressedDispatcherOwner() ?: findBackPressedDispatcherOwner(context))
            ?.onBackPressedDispatcher

    if (SDK_INT >= TIRAMISU) {
        backInvokedCallback?.let {
            backInvokedDispatcher?.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, it)
        }
    }
    backPressedDispatcher?.addCallback(this.findViewTreeLifecycleOwner()) { onBack() }

    findViewTreeLifecycleOwner()?.lifecycle?.addObserver(object : DefaultLifecycleObserver {
        override fun onDestroy(owner: LifecycleOwner) {
            if (SDK_INT >= TIRAMISU) {
                backInvokedCallback?.let {
                    backInvokedDispatcher?.unregisterOnBackInvokedCallback(it)
                }
            }
            owner.lifecycle.removeObserver(this)
        }
    })
}

/**
 * Fallback to try finding the [OnBackPressedDispatcherOwner] in any of [context] ancestors.
 * Functionality is mimicking the Jetpack Compose functionality from the `BackHandler` functionality.
 */
private fun findBackPressedDispatcherOwner(context: Context): OnBackPressedDispatcherOwner? {
    var innerContext = context
    while (innerContext is ContextWrapper) {
        if (innerContext is OnBackPressedDispatcherOwner) {
            return innerContext
        }
        innerContext = innerContext.baseContext
    }
    return null
}
