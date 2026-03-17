/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments.prefhandling

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.browser.engine.gecko.preferences.BrowserPrefObserverIntegration
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.preferences.BrowserPrefType
import mozilla.components.concept.engine.preferences.BrowserPreference
import mozilla.components.concept.engine.preferences.SetBrowserPreference
import mozilla.components.service.nimbus.NimbusApi
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.experiments.nimbus.internal.GeckoPrefHandler
import org.mozilla.experiments.nimbus.internal.GeckoPrefState
import org.mozilla.experiments.nimbus.internal.OriginalGeckoPref
import org.mozilla.experiments.nimbus.internal.PrefBranch
import org.mozilla.experiments.nimbus.internal.PrefUnenrollReason
import org.mozilla.fenix.nimbus.FxNimbus

private val logger = Logger("Nimbus/GeckoPrefHandler")

/**
 * The handler Nimbus uses for reading and writing Gecko preferences.
 *
 * @param engine The browser engine used to read and write preferences.
 * @param nimbusApi The Nimbus API that will orchestrate enrollment and unenrollment.
 */
class NimbusGeckoPrefHandler(
    private val engine: Lazy<Engine>,
    private val nimbusApi: Lazy<NimbusApi>,
) : GeckoPrefHandler, BrowserPrefObserverIntegration.Observer {
    val geckoScope = MainScope() + CoroutineName("NimbusGeckoPrefHandler")

    val browserPrefObserverIntegration by lazy { BrowserPrefObserverIntegration(engine.value) }

    // Used for handling errors when we fail to set during enrollment
    val enrollmentErrors = mutableListOf<Pair<GeckoPrefState, Throwable?>>()

    // Used for ensuring we have the correct validated preference type
    val preferenceTypes = mutableMapOf<String, BrowserPrefType>()

    val nimbusGeckoPreferences: Map<String, Map<String, GeckoPrefState>> =
        FxNimbus.geckoPrefsMap().mapValues { featureEntry ->
            featureEntry.value.mapValues { variableEntry ->
                GeckoPrefState(
                    geckoPref = variableEntry.value,
                    geckoValue = null,
                    enrollmentValue = null,
                    isUserSet = false,
                )
            }
        }

    val preferenceList = nimbusGeckoPreferences.flatMap { featureEntry ->
        featureEntry.value.map { variablesEntry ->
            variablesEntry.value.prefString()
        }
    }

    /**
     * Called when ready to begin observation.
     */
    fun start() {
        browserPrefObserverIntegration.start()
        browserPrefObserverIntegration.register(this)
    }

    /**
     * Obtains the preference state for a specific preference string
     *
     * @param pref: The string name of the preference for which to obtain the value
     * @return The GeckoPrefState instance for the requested preference, if it exists
     */
    fun getPreferenceState(pref: String): GeckoPrefState? =
        nimbusGeckoPreferences.values
            .flatMap { it.values }
            .firstOrNull { it.prefString() == pref }

    /**
     * Retrieves initial values of the specified preferences for Nimbus.
     * This is part of the Nimbus Gecko pref enrollment flow.
     *
     * @return The state of the Gecko preferences for which Nimbus could set values
     */
    @OptIn(ExperimentalAndroidComponentsApi::class)
    fun getPreferenceStateFromGecko(): Deferred<Boolean> {
        val completable = CompletableDeferred<Boolean>()
        geckoScope.launch {
            try {
                engine.value.getBrowserPrefs(
                    prefs = preferenceList,
                    onSuccess = { preferences ->
                        for (preference in preferences) {
                            val state = getPreferenceState(preference.pref)!!
                            state.geckoValue = if (state.branch() == PrefBranch.DEFAULT) {
                                preference.defaultValue
                            } else {
                                preference.userValue
                            }.toString()
                            state.isUserSet = preference.hasUserChangedValue
                            preferenceTypes[preference.pref] = preference.prefType
                        }
                        completable.complete(true)
                    },
                    onError = { completable.complete(false) },
                )
            } catch (e: IllegalThreadStateException) {
                logger.error("Error getting preference state from Gecko", e)
                completable.complete(false)
            }
        }
        return completable
    }

    /**
     * Handles the errors stored in [enrollmentErrors], and unenrolls from Nimbus experiments for the
     * preferences that failed to set.
     *
     * This is part of the Nimbus Gecko pref enrollment flow.
     */
    fun handleErrors() {
        for ((prefState, _) in enrollmentErrors) {
            nimbusApi.value.unenrollForGeckoPref(prefState, PrefUnenrollReason.FAILED_TO_SET)
        }
    }

    /**
     * Get the Nimbus Gecko preferences state.
     * @return The map of GeckoPrefState instances
     */
    override fun getPrefsWithState(): Map<String, Map<String, GeckoPrefState>> {
        return nimbusGeckoPreferences
    }

    /**
     * Sets Gecko preferences to their original values when experiment unenrollment occurs.
     *
     * This is part of the Nimbus Gecko pref unenrollment flow.
     * The goal is to revert the pref to a known value before the experiment occurred.
     *
     * @param originalGeckoPrefs: The list of original Gecko preference values
     */
    @OptIn(ExperimentalAndroidComponentsApi::class)
    override fun setGeckoPrefsOriginalValues(originalGeckoPrefs: List<OriginalGeckoPref>) {
        geckoScope.launch {
            val (prefsWithValues, prefsToReset) = originalGeckoPrefs.partition { it.value != null }

            // Set elements that we have values we can restore back to
            val setters = createSettersFromOriginalGeckoPrefs(prefsWithValues, preferenceTypes)
            engine.value.setBrowserPrefs(
                prefs = setters,
                onSuccess = { resultMap ->
                    logRestoreSuccess(resultMap)
                },
                onError = { logger.error("Error setting Gecko preferences to their original values", it) },
            )

            // Clear elements that we have no values we can restore back to
            prefsToReset.forEach { (prefString, _) ->
                engine.value.clearBrowserUserPref(
                    pref = prefString,
                    onSuccess = { logger.info("Unset preference $prefString") },
                    onError = { logger.warn("Error unsetting Gecko preference $prefString") },
                )
            }
        }
    }

    /**
     * Convenience method for logging whether preferences restored or not to their original value.
     *
     * @param resultMap A map of a pref name and whether it set or not.
     */
    private fun logRestoreSuccess(resultMap: Map<String, Boolean>) {
        resultMap.forEach { (prefString, wasSet) ->
            if (wasSet) {
                logger.info("Set preference $prefString to its original value")
            } else {
                logger.warn("Unable to set $prefString to its original value")
            }
        }
    }

    /**
     * Sets the Gecko preference state when new state should be applied during the Enrollment flow.
     *
     * This is part of the Nimbus Gecko pref enrollment flow.
     *
     * @param newPrefsState: The list of new Gecko preference states
     */
    @OptIn(ExperimentalAndroidComponentsApi::class)
    override fun setGeckoPrefsState(newPrefsState: List<GeckoPrefState>) {
        if (newPrefsState.isEmpty()) {
            return
        }

        geckoScope.launch {
            val setters: List<SetBrowserPreference<*>> =
                createSettersFromGeckoPrefStates(newPrefsState, preferenceTypes)

            // Report when we fail to make setters
            val setterNames = setters.map { it.pref }.toSet()
            newPrefsState.forEach { prefState ->
                if (prefState.prefString() !in setterNames) {
                    enrollmentErrors.add(Pair(prefState, IllegalStateException("Failed to make a setter!")))
                }
            }

            engine.value.setBrowserPrefs(
                prefs = setters,
                onSuccess = { resultMap ->
                    val succeeded = mutableListOf<String>()
                    resultMap.forEach { (prefString, wasSet) ->
                        if (wasSet) {
                            val state = getPreferenceState(prefString)!!
                            state.enrollmentValue =
                                newPrefsState.findByPrefString(prefString)!!.enrollmentValue
                            succeeded.add(prefString)
                        } else {
                            val state = getPreferenceState(prefString)!!
                            val throwable = Throwable(
                                "Preference $prefString value was " +
                                        "not set",
                            )
                            logger.error("Error while setting preference value", throwable)
                            enrollmentErrors.add(Pair(state, throwable))
                        }
                    }
                    browserPrefObserverIntegration.registerPrefsForObservation(
                        prefs = succeeded,
                        onSuccess = {
                            logger.info("Successfully registered prefs for observation")
                        },
                        onError = { throwable ->
                            logger.error("Failed to register prefs for observation: ", throwable)
                        },
                    )

                    // Reports back the value for Nimbus to store
                    nimbusApi.value.registerPreviousGeckoPrefStates(
                        geckoPrefStates = succeeded.map { getPreferenceState(it)!! },
                    )
                    handleErrors()
                },
                onError = {
                    logger.error(
                        "Unknown error while awaiting setting Gecko preferences",
                        it,
                    )
                },
            )
        }
    }

    /**
     * Handles when registered (active experiment) preferences are changed.
     *
     * @param observedPreference: The preference that was changed
     */
    override fun onPreferenceChange(observedPreference: BrowserPreference<*>) {
        if (preferenceList.contains(observedPreference.pref)) {
            val geckoPrefState = getPreferenceState(observedPreference.pref) ?: run {
                logger.warn(
                    "Preference ${observedPreference.pref} does not have a " +
                            "GeckoPrefState instance",
                )
                return
            }
            nimbusApi.value.unenrollForGeckoPref(geckoPrefState, PrefUnenrollReason.CHANGED)
        } else {
            logger.info(
                "Preference ${observedPreference.pref} was changed, but is not " +
                        "in Nimbus' preference list",
            )
        }
    }
}
