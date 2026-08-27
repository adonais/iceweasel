# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Generate New Tab's runtime Glean metrics/pings JSON for train-hopping.

Metrics and pings that exist in Nightly but not yet on the target channel can't
be compiled into the older Firefox that an XPI train-hops onto, so they are
registered at runtime from this payload. When generated, it is the diff of New
Tab's local metrics.yaml and pings.yaml against the target channel's definitions.

This is the build-time entry point for the GENERATED_FILES rules in ../moz.build;
`mach newtab channel-metrics-diff` does the equivalent work for the manual path.
The diff is only produced when MOZ_BROWSER_NEWTAB_METRICS_FETCH=1 is set, which
fetches the channel definitions over the network and fails the build on error.
Every other build writes an empty payload, since the metrics are only consumed
once the XPI is train-hopped onto Beta or Release.
"""

import io
import os
import sys
import tempfile
from pathlib import Path
from urllib.request import urlopen

import yaml

HERE = Path(__file__).resolve().parent
TOPSRCDIR = HERE.parents[4]

sys.path.append(
    str(
        TOPSRCDIR
        / "toolkit"
        / "components"
        / "glean"
        / "build_scripts"
        / "glean_parser_ext"
    )
)
sys.path.append(str(HERE))

import glean_utils
from run_glean_parser import parse_with_options

GITHUB_URL_TEMPLATE = (
    "https://raw.githubusercontent.com/mozilla-firefox/firefox/"
    "refs/heads/{branch}/browser/components/newtab/{yaml}"
)


def _fetch_channel_yaml(channel, yaml_name):
    url = GITHUB_URL_TEMPLATE.format(branch=channel, yaml=yaml_name)
    with urlopen(url) as response:
        return yaml.safe_load(response.read())


def get_new_metrics(main_yaml, compare_yaml):
    """Return categories/metrics present in main_yaml but not compare_yaml.

    main_yaml is New Tab's local (Nightly) definitions; compare_yaml is the
    target channel's (Beta/Release). The result is what needs runtime
    registration on that channel.
    """
    new_metrics_yaml = {}
    for category in main_yaml:
        if category.startswith("$"):
            new_metrics_yaml[category] = main_yaml[category]
            continue
        if category not in compare_yaml:
            new_metrics_yaml[category] = main_yaml[category]
            continue
        new_metrics = {}
        for metric in main_yaml[category]:
            if metric not in compare_yaml[category]:
                new_metrics[metric] = main_yaml[category][metric]
        if new_metrics:
            new_metrics_yaml[category] = new_metrics
    return new_metrics_yaml


def get_new_pings(main_yaml, compare_yaml):
    """Return pings present in main_yaml but not compare_yaml (see get_new_metrics)."""
    new_pings_yaml = {}
    for ping in main_yaml:
        if ping.startswith("$"):
            new_pings_yaml[ping] = main_yaml[ping]
            continue
        if ping not in compare_yaml:
            new_pings_yaml[ping] = main_yaml[ping]
    return new_pings_yaml


def _write_diff_yaml(path, new_yaml):
    # $tags is stripped to avoid an invalid-tag lint error when re-parsing.
    if "$tags" in new_yaml:
        del new_yaml["$tags"]
    path.write_text(yaml.dump(new_yaml, sort_keys=False))


def _render_runtime_metrics(metrics_yaml, pings_yaml, compare_metrics, compare_pings):
    with open(metrics_yaml) as f:
        main_metrics = yaml.safe_load(f)
    with open(pings_yaml) as f:
        main_pings = yaml.safe_load(f)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)
        metrics_only_new = temp_dir / "newtab_metrics_only_new.yaml"
        pings_only_new = temp_dir / "newtab_pings_only_new.yaml"
        _write_diff_yaml(
            metrics_only_new, get_new_metrics(main_metrics, compare_metrics)
        )
        _write_diff_yaml(pings_only_new, get_new_pings(main_pings, compare_pings))

        all_objs, options = parse_with_options(
            [metrics_only_new, pings_only_new], {"allow_reserved": False}
        )
        buffer = io.StringIO()
        glean_utils.output_file_with_key(all_objs, buffer, options)
        return buffer.getvalue()


def generate(output, metrics_yaml, pings_yaml, channel):
    """GENERATED_FILES entry point: write the runtime metrics JSON to `output`.

    The build system calls this with the target file, then the declared inputs
    (New Tab's local metrics.yaml and pings.yaml), then the flags, which is why
    `channel` ("beta" or "release") comes last.

    The channel definitions are only fetched when MOZ_BROWSER_NEWTAB_METRICS_FETCH=1
    is set, otherwise an empty payload is written.
    """
    if os.environ.get("MOZ_BROWSER_NEWTAB_METRICS_FETCH") != "1":
        output.write("{}\n")
        return

    compare_metrics = _fetch_channel_yaml(channel, "metrics.yaml")
    compare_pings = _fetch_channel_yaml(channel, "pings.yaml")
    payload = _render_runtime_metrics(
        metrics_yaml, pings_yaml, compare_metrics, compare_pings
    )
    output.write(payload)
