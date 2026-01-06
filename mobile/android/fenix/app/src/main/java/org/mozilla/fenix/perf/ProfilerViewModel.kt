/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Application
import android.content.Intent
import androidx.annotation.StringRes
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.concept.base.profiler.Profiler
import mozilla.components.support.base.log.Log
import org.json.JSONException
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Represents the various states of the profiler UI.
 */
sealed class ProfilerUiState {
    /** The profiler is idle and ready to start */
    data object Idle : ProfilerUiState()

    /** The profiler is in the process of starting up */
    data object Starting : ProfilerUiState()

    /** The profiler is active and "profiling" */
    data object Running : ProfilerUiState()

    /** The profiler is gathering and processing collected data */
    data object Gathering : ProfilerUiState()

    /** The profiler is in the process of shutting down */
    data object Stopping : ProfilerUiState()

    /**
     * A toast message should be displayed to the user.
     */
    data class ShowToast(
        @param:StringRes val messageResId: Int,
        val extra: String = "",
    ) :
        ProfilerUiState()

    /**
     * The profiling session has finished.
     */
    data class Finished(val profileUrl: String?) : ProfilerUiState()

    /**
     * An error occurred during profiling.
     */
    data class Error(
        @param:StringRes val messageResId: Int,
        val errorDetails: String = "",
    ) :
        ProfilerUiState()

    /**
     * Determines whether the dialog should be dismissed.
     */
    fun shouldDismiss(): Boolean {
        return this is Running ||
                this is Finished ||
                this is Error
    }
}

/**
 * Factory for creating ProfilerViewModel instances with injectable dependencies.
 */
