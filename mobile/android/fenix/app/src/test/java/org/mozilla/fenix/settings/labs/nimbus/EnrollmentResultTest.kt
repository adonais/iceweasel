/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.nimbus

import org.junit.Assert.assertEquals
import org.junit.Test
import org.mozilla.experiments.nimbus.internal.FirefoxLabsEnrollStatus
import org.mozilla.experiments.nimbus.internal.FirefoxLabsUnenrollStatus

class EnrollmentResultTest {

    @Test
    fun `WHEN an enroll status is mapped THEN it returns the expected EnrollmentResult`() {
        assertEquals(EnrollmentResult.Success, FirefoxLabsEnrollStatus.ENROLLED.toEnrollmentResult())
        assertEquals(EnrollmentResult.Success, FirefoxLabsEnrollStatus.ALREADY_ENROLLED.toEnrollmentResult())
        assertEquals(EnrollmentResult.Invalid, FirefoxLabsEnrollStatus.NO_EXPERIMENT.toEnrollmentResult())
        assertEquals(EnrollmentResult.Invalid, FirefoxLabsEnrollStatus.NOT_FIREFOX_LABS_OPT_IN.toEnrollmentResult())
        assertEquals(EnrollmentResult.Failed, FirefoxLabsEnrollStatus.FEATURE_CONFLICT.toEnrollmentResult())
        assertEquals(EnrollmentResult.Failed, FirefoxLabsEnrollStatus.ERROR.toEnrollmentResult())
    }

    @Test
    fun `WHEN an unenroll status is mapped THEN it returns the expected EnrollmentResult`() {
        assertEquals(EnrollmentResult.Success, FirefoxLabsUnenrollStatus.UNENROLLED.toEnrollmentResult())
        assertEquals(EnrollmentResult.Success, FirefoxLabsUnenrollStatus.ALREADY_UNENROLLED.toEnrollmentResult())
        assertEquals(EnrollmentResult.Invalid, FirefoxLabsUnenrollStatus.NO_EXPERIMENT.toEnrollmentResult())
        assertEquals(EnrollmentResult.Invalid, FirefoxLabsUnenrollStatus.NOT_FIREFOX_LABS_OPT_IN.toEnrollmentResult())
        assertEquals(EnrollmentResult.Failed, FirefoxLabsUnenrollStatus.ERROR.toEnrollmentResult())
    }
}
