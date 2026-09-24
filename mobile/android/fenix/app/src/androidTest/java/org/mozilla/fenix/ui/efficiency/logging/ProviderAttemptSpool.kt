/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject

internal data class ProviderAttemptKey(
    val runId: String,
    val attemptId: String,
    val testId: String,
)

internal interface ProviderEvidenceFile : Closeable {
    val name: String

    fun append(bytes: ByteArray)

    fun sync()
}

internal interface ProviderEvidenceStorage {
    fun openEvents(key: ProviderAttemptKey): ProviderEvidenceFile

    fun commitManifest(key: ProviderAttemptKey, manifest: Map<String, Any?>)
}

internal class ProviderAttemptSpool(private val storage: ProviderEvidenceStorage) {
    private data class AttemptState(
        val file: ProviderEvidenceFile,
        val digest: MessageDigest = MessageDigest.getInstance("SHA-256"),
        var sizeBytes: Long = 0,
        var eventCount: Int = 0,
        var firstSequence: Long? = null,
        var lastSequence: Long? = null,
        var sequenceContiguous: Boolean = true,
        val removedFields: MutableMap<String, Int> = linkedMapOf(),
    )

    private val attempts = mutableMapOf<ProviderAttemptKey, AttemptState>()
    private val finalized = mutableSetOf<ProviderAttemptKey>()

    fun append(event: Map<String, Any?>) {
        val envelope = event["eventEnvelope"] as? Map<*, *> ?: return
        val key =
            ProviderAttemptKey(
                runId = envelope["runId"]?.toString()?.takeIf { it.isNotBlank() } ?: return,
                attemptId = envelope["attemptId"]?.toString()?.takeIf { it.isNotBlank() } ?: return,
                testId = envelope["testId"]?.toString()?.takeIf { it.isNotBlank() } ?: return,
            )
        if (key in finalized) return

        val redacted = ProviderEvidencePolicy.redact(event)
        val bytes = (JSONObject(redacted.fields.filterValues { it != null }).toString() + "\n").toByteArray()
        val state = attempts.getOrPut(key) { AttemptState(storage.openEvents(key)) }
        val sequence = (envelope["sequence"] as? Number)?.toLong()
        if (sequence != null) {
            val expectedSequence = (state.lastSequence ?: 0L) + 1L
            if (sequence != expectedSequence) {
                state.sequenceContiguous = false
            }
            if (state.firstSequence == null) state.firstSequence = sequence
            state.lastSequence = sequence
        } else {
            state.sequenceContiguous = false
        }
        state.file.append(bytes)
        state.digest.update(bytes)
        state.sizeBytes += bytes.size
        state.eventCount += 1
        redacted.removedFields.forEach { field ->
            state.removedFields[field] = (state.removedFields[field] ?: 0) + 1
        }

        val type = event["type"]?.toString()
        if (type == "testEnd" || type == "attemptEnd") state.file.sync()
        if (type == "attemptEnd") finalize(key, state, redacted.fields)
    }

    private fun finalize(key: ProviderAttemptKey, state: AttemptState, terminal: Map<String, Any?>) {
        state.file.close()
        val envelope = terminal["eventEnvelope"] as? Map<*, *> ?: emptyMap<String, Any?>()
        val inventory =
            mapOf(
                "schemaVersion" to INVENTORY_SCHEMA_VERSION,
                "algorithm" to "sha256",
                "complete" to state.sequenceContiguous,
                "files" to
                    listOf(
                        mapOf(
                            "role" to "structuredEvents",
                            "name" to state.file.name,
                            "sizeBytes" to state.sizeBytes,
                            "sha256" to state.digest.digest().joinToString("") { "%02x".format(it) },
                        )
                    ),
            )
        storage.commitManifest(
            key,
            mapOf(
                "bundleSchemaVersion" to BUNDLE_SCHEMA_VERSION,
                "status" to if (state.sequenceContiguous) "complete" else "sequence_incomplete",
                "runId" to key.runId,
                "shardId" to envelope["shardId"],
                "testId" to key.testId,
                "attemptId" to key.attemptId,
                "dispatchAttemptId" to envelope["dispatchAttemptId"],
                "providerAttemptOrdinal" to envelope["providerAttemptOrdinal"],
                "executionPath" to envelope["executionPath"],
                "isolation" to envelope["isolation"],
                "processId" to envelope["processId"],
                "eventCount" to state.eventCount,
                "firstSequence" to state.firstSequence,
                "lastSequence" to state.lastSequence,
                "sequenceContiguous" to state.sequenceContiguous,
                "terminal" to
                    mapOf(
                        "outcome" to terminal["outcome"],
                        "bodyOutcome" to terminal["bodyOutcome"],
                        "cleanupOutcome" to terminal["cleanupOutcome"],
                        "complete" to terminal["complete"],
                        "failureOrigins" to terminal["failureOrigins"],
                        "failedCleanupStages" to terminal["failedCleanupStages"],
                    ),
                "redaction" to
                    mapOf(
                        "policyVersion" to ProviderEvidencePolicy.VERSION,
                        "removedFieldOccurrences" to state.removedFields.toSortedMap(),
                    ),
                "evidenceInventory" to inventory,
                "completedAtMs" to envelope["wallTimeMs"],
            ),
        )
        attempts.remove(key)
        finalized += key
    }

    companion object {
        const val BUNDLE_SCHEMA_VERSION = 1
        const val INVENTORY_SCHEMA_VERSION = 1
    }
}

