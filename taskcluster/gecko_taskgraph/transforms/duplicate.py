# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Duplicate tasks from other kinds, overlaying changes onto each copy.

A task in a kind using these transforms is a template rather than a task of its
own. Its ``duplicate`` block selects tasks from other kinds, and every other key
the template defines is overlaid onto each copy, so one push can run the same
work twice and the two runs can be compared, even when the difference between
them is compiled into their artifacts.

.. code-block:: yaml

    # taskcluster/kinds/build-components-appservices/kind.yml
    loader: taskgraph.loader.transform:loader
    transforms:
        - gecko_taskgraph.transforms.duplicate:transforms
    kind-dependencies:
        - build-components
    tasks:
        appservices-in-tree:
            duplicate:
                kinds: [build-components]
                suffix: -appservices-in-tree
                treeherder-symbol-suffix: -as
            attributes:
                run_on_projects: []

The selected tasks have already been through the ``job`` and ``task``
transforms, so an override names a key of the resolved task rather than of the
definition it was built from: ``task.payload.env`` rather than ``worker.env``.
An override descends into nested dicts and overwrites every other value.

``with-attributes`` narrows the selection the way it does in the upstream
``from-deps`` transforms, matching with
:func:`~taskgraph.util.attributes.attrmatch`. ``include-labels`` and
``exclude-labels`` narrow it by regular expressions matched against the source
label, for the selections an attribute cannot describe: ``attrmatch`` treats a
missing attribute as no match, so it can only name tasks that carry one, and a
release channel is not something every kind records in its attributes.
``exclude-labels`` wins over both of the other two.

