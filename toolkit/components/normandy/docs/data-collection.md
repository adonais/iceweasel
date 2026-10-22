# Normandy data collection

This document describes the types of data that Normandy collects.

## Enrollment

Normandy records enrollment and unenrollment of users into studies, and
records that data using {ref}`Telemetry Events <eventtelemetry>`. All data is stored in the
`normandy` category.

### Preference Studies

Enrollment
: method

  : The string `"enroll"`

  object

  : The string `"preference_study"`

  value

  : The name of the study (`recipe.arguments.slug`).

  extra
  : branch

    : The name of the branch the user was assigned to (example:
      `"control"` or `"experiment"`).

    experimentType

    : The type of preference experiment. Currently this can take
      values "exp" and "exp-highpop", the latter being for
      experiments targeting large numbers of users.

Enrollment Failed
: method

  : The string `"enrollFailed"`

  object

  : The string `"preference_study"`

  value

  : The slug of the study (`recipe.arguments.slug`)

  extra
  : reason

    : The reason for unenrollment. Possible values are:

      - `"invalid-branch"`: The recipe specifies an invalid preference
        branch (not to be confused with the experiment branch). Valid values
        are "default" and "user".

    preferenceBranch

    : If the reason was `"invalid-branch"`, the branch that was
      specified, truncated to 80 characters.

Unenrollment
: method

  : The string `"unenroll"`.

  object

  : The string `"preference_study"`.

  value

  : The name of the study (`recipe.arguments.slug`).

  extra
  : didResetValue

    : The string `"true"` if the preference was set back to its
      original value, `"false"` if it was left as its current
      value. This can happen when, for example, the user changes a
      preference that was involved in a user-branch study.

    reason

    : The reason for unenrollment. Possible values are:

      - `"recipe-not-seen"`: The recipe was no longer
        applicable to this client This can be because the recipe
        was disabled, or the user no longer matches the recipe's
        filter.
      - `"unknown"`: A reason was not specified. This should be
        considered a bug.

Unenroll Failed
: method

  : The string `"unenrollFailed"`.

  object

  : The string `"preference_study"`.

  value

  : The name of the study (`recipe.arguments.slug`)

  extra
  : reason

    : A code describing the reason the unenroll failed. Possible values are:

      - `"does-not-exist"`: The system attempted to unenroll a study that
        does not exist. This is a bug.
      - `"already-unenrolled"`: The system attempted to unenroll a study
        that has already been unenrolled. This is likely a bug.

    caller

    : On Nightly builds only, a string identifying the source of the requested stop.

    originalReason

    : The code that would had been used for the unenrollment, had it not failed.

Experimental Preference Changed
: method

  : The string `"expPrefChanged"`

  object

  : The string `"preference_study"`.

  value

  : The name of the study (`recipe.arguments.slug`)

  extra
  : preferenceName

    : The name of the preference that changed. Note that the value of the
      preference (old or new) is not given.

    reason

    : A code describing the reason that Normandy detected the preference
      change. Possible values are:

      - `"atEnroll"`: The preferences already had user value when the
        experiment started.
      - `"sideload"`: A preference was changed while Normandy's observers
        weren't active, likely while the browser was shut down.
      - `"observer"`: The preference was observed to change by Normandy at
        runtime.
