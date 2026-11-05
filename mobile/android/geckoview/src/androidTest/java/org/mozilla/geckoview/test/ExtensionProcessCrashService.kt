/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import android.content.Context
import android.content.Intent
import java.io.File
import org.mozilla.gecko.util.GeckoBundle
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebExtensionController

class ExtensionProcessCrashService : TestRuntimeService() {
    private val backgroundStarted = GeckoResult<GeckoBundle>()
    private val spawningDisabled = GeckoResult<GeckoBundle>()

    override fun createRuntime(context: Context, intent: Intent): GeckoRuntime {
        val runtime =
            GeckoRuntime.create(
                context,
                GeckoRuntimeSettings.Builder()
                    .extras(intent.extras!!)
                    .extensionsProcessEnabled(true)
                    .extensionsProcessCrashThreshold(0)
                    .lowMemoryDetection(false)
                    .build(),
            )
        val controller = runtime.webExtensionController
        controller.setExtensionProcessDelegate(
            object : WebExtensionController.ExtensionProcessDelegate {
                override fun onDisabledProcessSpawning() {
                    spawningDisabled.complete(null)
                }
            }
        )
        controller
            .installBuiltIn("resource://android/assets/web_extensions/messaging/")
            .accept(
                {
                    it!!.setMessageDelegate(
                        object : WebExtension.MessageDelegate {
                            override fun onMessage(
                                nativeApp: String,
                                message: Any,
                                sender: WebExtension.MessageSender,
                            ): GeckoResult<Any>? {
                                if (message == "testBackgroundBrowserMessage") {
                                    backgroundStarted.complete(null)
                                }
                                return null
                            }
                        },
                        "browser",
                    )
                },
                { backgroundStarted.complete(GeckoBundle(1).apply { putString("error", it.toString()) }) },
            )
        return runtime
    }

    override fun handleMessage(messageId: Int, data: GeckoBundle?): GeckoResult<GeckoBundle>? =
        when (messageId) {
            MESSAGE_WAIT_FOR_BACKGROUND -> backgroundStarted
            MESSAGE_WAIT_FOR_DISABLED_SPAWNING -> spawningDisabled
            else -> null
        }

    class Instance private constructor(context: Context, profileFolder: File) :
        RuntimeInstance<ExtensionProcessCrashService>(
            context,
            ExtensionProcessCrashService::class.java,
            profileFolder,
        ) {
        fun waitForBackground(): GeckoResult<Void> = waitFor(MESSAGE_WAIT_FOR_BACKGROUND)

        fun waitForDisabledSpawning(): GeckoResult<Void> = waitFor(MESSAGE_WAIT_FOR_DISABLED_SPAWNING)

        private fun waitFor(message: Int): GeckoResult<Void> = started.then {
            query(message).map { reply ->
                reply?.getString("error")?.let { throw IllegalStateException(it) }
                null
            }
        }

        companion object {
            fun start(context: Context, profileFolder: File): Instance =
                Instance(context, profileFolder).apply { sendIntent() }
        }
    }

    companion object {
        const val MESSAGE_WAIT_FOR_BACKGROUND = FIRST_SAFE_MESSAGE
        const val MESSAGE_WAIT_FOR_DISABLED_SPAWNING = FIRST_SAFE_MESSAGE + 1
    }
}
