/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.engine.gecko

import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import mozilla.components.concept.engine.CancellableOperation
import org.mozilla.geckoview.GeckoResult

/** Wait for a GeckoResult to be complete in a co-routine. */
suspend fun <T> GeckoResult<T>.await() =
    suspendCancellableCoroutine<T?> { continuation ->
        then(
            {
                continuation.resume(it)
                GeckoResult<Void>()
            },
            {
                continuation.resumeWithException(it)
                GeckoResult<Void>()
            },
        )
        continuation.invokeOnCancellation { cancel() }
    }

/** Converts a [GeckoResult] to a [CancellableOperation]. */
fun <T> GeckoResult<T>.asCancellableOperation(): CancellableOperation {
    val geckoResult = this
    return object : CancellableOperation {
        override fun cancel(): Deferred<Boolean> {
            val result = CompletableDeferred<Boolean>()
            geckoResult
                .cancel()
                .then(
                    {
                        result.complete(it ?: false)
                        GeckoResult<Void>()
                    },
                    { throwable ->
                        result.completeExceptionally(throwable)
                        GeckoResult<Void>()
                    },
                )
            return result
        }
    }
}

/** Create a GeckoResult from a co-routine. */
@Suppress("TooGenericExceptionCaught")
fun <T> CoroutineScope.launchGeckoResult(
    context: CoroutineContext = EmptyCoroutineContext,
    start: CoroutineStart = CoroutineStart.DEFAULT,
    block: suspend CoroutineScope.() -> T,
) =
    GeckoResult<T>().apply {
        launch(context, start) {
            try {
                val value = block()
                complete(value)
            } catch (exception: Throwable) {
                completeExceptionally(exception)
            }
        }
    }
