# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import pytest
from mozunit import main
from taskgraph.task import Task
from taskgraph.util.schema import SchemaValidationError

from gecko_taskgraph.transforms.duplicate import transforms


def make_task(
    label,
    kind="build-thing",
    attributes=None,
    dependencies=None,
    soft_dependencies=None,
    if_dependencies=None,
    optimization=None,
):
    return Task(
        kind=kind,
        label=label,
        attributes=attributes or {"run_on_projects": ["all"]},
        task={
            "metadata": {"name": label},
            "tags": {"label": label, "kind": kind},
            "extra": {"treeherder": {"symbol": "B", "tier": 1}},
            "routes": ["index.gecko.v2.trunk.thing", "tc-treeherder.v2.thing"],
        },
        dependencies=dependencies or {},
        soft_dependencies=soft_dependencies or [],
        if_dependencies=if_dependencies or [],
        optimization=optimization,
    )


def run_duplicate(
    run_transform,
    duplicate,
    upstream,
    overrides=None,
    kind="build-thing-copy",
    kind_dependencies=None,
    templates=None,
):
    if templates is None:
        template = {"name": "copy", "duplicate": duplicate}
        template.update(overrides or {})
        templates = [template]
    if kind_dependencies is None:
        kind_dependencies = sorted({t.kind for t in upstream})
    return list(
        run_transform(
            transforms,
            templates,
            kind=kind,
            config={"kind-dependencies": kind_dependencies},
            kind_dependencies_tasks={t.label: t for t in upstream},
        )
    )


def test_copies_every_selected_task(run_transform):
    upstream = [make_task("build-thing-a"), make_task("build-thing-b")]
    tasks = run_duplicate(
        run_transform, {"kinds": ["build-thing"], "suffix": "-v"}, upstream
    )
    assert sorted(t["label"] for t in tasks) == ["build-thing-a-v", "build-thing-b-v"]


def test_ignores_other_kinds(run_transform):
    upstream = [make_task("build-thing-a"), make_task("other-b", kind="other")]
    tasks = run_duplicate(
        run_transform, {"kinds": ["build-thing"], "suffix": "-v"}, upstream
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_kinds_defaults_to_kind_dependencies(run_transform):
    upstream = [make_task("build-thing-a"), make_task("other-b", kind="other")]
    tasks = run_duplicate(run_transform, {"suffix": "-v"}, upstream)
    assert sorted(t["label"] for t in tasks) == ["build-thing-a-v", "other-b-v"]


def test_with_attributes_narrows_the_selection(run_transform):
    upstream = [
        make_task("build-thing-a", attributes={"build-type": "release"}),
        make_task("build-thing-b", attributes={"build-type": "debug"}),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "with-attributes": {"build-type": "release"},
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_with_attributes_accepts_a_list_of_values(run_transform):
    upstream = [
        make_task("build-thing-a", attributes={"build-type": "release"}),
        make_task("build-thing-b", attributes={"build-type": "debug"}),
        make_task("build-thing-c", attributes={"build-type": "asan"}),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "with-attributes": {"build-type": ["release", "asan"]},
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v", "build-thing-c-v"]


def test_with_attributes_skips_a_task_missing_the_attribute(run_transform):
    upstream = [
        make_task("build-thing-a", attributes={"build-type": "release"}),
        make_task("build-thing-b", attributes={}),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "with-attributes": {"build-type": "release"},
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_include_labels_keeps_only_matches(run_transform):
    upstream = [make_task("build-thing-a"), make_task("build-thing-b")]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "include-labels": ["-a$"],
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_exclude_labels_wins_over_include_labels(run_transform):
    upstream = [make_task("build-thing-a"), make_task("build-thing-b")]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "include-labels": ["^build-thing-"],
            "exclude-labels": ["-b$"],
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_exclude_labels_wins_over_with_attributes(run_transform):
    upstream = [
        make_task("build-thing-a", attributes={"build-type": "release"}),
        make_task("build-thing-beta", attributes={"build-type": "release"}),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "with-attributes": {"build-type": "release"},
            "exclude-labels": ["-beta$"],
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-v"]


def test_excludes_a_channel_no_attribute_records(run_transform):
    # The android build kinds mark a release or beta task with `release-type`
    # but leave a nightly task with no attributes at all, so the label is the
    # only thing every channel has in common.
    upstream = [
        make_task("build-thing-debug", attributes={}),
        make_task("build-thing-release", attributes={"release-type": "release"}),
        make_task("build-thing-nightly", attributes={}),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "exclude-labels": ["-(beta|release|nightly)(-|$)"],
        },
        upstream,
    )
    assert [t["label"] for t in tasks] == ["build-thing-debug-v"]


def test_drops_index_routes_and_keeps_the_rest(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [make_task("build-thing-a")],
    )
    assert tasks[0]["task"]["routes"] == ["tc-treeherder.v2.thing"]


def test_renames_task_identity(run_transform):
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-v",
            "treeherder-symbol-suffix": "-x",
        },
        [make_task("build-thing-a")],
    )
    inner = tasks[0]["task"]
    assert inner["metadata"]["name"] == "build-thing-a-v"
    assert inner["tags"]["label"] == "build-thing-a-v"
    assert inner["tags"]["kind"] == "build-thing-copy"
    assert inner["extra"]["treeherder"]["symbol"] == "B-x"


def test_set_name_labels_the_copy_after_its_own_kind(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "set-name": "strip-kind"},
        [make_task("build-thing-a")],
    )
    assert tasks[0]["label"] == "build-thing-copy-a"
    assert tasks[0]["task"]["metadata"]["name"] == "build-thing-copy-a"


def test_set_name_and_suffix_combine(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "set-name": "strip-kind", "suffix": "-v"},
        [make_task("build-thing-a")],
    )
    assert tasks[0]["label"] == "build-thing-copy-a-v"


