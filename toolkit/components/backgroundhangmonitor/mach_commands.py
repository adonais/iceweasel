# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""mach command for running the BHR aggregation job locally.

This is a thin wrapper around aggregation/bhr_collection.py:aggregate(). It
exists so a developer can run the daily BHR aggregation on their machine
without remembering the PYTHONPATH incantation. The virtualenv_name below
points mach at python/sites/bhr-aggregate.txt, so the google-cloud-bigquery
dependency gets installed automatically the first time the command runs.

BigQuery needs GCP Application Default Credentials. If they're missing or
expired the command prints how to set them up and exits; pass --login to
have it run `gcloud auth application-default login` for you instead.

Note on --date: this is the build date to process directly. The legacy
python_mozetl CLI subtracted 4 days internally, so its `--date 2026-05-29`
processed build date 2026-05-25. Here `--date 2026-05-25` processes
2026-05-25.
"""

import datetime
import os
import shutil
import subprocess
import sys

from mach.decorators import Command, CommandArgument


def _gcp_credentials_ok():
    """Return True if usable Application Default Credentials are available."""
    import google.auth
    import google.auth.transport.requests
    from google.auth.exceptions import DefaultCredentialsError, RefreshError

    try:
        creds, _ = google.auth.default()
        creds.refresh(google.auth.transport.requests.Request())
        return True
    except (DefaultCredentialsError, RefreshError):
        return False


def _run_gcloud_login():
    """Run `gcloud auth application-default login`; return True on success."""
    gcloud = shutil.which("gcloud")
    if not gcloud:
        print(
            "error: gcloud was not found on PATH. Install the Google Cloud SDK,"
            " then run `gcloud auth application-default login`."
        )
        return False
    try:
        subprocess.run([gcloud, "auth", "application-default", "login"], check=True)
    except subprocess.CalledProcessError:
        print("error: `gcloud auth application-default login` did not complete")
        return False
    return _gcp_credentials_ok()


@Command(
    "bhr-aggregate",
    category="misc",
    virtualenv_name="bhr-aggregate",
    description="Aggregate BHR hang reports for a build date into the dashboard JSON.",
)
@CommandArgument(
    "--date",
    required=True,
    help="Build date to process, in YYYY-MM-DD form.",
)
@CommandArgument(
    "--output-dir",
    required=True,
    help="Directory to write the JSON output into.",
)
@CommandArgument(
    "--sample-size",
    type=float,
    default=0.005,
    help="Fraction of pings to read, in (0, 1] (default: 0.005). Production uses 0.5.",
)
@CommandArgument(
    "--billing-project",
    default="mozdata",
    help="GCP project to bill the BigQuery query against (default: mozdata).",
)
@CommandArgument(
    "--output-tag",
    default="main",
    help="Tag in the output filename, hangs_<tag>_<date>.json (default: main).",
)
@CommandArgument(
    "--thread-filter",
    default="Gecko",
    help="Which thread's hangs to process (default: Gecko, e.g. Gecko_Child).",
)
@CommandArgument(
    "--login",
    action="store_true",
    help="Run `gcloud auth application-default login` if GCP credentials are "
    "missing or expired, instead of just reporting it.",
)
def bhr_aggregate(
    command_context,
    date,
    output_dir,
    sample_size,
    billing_project,
    output_tag,
    thread_filter,
    login,
):
    if not 0 < sample_size <= 1:
        print(f"error: --sample-size must be in (0, 1], got {sample_size}")
        return 1

    try:
        build_date = datetime.date.fromisoformat(date)
    except ValueError:
        print(f"error: --date must be YYYY-MM-DD, got {date!r}")
        return 1

    output_dir = os.path.abspath(os.path.expanduser(output_dir))

    if not _gcp_credentials_ok():
        if not login:
            print(
                "error: GCP credentials are missing or expired. Run\n"
                "`gcloud auth application-default login`, or re-run this command"
                " with --login."
            )
            return 1
        if not _run_gcloud_login():
            return 1

    print(
        f"Processing build date {build_date:%Y%m%d} at sample-size "
        f"{sample_size}, writing to {output_dir}"
    )

    aggregation_dir = os.path.join(
        command_context.topsrcdir,
        "toolkit",
        "components",
        "backgroundhangmonitor",
        "aggregation",
    )
    sys.path.insert(0, aggregation_dir)
    import bhr_collection

    bhr_collection.aggregate(
        date=build_date,
        sample_size=sample_size,
        billing_project=billing_project,
        output_dir=output_dir,
        output_tag=output_tag,
        config_overrides={"thread_filter": thread_filter},
    )
    return 0
