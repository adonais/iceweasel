# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest

from mach.registrar import Registrar
from mozunit import main

# Importing mozbuild.frontend.mach_commands runs the @Command decorators, which
# require their categories to be registered first.
for _cat in ("build-dev",):
    if _cat not in Registrar.categories:
        Registrar.register_category(_cat, _cat, _cat)

from mozbuild.frontend.mach_commands import (  # noqa: E402
    _herald_reviewers_for_files,
    _parse_reviewers_from_subjects,
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
    return _herald_reviewers_for_files(rules, relpaths)[0]


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
        groups, individuals = _herald_reviewers_for_files(rules, ["dom/foo.cpp"])
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


class TestParseReviewersFromSubjects(unittest.TestCase):
    def test_individuals_and_groups(self):
        subjects = [
            "Bug 1 - do a thing r=foo,#bar-reviewers,baz!",
            "Bug 2 - another thing. r=foo",
        ]
        individuals, groups = _parse_reviewers_from_subjects(subjects)
        self.assertEqual(individuals, [("foo", 2), ("baz", 1)])
        self.assertEqual(groups, [("bar-reviewers", 1)])

    def test_group_classified_by_hash_prefix(self):
        # The "#" prefix is the group marker, not the "-reviewers" suffix.
        individuals, groups = _parse_reviewers_from_subjects([
            "Bug 1 - thing r=#webdriver-reviewers-rotation,not-a-group-reviewers"
        ])
        self.assertEqual(groups, [("webdriver-reviewers-rotation", 1)])
        self.assertEqual(individuals, [("not-a-group-reviewers", 1)])

    def test_review_request_syntax_not_parsed(self):
        # Committed messages use "r="; "r?" is a request and is not parsed.
        individuals, groups = _parse_reviewers_from_subjects(["Bug 1 - thing r?foo"])
        self.assertEqual(individuals, [])
        self.assertEqual(groups, [])

    def test_no_reviewer(self):
        individuals, groups = _parse_reviewers_from_subjects([
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
        individuals, _ = _parse_reviewers_from_subjects(subjects)
        self.assertEqual(individuals, [("aaa", 2), ("bbb", 1), ("ccc", 1)])


if __name__ == "__main__":
    main()
