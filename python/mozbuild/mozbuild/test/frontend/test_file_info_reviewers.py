# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest

from mozunit import main

from mozbuild.frontend.reviewers import (
    herald_reviewers_for_files,
    mots_groups_for_files,
    mots_modules_for_files,
    parse_reviewers_from_subjects,
)


def _rule(name, conditions, reviewers):
    return {
        "id": name,
        "name": name,
        "status": "active",
        "conditions": [
            {"type": "differential-affected-files", "operator": op, "value": value}
            for op, value in conditions
        ],
        "actions": [{"type": "add-reviewers", "reviewers": reviewers}],
    }


def _group(target, blocking=True):
    return {"target": target, "is_group": True, "blocking": blocking}


def _individual(target, blocking=False):
    return {"target": target, "is_group": False, "blocking": blocking}


def _groups(rules, relpaths):
    return herald_reviewers_for_files(rules, relpaths)[0]


class TestHeraldReviewersForFiles(unittest.TestCase):
    def test_matches_regexp(self):
        rules = {
            "rules": [
                _rule(
                    "necko",
                    [("matches-regexp", r"^/?netwerk/")],
                    [_group("necko-reviewers")],
                )
            ]
        }
        self.assertEqual(
            _groups(rules, ["netwerk/protocol/http/foo.cpp"]),
            {"necko-reviewers": True},
        )
        self.assertEqual(_groups(rules, ["dom/foo.cpp"]), {})

    def test_leading_slash_is_optional(self):
        # Herald regexps match paths with an optional leading slash; our relative
        # paths have none, so both forms must be tried.
        rules = {
            "rules": [
                _rule(
                    "remote",
                    [("matches-regexp", r"^\/?remote\/")],
                    [_group("webdriver-reviewers")],
                )
            ]
        }
        self.assertEqual(
            _groups(rules, ["remote/shared/Realm.sys.mjs"]),
            {"webdriver-reviewers": True},
        )

    def test_negative_condition_excludes(self):
        # The necko rule matches netwerk/ but excludes netwerk/cookie/.
        rules = {
            "rules": [
                _rule(
                    "necko",
                    [
                        ("does-not-match-regexp", r"^/?netwerk/cookie/"),
                        ("matches-regexp", r"^/?netwerk/"),
                    ],
                    [_group("necko-reviewers")],
                )
            ]
        }
        self.assertEqual(
            _groups(rules, ["netwerk/protocol/http/foo.cpp"]),
            {"necko-reviewers": True},
        )
        self.assertEqual(
            _groups(rules, ["netwerk/cookie/CookieService.cpp"]),
            {},
        )

    def test_negative_only_rule_does_not_fire(self):
        # A rule whose only file condition is negative relies on non-file
        # conditions we don't evaluate, so it must not fire for arbitrary paths.
        rules = {
            "rules": [
                _rule(
                    "thunderbird-data",
                    [("does-not-contain", "third_party")],
                    [_group("thunderbird-data-reviewers")],
                )
            ]
        }
        self.assertEqual(
            _groups(rules, ["browser/base/content/browser.js"]),
            {},
        )

    def test_blocking_is_or_of_matching_rules(self):
        rules = {
            "rules": [
                _rule(
                    "a",
                    [("matches-regexp", r"^/?dom/")],
                    [_group("dom-reviewers", blocking=False)],
                ),
                _rule(
                    "b",
                    [("matches-regexp", r"foo")],
                    [_group("dom-reviewers", blocking=True)],
                ),
            ]
        }
        self.assertEqual(
            _groups(rules, ["dom/foo.cpp"]),
            {"dom-reviewers": True},
        )

    def test_individual_reviewers_included(self):
        rules = {
            "rules": [
                _rule(
                    "a",
                    [("matches-regexp", r"^/?dom/")],
                    [_individual("someone"), _group("dom-reviewers")],
                )
            ]
        }
        groups, individuals = herald_reviewers_for_files(rules, ["dom/foo.cpp"])
        self.assertEqual(groups, {"dom-reviewers": True})
        self.assertEqual(individuals, {"someone": False})

    def test_inactive_rule_ignored(self):
        rules = {
            "rules": [
                {
                    "id": "x",
                    "status": "disabled",
                    "conditions": [
                        {
                            "type": "differential-affected-files",
                            "operator": "matches-regexp",
                            "value": r"^/?dom/",
                        }
                    ],
                    "actions": [
                        {
                            "type": "add-reviewers",
                            "reviewers": [_group("dom-reviewers")],
                        }
                    ],
                }
            ]
        }
        self.assertEqual(_groups(rules, ["dom/foo.cpp"]), {})

    def test_unknown_operator_does_not_match(self):
        # An operator we don't understand must not let the rule fire.
        rules = {
            "rules": [
                _rule(
                    "a",
                    [
                        ("matches-regexp", r"^/?dom/"),
                        ("some-future-operator", "whatever"),
                    ],
                    [_group("dom-reviewers")],
                )
            ]
        }
        self.assertEqual(_groups(rules, ["dom/foo.cpp"]), {})

    def test_invalid_regexp_does_not_match(self):
        # A malformed regexp must not raise; the rule simply doesn't match.
        rules = {
            "rules": [
                _rule(
                    "a",
                    [("matches-regexp", r"^/?dom/(")],
                    [_group("dom-reviewers")],
                )
            ]
        }
        self.assertEqual(_groups(rules, ["dom/foo.cpp"]), {})