def test_rejects_two_sources_naming_one_copy(run_transform):
    upstream = [
        make_task("build-thing-a"),
        make_task("test-thing-a", kind="test-thing"),
    ]
    with pytest.raises(Exception, match="would name the copies of both"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing", "test-thing"], "set-name": "strip-kind"},
            upstream,
        )


def test_records_where_each_copy_came_from(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [make_task("build-thing-a")],
    )
    assert tasks[0]["attributes"]["duplicate-of"] == "build-thing-a"


def test_sibling_keys_overlay_the_copy(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [make_task("build-thing-a")],
        overrides={
            "attributes": {"run_on_projects": []},
            "task": {"extra": {"treeherder": {"tier": 3}}},
        },
    )
    # A list is overwritten outright, not appended to.
    assert tasks[0]["attributes"]["run_on_projects"] == []
    # Nested dicts are descended into, so the sibling key survives.
    assert tasks[0]["task"]["extra"]["treeherder"] == {"symbol": "B", "tier": 3}


def test_sibling_keys_reach_the_resolved_payload(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [make_task("build-thing-a")],
        overrides={"task": {"payload": {"env": {"MOZ_ENABLE_PROFILING": "1"}}}},
    )
    assert tasks[0]["task"]["payload"]["env"] == {"MOZ_ENABLE_PROFILING": "1"}


def test_overrides_leave_the_source_task_alone(run_transform):
    source = make_task("build-thing-a")
    run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [source],
        overrides={"attributes": {"run_on_projects": []}},
    )
    assert source.attributes["run_on_projects"] == ["all"]
    assert source.task["metadata"]["name"] == "build-thing-a"


def test_chain_from_redirects_dependencies_to_their_copies(run_transform):
    upstream = [
        make_task("dep-a-p", kind="dep-copy", attributes={"duplicate-of": "dep-a"}),
        make_task("dep-b-p", kind="dep-copy", attributes={"duplicate-of": "dep-b"}),
        make_task("dep-c-p", kind="dep-copy", attributes={"duplicate-of": "dep-c"}),
        make_task(
            "build-thing-a",
            dependencies={"dep": "dep-a", "toolchain": "toolchain-z"},
            soft_dependencies=["dep-b", "other-z"],
            if_dependencies=["dep-c"],
        ),
    ]
    tasks = run_duplicate(
        run_transform,
        {
            "kinds": ["build-thing"],
            "suffix": "-p",
            "chain-from": ["dep-copy"],
        },
        upstream,
    )
    assert tasks[0]["dependencies"] == {"dep": "dep-a-p", "toolchain": "toolchain-z"}
    assert tasks[0]["soft-dependencies"] == ["dep-b-p", "other-z"]
    assert tasks[0]["if-dependencies"] == ["dep-c-p"]


