#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_CREDENTIALS_FILE = "/builds/worker/gcp-credentials.json"
DEFAULT_OUTPUT_DIR = "/builds/worker/artifacts"
# Only the level-3 mozilla-central cron holds secrets:get on this. Deliberately
# not level-templated: no level-1 name exists, so a try run fails closed.
DEFAULT_SECRET = "project/bhr/aggregation-gcp-key"


def _env_float(name, default):
    value = os.environ.get(name)
    return default if value is None else float(value)


def _env_int(name, default):
    value = os.environ.get(name)
    return default if value is None else int(value)


def _default_date(offset_days):
    return datetime.datetime.now(datetime.UTC).date() - datetime.timedelta(
        days=offset_days
    )


def _parse_date(value):
    if value:
        return datetime.date.fromisoformat(value)
    return None


def _secret_url(secret_name, with_api_prefix=True):
    proxy = os.environ.get("TASKCLUSTER_PROXY_URL", "http://taskcluster").rstrip("/")
    prefix = "/api" if with_api_prefix else ""
    return f"{proxy}{prefix}/secrets/v1/secret/{secret_name}"


def _fetch_secret(secret_name):
    errors = []
    for with_api_prefix in (True, False):
        url = _secret_url(secret_name, with_api_prefix)
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError) as error:
            errors.append(f"{url}: {error}")
    raise RuntimeError("Could not fetch Taskcluster secret:\n" + "\n".join(errors))


def _write_gcp_credentials(secret_name, secret_key, path):
    secret = _fetch_secret(secret_name)["secret"][secret_key]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as credentials:
        if isinstance(secret, str):
            credentials.write(secret)
        else:
            json.dump(secret, credentials)
    os.chmod(path, 0o600)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=os.environ.get("BHR_AGGREGATE_DATE"))
    parser.add_argument(
        "--date-offset-days",
        type=int,
        default=_env_int("BHR_AGGREGATE_DATE_OFFSET_DAYS", 4),
    )
    parser.add_argument(
        "--sample-size",
        type=float,
        default=_env_float("BHR_AGGREGATE_SAMPLE_SIZE", 0.5),
    )
    parser.add_argument(
        "--billing-project",
        default=os.environ.get("BHR_AGGREGATE_BILLING_PROJECT", "mozdata"),
    )
    parser.add_argument(
        "--output-dir",
        default=os.environ.get("BHR_AGGREGATE_OUTPUT_DIR", DEFAULT_OUTPUT_DIR),
    )
    parser.add_argument(
        "--output-tag",
        default=os.environ.get("BHR_AGGREGATE_OUTPUT_TAG", "main"),
    )
    parser.add_argument(
        "--thread-filter",
        default=os.environ.get("BHR_AGGREGATE_THREAD_FILTER", "Gecko"),
    )
    parser.add_argument(
        "--credentials-file",
        default=os.environ.get(
            "GOOGLE_APPLICATION_CREDENTIALS", DEFAULT_CREDENTIALS_FILE
        ),
    )
    parser.add_argument(
        "--gcp-secret",
        default=os.environ.get("BHR_GCP_SECRET", DEFAULT_SECRET),
    )
    parser.add_argument(
        "--gcp-secret-key",
        default=os.environ.get("BHR_GCP_SECRET_KEY", "serviceAccount"),
    )
    parser.add_argument(
        "topsrcdir",
        nargs="?",
        default=os.environ.get("GECKO_PATH", os.getcwd()),
    )
    args = parser.parse_args()

    if not 0 < args.sample_size <= 1:
        raise ValueError(f"--sample-size must be in (0, 1], got {args.sample_size}")

    build_date = _parse_date(args.date) or _default_date(args.date_offset_days)

    if not os.path.exists(args.credentials_file):
        if not args.gcp_secret:
            raise RuntimeError(
                "No GCP credentials file or Taskcluster secret configured"
            )
        _write_gcp_credentials(
            args.gcp_secret, args.gcp_secret_key, args.credentials_file
        )
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = args.credentials_file

    aggregation_dir = os.path.join(
        args.topsrcdir,
        "toolkit",
        "components",
        "backgroundhangmonitor",
        "aggregation",
    )
    sys.path.insert(0, aggregation_dir)
    import bhr_collection

    print(
        f"Running BHR aggregation for build date {build_date:%Y-%m-%d} "
        f"at sample-size {args.sample_size}",
        flush=True,
    )
    bhr_collection.aggregate(
        date=build_date,
        sample_size=args.sample_size,
        billing_project=args.billing_project,
        output_dir=args.output_dir,
        output_tag=args.output_tag,
        config_overrides={"thread_filter": args.thread_filter},
    )


if __name__ == "__main__":
    main()