class ProfilerViewModelFactory(
    private val application: Application,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ProfilerViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ProfilerViewModel(application, mainDispatcher, ioDispatcher) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

/**
 * ViewModel for managing profiler operations and UI state.
 * Simplified to use ProfilerService with NotificationsDelegate integration.
 */
class ProfilerViewModel(
    private val application: Application,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val profilerUtils: ProfilerUtils = ProfilerUtils,
) : AndroidViewModel(application) {

    private val maxPollingAttempts = 50
    private val delayToUpdateStatus = 50L
    private val profiler: Profiler? = application.components.core.engine.profiler

    private val _isProfilerActive = MutableStateFlow(profiler?.isProfilerActive() ?: false)
    val isProfilerActive: StateFlow<Boolean> = _isProfilerActive.asStateFlow()

    private val _uiState = MutableStateFlow<ProfilerUiState>(ProfilerUiState.Idle)
    val uiState: StateFlow<ProfilerUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null
    private val delayToPollProfilerForStatus = 100L

    /**
     * Updates the profiler active status by checking the current state.
     */
    fun updateProfilerActiveStatus() {
        val currentlyActive = profiler?.isProfilerActive() ?: false
        if (_isProfilerActive.value != currentlyActive) {
            _isProfilerActive.value = currentlyActive
        }
    }

    /**
     * Initiates the profiler start process. The polling is done in order to make sure the profiler
     * is started when the notification from the [ProfilerService] is shown
     */
    fun initiateProfilerStartProcess(settings: ProfilerSettings) {
        if (profiler == null) {
            _uiState.value = ProfilerUiState.Error(R.string.profiler_error, "Profiler not available")
            return
        }
        if (isProfilerActive.value) {
            _uiState.value = ProfilerUiState.Running
            return
        }

        _uiState.value = ProfilerUiState.Starting
        profiler.startProfiler(settings.threads, settings.features)

        pollUntilProfilerActiveAndThen(
            onActive = { startProfilerService() },
            onPollFail = { handleProfilerStartFailure() },
        )
    }

    /**
     * Starts the ProfilerService which handles notifications via NotificationsDelegate.
     */
    private fun startProfilerService() {
        val startIntent = Intent(application, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_START_PROFILING
        }
        ContextCompat.startForegroundService(application, startIntent)
        _uiState.value = ProfilerUiState.ShowToast(R.string.profiler_start_dialog_started)

        viewModelScope.launch(mainDispatcher) {
            delay(delayToPollProfilerForStatus)
            if (isProfilerActive.value) {
                _uiState.value = ProfilerUiState.Running
            }
        }
    }

    /**
     * Handles profiler start failure after polling.
     */
    private fun handleProfilerStartFailure() {
        _uiState.value = ProfilerUiState.Error(
            R.string.profiler_error,
            "Polling for active profiler failed",
        )
        updateProfilerActiveStatus()
    }

    /**
     * Polls the profiler status until it becomes active or the operation is cancelled.
     */
    @Suppress("CognitiveComplexMethod")
    private fun pollUntilProfilerActiveAndThen(onActive: () -> Unit, onPollFail: () -> Unit) {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch(ioDispatcher) {
            try {
                var pollingAttempts = 0
                while (isActive && pollingAttempts < maxPollingAttempts) {
                    if (profiler?.isProfilerActive() == true) {
                        withContext(mainDispatcher) {
                            if (!_isProfilerActive.value) {
                                _isProfilerActive.value = true
                            }
                            onActive()
                        }
                        return@launch
                    }
                    pollingAttempts++
                    delay(delayToPollProfilerForStatus)
                }
                withContext(mainDispatcher) {
                    onPollFail()
                }
            } catch (e: CancellationException) {
                withContext(mainDispatcher) {
                    if (_uiState.value == ProfilerUiState.Starting) {
                        _uiState.value = ProfilerUiState.Idle
                    }
                }
                throw e
            } catch (e: IOException) {
                handleViewModelError(e, R.string.profiler_error, "Polling failed")
            } catch (e: SecurityException) {
                handleViewModelError(e, R.string.profiler_error, "Permission denied")
            } catch (e: IllegalStateException) {
                handleViewModelError(e, R.string.profiler_error, "Invalid profiler state")
            }
        }
    }

    /**
     * Stops the profiler and saves the collected profile data.
     */
    fun stopProfilerAndSave() {
        if (profiler == null || !isProfilerActive.value) {
            updateProfilerActiveStatus()
            _uiState.value = ProfilerUiState.Finished(null)
            return
        }
        _uiState.value = ProfilerUiState.Gathering
        _isProfilerActive.value = false
        profiler.stopProfiler(
            onSuccess = { profileData ->
                viewModelScope.launch(mainDispatcher) {
                    stopProfilerService()
                    if (profileData != null) {
                        handleProfileSaveInternal(profileData)
                    } else {
                        _uiState.value = ProfilerUiState.Error(R.string.profiler_no_info)
                    }
                }
            },
            onError = { error ->
                viewModelScope.launch(mainDispatcher) {
                    stopProfilerService()
                    updateProfilerActiveStatus()
                    val errorMessage = error.message ?: "Unknown stop error"
                    _uiState.value = ProfilerUiState.Error(R.string.profiler_error, errorMessage)
                }
            },
        )
    }

    /**
     * Stops the profiler without saving the collected data.
     */
    fun stopProfilerWithoutSaving() {
        if (profiler == null || !isProfilerActive.value) {
            updateProfilerActiveStatus()
            _uiState.value = ProfilerUiState.Finished(null)
            return
        }
        _uiState.value = ProfilerUiState.Stopping
        _isProfilerActive.value = false
        profiler.stopProfiler(
            onSuccess = {
                viewModelScope.launch(mainDispatcher) {
                    stopProfilerService()
                    _uiState.value = ProfilerUiState.Finished(null)
                }
            },
            onError = { error ->
                viewModelScope.launch(mainDispatcher) {
                    stopProfilerService()
                    updateProfilerActiveStatus()
                    val errorMessage = error.message ?: "Unknown stop error"
                    _uiState.value = ProfilerUiState.Error(R.string.profiler_error, errorMessage)
                }
            },
        )
    }

    private fun handleProfileSaveInternal(profileData: ByteArray) {
        viewModelScope.launch(ioDispatcher) {
            try {
                val url = profilerUtils.saveProfileUrlToClipboard(profileData, application)
                withContext(mainDispatcher) {
                    profilerUtils.finishProfileSave(application, url) { messageResId ->
                        _uiState.value = ProfilerUiState.ShowToast(messageResId)
                        launch(mainDispatcher) {
                            delay(delayToUpdateStatus)
                            _uiState.value = ProfilerUiState.Finished(url)
                        }
                    }
                }
            } catch (e: IOException) {
                handleViewModelError(e, R.string.profiler_io_error, "Upload failed")
            } catch (e: SecurityException) {
                handleViewModelError(e, R.string.profiler_io_error, "Permission denied")
            } catch (e: JSONException) {
                handleViewModelError(e, R.string.profiler_io_error, "Server response invalid")
            } catch (e: IllegalArgumentException) {
                handleViewModelError(e, R.string.profiler_io_error, "Invalid profile data")
            }
        }
    }

    /**
     * Stops the ProfilerService.
     */
    private fun stopProfilerService() {
        try {
            val stopIntent = Intent(application, ProfilerService::class.java).apply {
                action = ProfilerService.ACTION_STOP_PROFILING
            }
            application.startService(stopIntent)
        } catch (e: IllegalStateException) {
            Log.log(
                priority = Log.Priority.ERROR,
                tag = "ProfilerViewModel",
                message = "Error sending stop intent: ${e.message}",
            )
        }
    }

    /**
     * Resets the UI state to idle if it isn't already.
     */
    fun resetUiState() {
        if (_uiState.value != ProfilerUiState.Idle) {
            _uiState.value = ProfilerUiState.Idle
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }

    private suspend fun handleViewModelError(
        exception: Exception,
        @StringRes errorMessageRes: Int,
        fallbackMessage: String = "Operation failed",
    ) {
        Log.log(
            priority = Log.Priority.ERROR,
            tag = "ProfilerViewModel",
            message = "Error: ${exception.message}",
        )
        withContext(mainDispatcher) {
            _uiState.value = ProfilerUiState.Error(
                errorMessageRes,
                exception.message ?: fallbackMessage,
            )
        }
    }
}
