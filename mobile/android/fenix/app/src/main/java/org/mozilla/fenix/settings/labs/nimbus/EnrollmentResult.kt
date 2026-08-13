/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.nimbus

import org.mozilla.experiments.nimbus.internal.FirefoxLabsEnrollStatus
import org.mozilla.experiments.nimbus.internal.FirefoxLabsUnenrollStatus

/**
 * The simplified outcome of a Nimbus enroll/unenroll attempt.
 */
internal enum class EnrollmentResult {
    /** The enrollment change took effect as expected in Nimbus. */
    Success,

    /**
     * The enrollment change did not take effect but the Lab still exists.
     */
    Failed,

    /** The Lab is no longer available or the request is somehow malformed. */
    Invalid,
}

/**
 * Maps a Nimbus [FirefoxLabsEnrollStatus] to the simplified [EnrollmentResult].
 */
internal fun FirefoxLabsEnrollStatus.toEnrollmentResult(): EnrollmentResult = when (this) {
    FirefoxLabsEnrollStatus.ENROLLED -> EnrollmentResult.Success
    FirefoxLabsEnrollStatus.ALREADY_ENROLLED -> EnrollmentResult.Success
    FirefoxLabsEnrollStatus.NO_EXPERIMENT -> EnrollmentResult.Invalid
    FirefoxLabsEnrollStatus.NOT_FIREFOX_LABS_OPT_IN -> EnrollmentResult.Invalid
    FirefoxLabsEnrollStatus.FEATURE_CONFLICT -> EnrollmentResult.Failed
    FirefoxLabsEnrollStatus.ERROR -> EnrollmentResult.Failed
}

/**
 * Maps a Nimbus [FirefoxLabsUnenrollStatus] to the simplified [EnrollmentResult].
 */
internal fun FirefoxLabsUnenrollStatus.toEnrollmentResult(): EnrollmentResult = when (this) {
    FirefoxLabsUnenrollStatus.UNENROLLED -> EnrollmentResult.Success
    FirefoxLabsUnenrollStatus.ALREADY_UNENROLLED -> EnrollmentResult.Success
    FirefoxLabsUnenrollStatus.NO_EXPERIMENT -> EnrollmentResult.Invalid
    FirefoxLabsUnenrollStatus.NOT_FIREFOX_LABS_OPT_IN -> EnrollmentResult.Invalid
    FirefoxLabsUnenrollStatus.ERROR -> EnrollmentResult.Failed
}