Each copy records the label it came from in its ``duplicate-of`` attribute.
When a chain of kinds is duplicated together, the downstream template names the
kinds holding the upstream copies in ``chain-from``, and a dependency on a task
one of those kinds copied is rewritten to the copy. List both the upstream kind
and the kind duplicating it in ``kind-dependencies`` so the copies exist by the
time the downstream template runs.
"""

import re
from typing import Optional, Union

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.attributes import attrmatch
from taskgraph.util.copy import deepcopy
from taskgraph.util.schema import Schema
from taskgraph.util.set_name import SET_NAME_MAP

# Strategies that substitute an already indexed task for the one being
# optimized. A copy publishes no index routes of its own, so it would resolve
# to the task it was copied from.
REPLACEMENT_OPTIMIZATIONS = {"index-search"}

# Keys of a template that configure the duplication or name the template
# itself, rather than describing an override to apply to each copy.
NON_OVERRIDE_KEYS = {"duplicate", "name", "task-from"}

DUPLICATE_SCHEMA = Schema.from_dict(
    {
        "duplicate": Schema.from_dict(
            {
                "kinds": Optional[list[str]],
                "with-attributes": Optional[dict[str, Union[list, str]]],
                "include-labels": Optional[list[str]],
                "exclude-labels": Optional[list[str]],
                "suffix": Optional[str],
                "set-name": Optional[str],
                "treeherder-symbol-suffix": Optional[str],
                "chain-from": Optional[list[str]],
            },
            optional=True,
        ),
    },
    name="DuplicateSchema",
    forbid_unknown_fields=False,
)

transforms = TransformSequence()
transforms.add_validate(DUPLICATE_SCHEMA)


def _apply_overrides(base, overrides):
    """Overlay ``overrides`` onto ``base`` in place, descending into nested
    dicts and overwriting every other value.
    """
    for key, value in overrides.items():
        if isinstance(base.get(key), dict) and isinstance(value, dict):
            _apply_overrides(base[key], value)
        else:
            base[key] = deepcopy(value)


def _copy_task_description(task):
    """Rebuild the task description dict that ``Kind.load_tasks`` turns back
    into a ``Task``.
    """
    copy = deepcopy(task)
    return {
        "label": copy.label,
        "description": copy.description,
        "attributes": copy.attributes,
        "dependencies": copy.dependencies,
        "soft-dependencies": copy.soft_dependencies,
        "if-dependencies": copy.if_dependencies,
        "optimization": copy.optimization,
        "task": copy.task,
    }


def _build_redirect_map(config, template_name, chain_from):
    """Map the label of each task duplicated by a kind named in ``chain-from``
    to its copy.
    """
    redirect = {}
    for task in config.kind_dependencies_tasks.values():
        source = task.attributes.get("duplicate-of")
        if source is None or task.kind not in chain_from:
            continue
        if source in redirect:
            raise Exception(
                f"{config.kind} task {template_name!r} cannot chain from "
                f"{sorted(chain_from)}, because {source} is duplicated by both "
                f"{redirect[source]} and {task.label}."
            )
        redirect[source] = task.label
    return redirect


def _duplicate_template(config, kind_deps, template):
    template_name = template["name"]
    cfg = template["duplicate"]

    kinds = cfg.get("kinds", kind_deps)
    chain_from = set(cfg.get("chain-from", []))
    for key, named in (("kinds", set(kinds)), ("chain-from", chain_from)):
        invalid = named - set(kind_deps)
        if invalid:
            raise Exception(
                f"{config.kind} task {template_name!r} names kinds in "
                f"`duplicate.{key}` that are missing from `kind-dependencies`: "
                f"{sorted(invalid)}."
            )
    if not kinds:
        raise Exception(
            f"{config.kind} task {template_name!r} needs at least one kind in "
            f"`duplicate.kinds` or in `kind-dependencies`."
        )

    suffix = cfg.get("suffix", "")
    set_name = cfg.get("set-name")
    if not suffix and not set_name:
        raise Exception(
            f"{config.kind} task {template_name!r} needs `duplicate.suffix` or "
            f"`duplicate.set-name` to tell a copy apart from its source."
        )
    if set_name and set_name not in SET_NAME_MAP:
        raise Exception(
            f"{config.kind} task {template_name!r} has an unknown "
            f"`duplicate.set-name` {set_name!r}, expected one of "
            f"{sorted(SET_NAME_MAP)}."
        )

    symbol_suffix = cfg.get("treeherder-symbol-suffix", "")
    with_attributes = cfg.get("with-attributes")
    included = [re.compile(p) for p in cfg.get("include-labels", [])]
    excluded = [re.compile(p) for p in cfg.get("exclude-labels", [])]
    redirect = _build_redirect_map(config, template_name, chain_from)
    overrides = {k: v for k, v in template.items() if k not in NON_OVERRIDE_KEYS}

    sources = sorted(
        (
            dep
            for dep in config.kind_dependencies_tasks.values()
            if dep.kind in kinds
            if not with_attributes or attrmatch(dep.attributes, **with_attributes)
            if not included or any(p.search(dep.label) for p in included)
            if not any(p.search(dep.label) for p in excluded)
        ),
        key=lambda dep: dep.label,
    )

    copied_from = {}
    for source in sources:
        unsupported = REPLACEMENT_OPTIMIZATIONS.intersection(source.optimization or {})
        if unsupported:
            raise Exception(
                f"{config.kind} cannot duplicate {source.label}, which "
                f"optimizes with {sorted(unsupported)}."
            )

        new_task = _copy_task_description(source)
        if set_name:
            name = SET_NAME_MAP[set_name](config, sources, source, source.kind)
            label = f"{config.kind}-{name}{suffix}"
        else:
            label = source.label + suffix
        if label in copied_from:
            raise Exception(
                f"{config.kind} task {template_name!r} would name the copies of "
                f"both {copied_from[label]} and {source.label} {label}."
            )
        copied_from[label] = source.label
        new_task["label"] = label
        new_task["attributes"]["duplicate-of"] = source.label
        new_task["dependencies"] = {
            name: redirect.get(dep, dep)
            for name, dep in new_task["dependencies"].items()
        }
        new_task["soft-dependencies"] = [
            redirect.get(dep, dep) for dep in new_task["soft-dependencies"]
        ]
        new_task["if-dependencies"] = [
            redirect.get(dep, dep) for dep in new_task["if-dependencies"]
        ]

        inner = new_task["task"]
        if symbol_suffix:
            treeherder = inner.get("extra", {}).get("treeherder", {})
            if "symbol" in treeherder:
                treeherder["symbol"] += symbol_suffix
        # A copy must not publish under the source task's index routes.
        # Everything else, ``tc-treeherder.v2.*`` above all, has to stay.
        routes = inner.get("routes")
        if routes:
            inner["routes"] = [r for r in routes if not r.startswith("index.")]
        # Keep the copy distinct from its source in Treeherder, which groups by
        # ``metadata.name``.
        metadata = inner.setdefault("metadata", {})
        if "name" in metadata:
            metadata["name"] = label
        tags = inner.setdefault("tags", {})
        if "label" in tags:
            tags["label"] = label
        tags["kind"] = config.kind

        _apply_overrides(new_task, overrides)
        yield new_task


@transforms.add
def duplicate_tasks(config, tasks):
    """Yield a copy of every task each template selects."""
    kind_deps = config.config.get("kind-dependencies", [])
    for template in tasks:
        if "duplicate" not in template:
            yield template
            continue
        yield from _duplicate_template(config, kind_deps, template)
