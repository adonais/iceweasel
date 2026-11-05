/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.ext

import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.transform
import mozilla.components.ui.richtext.ir.RichDocument
import mozilla.components.ui.richtext.parsing.StreamingParser

internal fun Flow<String>.mapToRichDocument(
    pageTitle: String,
    dispatcher: CoroutineDispatcher,
): Flow<RichDocument> = flow {
    val context = currentCoroutineContext()
    val parser = StreamingParser { context.ensureActive() }
    val pending = ConcurrentLinkedQueue<String>()

    if (pageTitle.isNotEmpty()) {
        pending.add("# $pageTitle\n")
    }

    emitAll(
        this@mapToRichDocument.onEach { pending.add(it) }
            .sampled()
            .map { pending.drain() }
            .filter { it.isNotEmpty() }
            .map {
                parser.append(it)
                parser.toRichDocument()
            }
    )
}
    .flowOn(dispatcher)

private val PARSE_THROTTLE = 120.milliseconds

/** Emits at most one value per [PARSE_THROTTLE], dropping the values emitted in between. */
private fun <T> Flow<T>.sampled() =
    conflate().transform {
        emit(it)
        delay(PARSE_THROTTLE)
    }

private fun ConcurrentLinkedQueue<String>.drain() = generateSequence { poll() }.joinToString("")
