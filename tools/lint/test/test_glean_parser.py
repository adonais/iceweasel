# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import mozunit

LINTER = "glean-parser"


def test_lint_glean_parser_good(lint, paths):
    """Test that good metrics.yaml files pass validation."""
    results = lint(paths("good/"))

    assert len(results) == 0


def test_lint_glean_parser_bad(lint, paths):
    """Test that bad metrics.yaml files are caught by the linter."""
    results = lint(paths("bad/"))

    # Should have exactly 2 errors: one for empty data_reviews, one for TODO data_reviews
    assert len(results) == 2

    # All results should be errors
    for r in results:
        assert r.level == "error"
        assert "bad/metrics.yaml" in r.relpath

    # Check that we get the expected error messages
    messages = [r.message for r in results]

    # Should have errors about empty data reviews
    empty_data_review_errors = [msg for msg in messages if "EMPTY_DATAREVIEW" in msg]
    assert len(empty_data_review_errors) == 2

    # Check specific metric names are mentioned
    assert any("empty_data_review" in msg for msg in messages)
    assert any("todo_data_review" in msg for msg in messages)


def test_lint_glean_parser_invalid(lint, paths):
    """Test that metrics.yaml files that don't match the schema are caught."""
    results = sorted(lint(paths("invalid/")), key=lambda r: r.relpath)

    assert len(results) == 2
    for r in results:
        assert r.level == "error"

    all_pings, schema = results
    assert "invalid/all_pings_metrics.yaml" in all_pings.relpath
    assert all_pings.lineno == 8
    assert all_pings.message.startswith("On instance invalid.all_pings\n")
    assert "all-pings" in all_pings.message

    assert "invalid/metrics.yaml" in schema.relpath
    assert schema.lineno == 0
    assert schema.message.startswith(
        "Additional properties are not allowed ('not_a_real_property' was"
    )


def test_lint_glean_parser_invalid_tags(lint, paths, linter_module, monkeypatch):
    """Test that errors in tags.yaml, which isn't linted directly, are
    reported on the linted files."""
    monkeypatch.setattr(linter_module, "tags_yamls", paths("invalid_tags/tags.yaml"))
    results = lint(paths("good/"))

    assert len(results) == 1
    assert results[0].level == "error"
    assert "good/metrics.yaml" in results[0].relpath
    assert results[0].lineno == 0
    assert results[0].message.startswith(
        "tools/lint/test/files/glean-parser/invalid_tags/tags.yaml: "
        "Additional properties are not allowed ('not_a_real_property' was"
    )


if __name__ == "__main__":
    mozunit.main()