def _module(machine_name, includes, **kwargs):
    module = {
        "machine_name": machine_name,
        "name": machine_name,
        "includes": includes,
    }
    module.update(kwargs)
    return module


class TestMotsModulesForFiles(unittest.TestCase):
    def test_glob_and_directory_includes(self):
        config = {
            "modules": [
                _module("necko", ["netwerk/**/*"]),
                # A pattern naming a directory covers everything under it.
                _module("rlbox", ["security/rlbox"]),
            ]
        }

        def names(paths):
            return [m["machine_name"] for m in mots_modules_for_files(config, paths)]

        self.assertEqual(names(["netwerk/dns/DNS.cpp"]), ["necko"])
        self.assertEqual(names(["security/rlbox/rlbox.h"]), ["rlbox"])
        self.assertEqual(names(["dom/foo.cpp"]), [])

    def test_excludes(self):
        config = {
            "modules": [_module("necko", ["netwerk/**/*"], excludes=["netwerk/cookie"])]
        }
        self.assertEqual(
            mots_modules_for_files(config, ["netwerk/cookie/CookieService.cpp"]),
            [],
        )

    def test_external_includes_never_match(self):
        config = {"modules": [_module("bugbug", ["https://github.com/mozilla/bugbug"])]}
        self.assertEqual(mots_modules_for_files(config, ["https/foo"]), [])

    def test_empty_pattern_owns_nothing(self):
        # mozpath.match matches everything against an empty pattern.
        config = {"modules": [_module("everything", ["/"])]}
        self.assertEqual(mots_modules_for_files(config, ["dom/foo.cpp"]), [])

    def test_submodule_takes_precedence_over_parent(self):
        config = {
            "modules": [
                _module(
                    "build_config",
                    ["build/**/*", "taskcluster/**/*"],
                    submodules=[
                        _module(
                            "taskgraph",
                            ["taskcluster/**/*"],
                            meta={"review_group": "taskgraph-reviewers"},
                        )
                    ],
                )
            ]
        }
        modules = mots_modules_for_files(
            config, ["taskcluster/ci/config.yml", "build/moz.build"]
        )
        self.assertEqual(
            {m["machine_name"]: m["paths"] for m in modules},
            {
                "build_config": ["build/moz.build"],
                "taskgraph": ["taskcluster/ci/config.yml"],
            },
        )

    def test_submodule_inherits_parent_excludes(self):
        config = {
            "modules": [
                _module(
                    "necko",
                    ["netwerk/**/*"],
                    excludes=["netwerk/cookie/**/*"],
                    submodules=[
                        _module(
                            "http",
                            ["netwerk/**/*"],
                            meta={"review_group": "necko-http"},
                        )
                    ],
                )
            ]
        }
        self.assertEqual(
            mots_modules_for_files(config, ["netwerk/cookie/CookieService.cpp"]), []
        )

    def test_submodule_empty_excludes_does_not_inherit_parent(self):
        config = {
            "modules": [
                _module(
                    "necko",
                    ["netwerk/**/*"],
                    excludes=["netwerk/cookie/**/*"],
                    submodules=[
                        _module(
                            "cookies",
                            ["netwerk/cookie/**/*"],
                            excludes=[],
                            meta={"review_group": "necko-cookies"},
                        )
                    ],
                )
            ]
        }
        path = "netwerk/cookie/CookieService.cpp"
        self.assertEqual(
            mots_groups_for_files(config, [path]), {"necko-cookies": ["cookies"]}
        )

    def test_submodule_without_review_group_keeps_parent(self):
        # A submodule with no reviewer group of its own has no reviewer to
        # contribute, so claiming the parent's paths would only lose the
        # parent's group.
        config = {
            "modules": [
                _module(
                    "desktop",
                    ["browser/**/*"],
                    meta={"review_group": "firefox-desktop-core-reviewers"},
                    submodules=[_module("downloads", ["browser/components/downloads"])],
                )
            ]
        }
        path = "browser/components/downloads/Downloads.sys.mjs"
        self.assertEqual(
            {
                m["machine_name"]: m["paths"]
                for m in mots_modules_for_files(config, [path])
            },
            {"desktop": [path]},
        )
        self.assertEqual(
            mots_groups_for_files(config, [path]),
            {"firefox-desktop-core-reviewers": ["desktop"]},
        )

    def test_submodule_without_patterns_keeps_parent(self):
        # A submodule declaring no patterns inherits the parent's whole scope,
        # so it says nothing about which paths it owns and must not claim them:
        # mots.yaml has such submodules (e.g. localization under Firefox
        # Desktop) whose group is not the right suggestion for the whole parent.
        config = {
            "modules": [
                _module(
                    "desktop",
                    ["browser/**/*"],
                    meta={"review_group": "firefox-desktop-core-reviewers"},
                    submodules=[
                        {
                            "machine_name": "localization",
                            "name": "localization",
                            "includes": [],
                            "meta": {"review_group": "fluent-reviewers"},
                        }
                    ],
                )
            ]
        }
        self.assertEqual(
            mots_groups_for_files(config, ["browser/base/content/browser.js"]),
            {"firefox-desktop-core-reviewers": ["desktop"]},
        )

    def test_exclude_module_paths_defers_to_other_modules(self):
        config = {
            "modules": [
                _module("catchall", ["dom/**/*"], exclude_module_paths=True),
                _module("media", ["dom/media/**/*"]),
            ]
        }
        modules = mots_modules_for_files(
            config, ["dom/media/AudioSink.cpp", "dom/base/Element.cpp"]
        )
        self.assertEqual(
            {m["machine_name"]: m["paths"] for m in modules},
            {
                "catchall": ["dom/base/Element.cpp"],
                "media": ["dom/media/AudioSink.cpp"],
            },
        )


