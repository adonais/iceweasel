import os

import mozunit
import pytest

LINTER = "rejected-words"


@pytest.mark.lint_config(name="forbid-moduleloaderbase-include")
def test_forbid_moduleloaderbase_include(lint, create_temp_file):
    # Header including the fully-qualified path: flagged.
    create_temp_file('#include "js/loader/ModuleLoaderBase.h"\n', "with-prefix.h")
    # Header including the bare name: flagged (the path prefix is optional).
    create_temp_file('#include "ModuleLoaderBase.h"\n', "bare.h")
    # Header including it with extra whitespace: flagged.
    create_temp_file('#  include   "js/loader/ModuleLoaderBase.h"\n', "spaced.h")
    # Header that only forward-declares the type: not flagged.
    create_temp_file(
        "namespace JS::loader { class ModuleLoaderBase; }\n", "forward-decl.h"
    )
    # A .cpp including it: not flagged (the stanza only applies to `h`).
    cpp = create_temp_file('#include "js/loader/ModuleLoaderBase.h"\n', "source.cpp")

    # Lint the whole temp directory so the `extensions: [h]` filter is exercised
    # (explicitly-passed files bypass extension filtering).
    results = lint([os.path.dirname(cpp)])

    flagged = sorted(os.path.basename(r.path) for r in results)
    assert flagged == ["bare.h", "spaced.h", "with-prefix.h"]
    for r in results:
        assert r.level == "error"
        assert r.lineno == 1
        assert "ModuleLoaderBase.h" in r.message


if __name__ == "__main__":
    mozunit.main()
