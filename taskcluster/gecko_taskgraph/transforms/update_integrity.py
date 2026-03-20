# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

transforms = TransformSequence()


@transforms.add
def skip_for_non_nightly(config, jobs):
    """Don't generate any jobs unless running as a nightly. Other code in this transform depends on nightly-specific parameters being set."""
    if not config.params["release_history"]:
        return

    yield from jobs


@transforms.add
def resolve_keys(config, jobs):
    for job in jobs:
        resolve_keyed_by(
            job,
            "cert-overrides",
            job["name"],
            project=config.params["project"],
        )

        yield job


@transforms.add
def set_treeherder(config, jobs):
    for job in jobs:
        th = job.setdefault("treeherder", {})
        attrs = job["attributes"]
        attrs["locale"] = attrs.get("locale", "en-US")

        th["platform"] = f"{attrs['build_platform']}/{attrs['build_type']}"
        th["symbol"] = th["symbol"].format(**attrs)
        yield job


@transforms.add
def add_to_installer(config, jobs):
    """Adds fetch entries for the "to" installer to fetches."""
    for job in jobs:
        if "linux" in job["attributes"]["build_platform"]:
            job["fetches"]["build-signing"] = [
                {"artifact": "target.tar.xz", "extract": False}
            ]

        yield job


@transforms.add
def add_additional_fetches_and_command(config, jobs):
    """Adds fetch entries for the "from" installers and partial MARs."""
    for job in jobs:
        if job["attributes"]["build_platform"].startswith("linux64"):
            platform = "linux"
            build_target = "Linux_x86_64-gcc3"
            installer_suffix = "tar.xz"
        else:
            raise Exception("couldn't detect build target")

        # ideally, this attribute would be set on en-US jobs as well...but it's not, so we have to assume
        locale = job["attributes"].get("locale", "en-US")

        job["run"]["command"] = [
            # test runner
            "/builds/worker/fetches/marannon/marannon",
            # script that actually runs the tests - eventually to be replaced
            # with native code
            "tools/update-verify/release/common/check_updates.sh",
            # platform - used to determine how to unpack builds
            platform,
            # "to" installer
            f"/builds/worker/fetches/target.{installer_suffix}",
            # "to" complete mar
            "/builds/worker/fetches/target.complete.mar",
            # directory containing partial mars
            "/builds/worker/fetches",
            # locale
            locale,
            # channel - stop hardcoding
            "nightly-try",
            # app name - stop hardcoding
            "firefox",
            # artifact dir
            "/builds/worker/artifacts",
        ]

        cert_overrides = job.pop("cert-overrides")
        if cert_overrides:
            job["run"]["command"].extend([
                # script that does certificate replacements in the updater
                "--cert-replace-script",
                "tools/update-verify/release/replace-updater-certs.py",
                # directory containing mar certificates
                # note we use versions from tools/update-verify, not the ones
                # in toolkit/mozapps/update/updater, which are not precisely
                # the same size, and injecting them would corrupt the binary
                "--cert-dir",
                "tools/update-verify/release/mar_certs",
            ])
            for override in cert_overrides:
                job["run"]["command"].extend(["--cert-override", override])

        fetches = []
        for mar, info in config.params["release_history"][build_target][locale].items():
            fetches.append({"artifact": mar})
            # parameters give us the complete MAR url. installers are found right
            # beside them
            base_url = info["mar_url"].split(".complete.mar")[0]
            buildid = info["buildid"]
            # installers are fetched from URLs (not upstream tasks); we simply
            # inject these into the task for the payload to deal with
            job["run"]["command"].append("--from")
            job["run"]["command"].append(
                f"{buildid}|{base_url}.{installer_suffix}|{mar}"
            )

        job["fetches"]["partials-signing"] = fetches

        yield job
