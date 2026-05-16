# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import json
import os
import shutil
import unicodedata

import mozpack.path as mozpath
from mozpack.files import FileFinder


def clear_dir(path):
    if not os.path.isdir(path) and not os.path.islink(path):
        raise Exception(f"{path} is not a directory")
    for filename in os.listdir(path):
        file_path = mozpath.join(path, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print(f"Failed to delete {file_path}. Reason: {e}")


def generate_individual_json_files_from_interventions_json(
    interventions_json_path, output_interventions_dir
):
    """Generate data/interventions/*.json from interventions.json"""

    clear_dir(output_interventions_dir)

    with open(interventions_json_path) as fd:
        for bug, config in json.load(fd).items():
            label = (
                config["label"]
                .replace(" ", "_")
                .replace(os.path.sep, "_")
                .replace("(", "")
                .replace(")", "")
            )
            normalized = unicodedata.normalize("NFD", f"{bug}-{label}.json")
            filename = "".join([c for c in normalized if not unicodedata.combining(c)])
            with open(mozpath.join(output_interventions_dir, filename), "w") as fd2:
                fd2.write(json.dumps(config, indent=2))


def generate_run_js(
    output_fd, template_path, interventions_dir, interventions_json_path=None
):
    with open(template_path) as template_fd:
        if interventions_json_path:
            generate_individual_json_files_from_interventions_json(
                interventions_json_path, interventions_dir
            )

        input_files = list(FileFinder(interventions_dir).find("*.json"))

        interventions = {}
        for name, json_fd in input_files:
            bug_number = mozpath.splitext(mozpath.basename(name))[0].split("-")[0]
            interventions[bug_number] = json.load(json_fd)

        interventions_json = json.dumps(dict(sorted(interventions.items())), indent=2)

        raw = template_fd.read()
        subbed = raw.replace(
            "// Note that this variable is expanded during build-time. See bz2019069 for details.\n",
            "",
        )
        subbed = raw.replace(
            "AVAILABLE_INTERVENTIONS = {}",
            f"AVAILABLE_INTERVENTIONS = {interventions_json}",
        )
        output_fd.write(subbed)


def main(*args):  # mach requires this
    pass
