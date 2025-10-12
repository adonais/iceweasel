# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the update-test suite to parametrize by locale, source version, machine
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.copy import deepcopy

from gecko_taskgraph.util.attributes import task_name

transforms = TransformSequence()

APPLICATIONS = ["fx"]

DOCKER_TO_WORKER = {
    "ubuntu2404-test": "t-linux-docker",
    "ubuntu1804-test": "t-linux-docker",
}
DOCKER_TO_PLATFORM = {
    "ubuntu2404-test": "linux2404-64",
    "ubuntu1804-test": "linux1804-64",
}

TOP_LOCALES = [
    "en-US",
    "zh-CN",
    "de",
    "fr",
    "it",
    "es-ES",
    "pt-BR",
    "ru",
    "pl",
    "en-GB",
]

BASE_TYPE_COMMAND = "./mach update-test"

UPDATE_ARTIFACT_NAME = "public/update-test"

DEFAULT_VERSIONS_BACK = 3


def infix_treeherder_symbol(symbol, infix):
    head, tail = symbol.split("(", 1)
    return f"{head}({tail[:-1]}-{infix})"


@transforms.add
def set_task_configuration(config, tasks):
    config_tasks = {}
    is_beta = config.params["release_type"] == "beta"

    for dep in config.kind_dependencies_tasks.values():
        if "update-verify-config" in dep.kind:
            config_tasks[task_name(dep)] = dep

    for task in tasks:
        for os in task["os"]:
            this_task = deepcopy(task)
            if config_tasks:
                if "ubuntu" in os:
                    config_task = config_tasks["firefox-linux64"]
                elif "win" in os:
                    config_task = config_tasks["firefox-win64"]
                elif "osx" in os:
                    config_task = config_tasks["firefox-macosx64"]
                this_task.setdefault("fetches", {})[config_task.label] = [
                    "update-verify.cfg",
                ]
            if os in DOCKER_TO_WORKER:
                worker_type = DOCKER_TO_WORKER[os]
                platform = DOCKER_TO_PLATFORM.get(os)
                this_task["worker"]["docker-image"] = {}
                this_task["worker"]["docker-image"]["in-tree"] = os
            else:
                worker_type = os
                platform = worker_type

            this_task.setdefault("attributes", {})
            this_task["attributes"]["build_platform"] = get_build_platform(platform)
            name_segments = this_task["name"].split("-")
            this_task["name"] = "-".join([platform, *name_segments[2:]])
            this_task["description"] = f"Test updates on {platform}"
            this_task["worker-type"] = worker_type
            this_task["treeherder"]["platform"] = f"{platform}/opt"
            this_task["run"]["cwd"] = "{checkout}"
            del this_task["os"]

            if is_beta and this_task["shipping-product"] == "firefox":
                this_task["name"] = this_task["name"] + "-beta"
                this_task["run"]["command"] = (
                    this_task["run"]["command"] + " --channel beta-localtest"
                )
            this_task["name"] = this_task["name"].replace("linux-docker-", "")
            this_task["index"]["job-name"] = "update-test-" + this_task["name"]

            for app in APPLICATIONS:
                if f"-{app}" in this_task["name"]:
                    break

            if f"{app}-" in this_task["name"]:
                (_, infix) = this_task["name"].split(app)
                this_task["treeherder"]["symbol"] = infix_treeherder_symbol(
                    this_task["treeherder"]["symbol"], infix
                )
            yield this_task


@transforms.add
def parametrize_by_locale(config, tasks):
    for task in tasks:
        if "locale" not in task.get("name"):
            yield task
            continue
        for locale in TOP_LOCALES:
            this_task = deepcopy(task)
            this_task["run"]["command"] = (
                this_task["run"]["command"] + f" --source-locale {locale}"
            )
            this_task["description"] = (
                f'{this_task["description"]}, locale coverage: {locale}'
            )
            this_task["name"] = this_task["name"].replace("locale", locale)
            this_task["index"][
                "job-name"
            ] = f'{this_task["index"]["job-name"]}-{locale}'
            this_task["treeherder"]["symbol"] = infix_treeherder_symbol(
                this_task["treeherder"]["symbol"], locale
            )
            yield this_task


@transforms.add
def parametrize_by_source_version(config, tasks):
    for task in tasks:
        if "source-version" not in task.get("name"):
            yield task
            continue
        # NB: We actually want source_versions_back = 0, because it gives us oldest usable ver
        for v in range(5):
            # avoid tasks with different names, same defs
            if v == DEFAULT_VERSIONS_BACK:
                continue
            this_task = deepcopy(task)
            this_task["run"]["command"] = (
                this_task["run"]["command"] + f" --source-versions-back {v}"
            )
            description_tag = (
                " from 3 major versions back" if v == 0 else f" from {v} releases back"
            )
            this_task["description"] = this_task["description"] + description_tag
            ago_tag = "-from-oldest" if v == 0 else f"-from-{v}-ago"
            this_task["name"] = this_task["name"].replace("-source-version", ago_tag)
            this_task["index"]["job-name"] = this_task["index"]["job-name"] + ago_tag
            this_task["treeherder"]["symbol"] = infix_treeherder_symbol(
                this_task["treeherder"]["symbol"], ago_tag.split("-", 2)[-1]
            )
            yield this_task


def get_build_platform(platform):
    build_platforms = {
        "win": "win64-shippable",
        "t-o": "macosx64-shippable",
        "lin": "linux64-shippable",
    }
    return build_platforms[platform[:3]]
