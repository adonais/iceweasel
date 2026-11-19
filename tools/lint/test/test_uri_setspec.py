import os

import mozunit
import pytest

LINTER = "uri-setspec"


@pytest.mark.lint_config(name="avoid-uri-setspec")
def test_avoid_uri_setspec(lint, create_temp_file):
    # C++ mutator chain: flagged.
    create_temp_file(
        "nsCOMPtr<nsIURI> uri;\n"
        "NS_MutateURI(new nsSimpleURI::Mutator()).SetSpec(aSpec).Finalize(uri);\n",
        "chained.cpp",
    )
    # C++ call through a pointer: flagged.
    create_temp_file("mMutator->SetSpec(aSpec, nullptr);\n", "pointer.cpp")
    # JS mutator chain: flagged.
    create_temp_file(
        'let uri = other.mutate().setSpec("http://example.com").finalize();\n',
        "chained.mjs",
    )
    # The recommended replacements: not flagged.
    create_temp_file(
        "NS_NewURI(getter_AddRefs(uri), aSpec);\n"
        'Services.io.newURI("http://example.com");\n',
        "clean.cpp",
    )
    # The IDL declaration of the method is not a call: not flagged.
    create_temp_file(
        "  [must_use] nsIURIMutator setSpec(in AUTF8String aSpec);\n",
        "declaration.idl",
    )
    # A different method that merely starts with setSpec: not flagged.
    create_temp_file(
        'mutator.setSpecAndFilterWhitespace("http://example.com");\n',
        "other-method.mjs",
    )
    # Extensions the lint does not cover: not flagged.
    txt = create_temp_file("mutator.setSpec(spec);\n", "notes.txt")

    # Lint the whole temp directory so the `extensions` filter is exercised
    # (explicitly-passed files bypass extension filtering).
    results = lint([os.path.dirname(txt)])

    flagged = sorted(os.path.basename(r.path) for r in results)
    assert flagged == ["chained.cpp", "chained.mjs", "pointer.cpp"]
    for r in results:
        assert r.level == "error"
        assert r.lineno is not None
        assert "NS_NewURI" in r.message


if __name__ == "__main__":
    mozunit.main()