def test_chain_from_ignores_kinds_it_does_not_name(run_transform):
    upstream = [
        make_task("dep-a-p", kind="dep-copy", attributes={"duplicate-of": "dep-a"}),
        make_task("dep-a-s", kind="dep-asan", attributes={"duplicate-of": "dep-a"}),
        make_task("build-thing-a", dependencies={"dep": "dep-a"}),
    ]
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v", "chain-from": ["dep-asan"]},
        upstream,
    )
    assert tasks[0]["dependencies"] == {"dep": "dep-a-s"}


def test_rejects_two_chained_kinds_duplicating_one_task(run_transform):
    upstream = [
        make_task("dep-a-p", kind="dep-copy", attributes={"duplicate-of": "dep-a"}),
        make_task("dep-a-s", kind="dep-asan", attributes={"duplicate-of": "dep-a"}),
        make_task("build-thing-a", dependencies={"dep": "dep-a"}),
    ]
    with pytest.raises(Exception, match="dep-a is duplicated by both"):
        run_duplicate(
            run_transform,
            {
                "kinds": ["build-thing"],
                "suffix": "-v",
                "chain-from": ["dep-copy", "dep-asan"],
            },
            upstream,
        )


def test_rejects_a_chain_from_kind_missing_from_kind_dependencies(run_transform):
    with pytest.raises(Exception, match="`duplicate.chain-from`.*absent"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing"], "suffix": "-v", "chain-from": ["absent"]},
            [make_task("build-thing-a")],
            kind_dependencies=["build-thing"],
        )


def test_one_kind_can_hold_several_templates(run_transform):
    upstream = [make_task("build-thing-a")]
    tasks = run_duplicate(
        run_transform,
        None,
        upstream,
        kind_dependencies=["build-thing"],
        templates=[
            {
                "name": "profiling",
                "duplicate": {"kinds": ["build-thing"], "suffix": "-p"},
                "task": {"extra": {"treeherder": {"tier": 3}}},
            },
            {
                "name": "asan",
                "duplicate": {"kinds": ["build-thing"], "suffix": "-s"},
            },
        ],
    )
    assert [t["label"] for t in tasks] == ["build-thing-a-p", "build-thing-a-s"]
    assert tasks[0]["task"]["extra"]["treeherder"]["tier"] == 3
    assert tasks[1]["task"]["extra"]["treeherder"]["tier"] == 1


def test_keeps_a_removal_optimization(run_transform):
    tasks = run_duplicate(
        run_transform,
        {"kinds": ["build-thing"], "suffix": "-v"},
        [make_task("build-thing-a", optimization={"skip-unless-backstop": None})],
    )
    assert tasks[0]["optimization"] == {"skip-unless-backstop": None}


def test_rejects_a_replacement_optimization(run_transform):
    with pytest.raises(Exception, match="index-search"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing"], "suffix": "-v"},
            [make_task("build-thing-a", optimization={"index-search": ["some.index"]})],
        )


def test_passes_through_a_template_without_a_duplicate_block(run_transform):
    tasks = run_duplicate(
        run_transform,
        None,
        [make_task("build-thing-a")],
        kind_dependencies=["build-thing"],
        templates=[{"name": "mine"}],
    )
    assert tasks == [{"name": "mine"}]


def test_rejects_an_unknown_key_inside_duplicate(run_transform):
    with pytest.raises(SchemaValidationError):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing"], "suffix": "-v", "typo": True},
            [make_task("build-thing-a")],
        )


def test_rejects_a_kind_missing_from_kind_dependencies(run_transform):
    with pytest.raises(Exception, match="missing from `kind-dependencies`"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing", "absent"], "suffix": "-v"},
            [make_task("build-thing-a")],
            kind_dependencies=["build-thing"],
        )


def test_requires_a_suffix_or_a_set_name(run_transform):
    with pytest.raises(Exception, match="tell a copy apart from its source"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing"]},
            [make_task("build-thing-a")],
        )


def test_rejects_an_unknown_set_name(run_transform):
    with pytest.raises(Exception, match="unknown"):
        run_duplicate(
            run_transform,
            {"kinds": ["build-thing"], "set-name": "not-a-function"},
            [make_task("build-thing-a")],
        )


if __name__ == "__main__":
    main()