class TestMotsGroupsForFiles(unittest.TestCase):
    def test_only_review_group_meta_is_a_reviewer(self):
        # meta.group is a mailing list, which is not a usable reviewer, and a
        # module with no review group contributes nothing since owners and peers
        # are not suggested.
        config = {
            "modules": [
                _module(
                    "necko",
                    ["netwerk/**/*"],
                    meta={"group": "dev-tech-network", "review_group": "necko"},
                    owners=[{"nick": "valentin"}],
                ),
                _module(
                    "ua",
                    ["netwerk/http/**/*"],
                    meta={"group": "dev-platform"},
                    owners=[{"nick": "tantek"}],
                ),
            ]
        }
        self.assertEqual(
            mots_groups_for_files(config, ["netwerk/http/nsHttpChannel.cpp"]),
            {"necko": ["necko"]},
        )

    def test_group_shared_by_several_modules(self):
        config = {
            "modules": [
                _module("necko", ["netwerk/**/*"], meta={"review_group": "necko"}),
                _module("fetch", ["dom/fetch/**/*"], meta={"review_group": "necko"}),
            ]
        }
        self.assertEqual(
            mots_groups_for_files(config, ["netwerk/dns/DNS.cpp", "dom/fetch/Fetch.h"]),
            {"necko": ["fetch", "necko"]},
        )

    def test_no_match(self):
        config = {
            "modules": [_module("necko", ["netwerk/**/*"], meta={"review_group": "n"})]
        }
        self.assertEqual(mots_groups_for_files(config, ["dom/foo.cpp"]), {})


class TestParseReviewersFromSubjects(unittest.TestCase):
    def test_individuals_and_groups(self):
        subjects = [
            "Bug 1 - do a thing r=foo,#bar-reviewers,baz!",
            "Bug 2 - another thing. r=foo",
        ]
        individuals, groups = parse_reviewers_from_subjects(subjects)
        self.assertEqual(individuals, [("foo", 2), ("baz", 1)])
        self.assertEqual(groups, [("bar-reviewers", 1)])

    def test_group_classified_by_hash_prefix(self):
        # The "#" prefix is the group marker, not the "-reviewers" suffix.
        individuals, groups = parse_reviewers_from_subjects([
            "Bug 1 - thing r=#webdriver-reviewers-rotation,not-a-group-reviewers"
        ])
        self.assertEqual(groups, [("webdriver-reviewers-rotation", 1)])
        self.assertEqual(individuals, [("not-a-group-reviewers", 1)])

    def test_review_request_syntax_not_parsed(self):
        # Committed messages use "r="; "r?" is a request and is not parsed.
        individuals, groups = parse_reviewers_from_subjects(["Bug 1 - thing r?foo"])
        self.assertEqual(individuals, [])
        self.assertEqual(groups, [])

    def test_no_reviewer(self):
        individuals, groups = parse_reviewers_from_subjects([
            "Bug 1 - thing with no reviewer trailer"
        ])
        self.assertEqual(individuals, [])
        self.assertEqual(groups, [])

    def test_ranking_is_by_count_then_name(self):
        subjects = [
            "r=bbb",
            "r=aaa",
            "r=aaa",
            "r=ccc",
        ]
        individuals, _ = parse_reviewers_from_subjects(subjects)
        self.assertEqual(individuals, [("aaa", 2), ("bbb", 1), ("ccc", 1)])


if __name__ == "__main__":
    main()
