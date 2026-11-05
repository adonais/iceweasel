import mozunit

LINTER = "source-headers"


def test_lint_source_headers(lint, paths):
    for f in ("moz.build", "export.h"):
        results = lint(paths(f"success/{f}"))
        assert not results

    test_dir = "tools/lint/test/files/source-headers"
    for f in ("moz.build", "local.h", "new-local.h"):
        results = lint(paths(f"failure/{f}"))
        assert len(results) == 1
        assert (
            f"new-local.h found in {test_dir}/failure/ but not referenced in {test_dir}/failure/moz.build"
            in results[0].message
        )


def test_lint_source_headers_excluded(lint, config, paths):
    # Same as the failure above, but the moz.build is excluded
    config["local_exclude"] = ["failure/moz.build"]
    for f in ("moz.build", "local.h"):
        results = lint(paths(f"failure/{f}"), config=config)
        assert not results


if __name__ == "__main__":
    mozunit.main()