fun interface ProviderStructuredEventSink {
    fun event(event: Map<String, Any?>)

    companion object {
        val None = ProviderStructuredEventSink {}
    }
}

internal object ProcessProviderEvidence : ProviderStructuredEventSink {
    private val executor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "efficiency-provider-evidence").apply { isDaemon = true }
    }
    private val spool by lazy {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        ProviderAttemptSpool(MediaStoreProviderEvidenceStorage(context))
    }

    override fun event(event: Map<String, Any?>) {
        val envelope = event["eventEnvelope"] as? Map<*, *> ?: return
        if (envelope["identitySource"] != "dispatcher" || envelope["runId"] == ExecutionIdentity.UNASSIGNED) return
        val future = executor.submit { spool.append(event) }
        if (event["type"] == "testEnd" || event["type"] == "attemptEnd") {
            runCatching { future.get(BOUNDARY_TIMEOUT_SECONDS, TimeUnit.SECONDS) }
                .onFailure { Log.w(TAG, "Provider evidence boundary write failed: ${it.message}") }
        }
    }

    private const val TAG = "ProviderEvidence"
    private const val BOUNDARY_TIMEOUT_SECONDS = 5L
}

internal class MediaStoreProviderEvidenceStorage(private val context: Context) : ProviderEvidenceStorage {
    override fun openEvents(key: ProviderAttemptKey): ProviderEvidenceFile =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            createMediaStoreFile(key, EVENTS_FILE, "application/x-ndjson", pending = false)
        } else {
            createLegacyFile(key, EVENTS_FILE)
        }

    override fun commitManifest(key: ProviderAttemptKey, manifest: Map<String, Any?>) {
        val bytes = JSONObject(manifest.filterValues { it != null }).toString(1).toByteArray()
        val file =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                createMediaStoreFile(key, MANIFEST_FILE, "application/json", pending = true)
            } else {
                createLegacyFile(key, MANIFEST_FILE)
            }
        try {
            file.append(bytes)
            file.sync()
        } finally {
            file.close()
        }
        if (file is MediaStoreEvidenceFile) file.publish()
    }

    private fun createMediaStoreFile(
        key: ProviderAttemptKey,
        name: String,
        mimeType: String,
        pending: Boolean,
    ): ProviderEvidenceFile {
        val values =
            ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath(key))
                if (pending) put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        val resolver = context.contentResolver
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = requireNotNull(resolver.insert(collection, values)) { "Unable to create $name in MediaStore" }
        val descriptor = requireNotNull(resolver.openFileDescriptor(uri, "w")) { "Unable to open $uri" }
        return MediaStoreEvidenceFile(name, uri, descriptor, context, pending)
    }

    @Suppress("DEPRECATION")
    private fun createLegacyFile(key: ProviderAttemptKey, name: String): ProviderEvidenceFile {
        val root = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = File(root, "${relativePath(key).removePrefix("${Environment.DIRECTORY_DOWNLOADS}/")}/$name")
        check(file.parentFile?.mkdirs() != false) { "Unable to create ${file.parent}" }
        return StreamEvidenceFile(name, FileOutputStream(file))
    }

    private fun relativePath(key: ProviderAttemptKey): String =
        listOf(
                Environment.DIRECTORY_DOWNLOADS,
                ROOT_DIRECTORY,
                "v$PATH_SCHEMA_VERSION",
                safe(key.runId),
                safe(key.attemptId),
            )
            .joinToString("/", postfix = "/")

    private fun safe(value: String): String = value.replace("""[^\w.\-]+""".toRegex(), "_").take(120)

    companion object {
        const val ROOT_DIRECTORY = "efficiency-harness"
        const val PATH_SCHEMA_VERSION = 1
        const val PROVIDER_PULL_DIRECTORY = "/sdcard/Download/$ROOT_DIRECTORY"
        private const val EVENTS_FILE = "events.jsonl"
        private const val MANIFEST_FILE = "manifest.json"
    }
}

private open class StreamEvidenceFile(
    override val name: String,
    private val stream: FileOutputStream,
) : ProviderEvidenceFile {
    override fun append(bytes: ByteArray) {
        stream.write(bytes)
    }

    override fun sync() {
        stream.fd.sync()
    }

    override fun close() {
        stream.close()
    }
}

private class MediaStoreEvidenceFile(
    name: String,
    private val uri: Uri,
    descriptor: ParcelFileDescriptor,
    private val context: Context,
    private val pending: Boolean,
) : StreamEvidenceFile(name, ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {

    fun publish() {
        if (!pending) return
        val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
        context.contentResolver.update(uri, values, null, null)
    }
}

internal class MemoryProviderEvidenceStorage : ProviderEvidenceStorage {
    val events = mutableMapOf<ProviderAttemptKey, ByteArrayOutputStream>()
    val manifests = mutableMapOf<ProviderAttemptKey, Map<String, Any?>>()

    override fun openEvents(key: ProviderAttemptKey): ProviderEvidenceFile {
        val output = ByteArrayOutputStream()
        events[key] = output
        return object : ProviderEvidenceFile {
            override val name = "events.jsonl"

            override fun append(bytes: ByteArray) = output.write(bytes)

            override fun sync() = Unit

            override fun close() = Unit
        }
    }

    override fun commitManifest(key: ProviderAttemptKey, manifest: Map<String, Any?>) {
        manifests[key] = manifest
    }
}
