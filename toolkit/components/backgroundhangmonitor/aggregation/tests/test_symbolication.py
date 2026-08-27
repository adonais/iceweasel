# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Tests for breakpad .sym parsing, URL building, and process_module."""

import os
import sys

import mozunit

_HERE = os.path.dirname(os.path.abspath(__file__))
_AGGREGATION_DIR = os.path.dirname(_HERE)
if _AGGREGATION_DIR not in sys.path:
    sys.path.insert(0, _AGGREGATION_DIR)

from symbolication import (  # noqa: E402
    UNSYMBOLICATED,
    get_file_url,
    make_sym_map,
    parse_inlines,
    process_module,
)

_FIXTURE_PATH = os.path.join(_HERE, "fixtures", "example.sym")


def _read_fixture():
    with open(_FIXTURE_PATH, "rb") as f:
        return f.read()


# --- make_sym_map -----------------------------------------------------------


def test_make_sym_map_parses_public_and_func_entries():
    sorted_keys, sym_map = make_sym_map(_read_fixture())
    # Hex addresses from the fixture.
    assert sym_map[0x1000] == "FooFunction()"
    assert sym_map[0x2000] == "BarFunction(int)"
    assert sym_map[0x3000] == "PublicSymbol"


def test_make_sym_map_prioritises_public_over_func_at_same_address():
    _, sym_map = make_sym_map(_read_fixture())
    # PUBLIC 4000 wins over FUNC 4000.
    assert sym_map[0x4000] == "SymbolPreferredOverFunc"


def test_make_sym_map_handles_multiline_m_prefix():
    _, sym_map = make_sym_map(_read_fixture())
    # "PUBLIC m 5000 0 MultilineSymbol" — the m-prefix shifts field offsets.
    assert sym_map[0x5000] == "MultilineSymbol"


def test_make_sym_map_skips_lines_with_non_hex_addresses():
    _, sym_map = make_sym_map(_read_fixture())
    # Neither malformed entry should land in the map.
    skipped = {v for v in sym_map.values()}
    assert "SkippedBecauseHexParseFails" not in skipped
    assert "AlsoSkipped" not in skipped


def test_make_sym_map_returns_sorted_keys_for_bisect():
    sorted_keys, sym_map = make_sym_map(_read_fixture())
    assert sorted_keys == sorted(sym_map.keys())


def test_make_sym_map_handles_empty_input():
    sorted_keys, sym_map = make_sym_map(b"")
    assert sorted_keys == []
    assert sym_map == {}


# --- parse_inlines ----------------------------------------------------------


def test_parse_inlines_resolves_chain_for_wanted_func():
    # OuterFunc() at 0x2500 has a two-level inline chain in the fixture.
    func_inlines = parse_inlines(_read_fixture(), {0x2500})
    inlines = func_inlines[0x2500]
    by_name = {name: (nest, ranges) for nest, name, ranges in inlines}
    assert by_name["InlinedOuter()"] == (0, [(0x2500, 0x2520)])
    assert by_name["InlinedInner()"] == (1, [(0x2505, 0x2515)])


def test_parse_inlines_ignores_unwanted_funcs():
    # Only the requested func's inlines are parsed; others are skipped entirely.
    assert parse_inlines(_read_fixture(), {0x1000}) == {}


def test_parse_inlines_empty_wanted_set_is_noop():
    assert parse_inlines(_read_fixture(), set()) == {}


# --- get_file_url -----------------------------------------------------------


_CONFIG = {"symbol_server_url": "https://symbols.example.com/"}


def test_get_file_url_strips_pdb_and_appends_sym():
    url = get_file_url(("xul.pdb", "ABCDEF"), _CONFIG)
    assert url == "https://symbols.example.com/xul.pdb/ABCDEF/xul.sym"


def test_get_file_url_appends_sym_when_no_pdb_suffix():
    url = get_file_url(("libxul.so", "ABCDEF"), _CONFIG)
    assert url == "https://symbols.example.com/libxul.so/ABCDEF/libxul.so.sym"


def test_get_file_url_returns_none_for_missing_lib_name():
    assert get_file_url((None, "ABCDEF"), _CONFIG) is None


def test_get_file_url_returns_none_for_missing_breakpad_id():
    assert get_file_url(("xul.pdb", None), _CONFIG) is None


# --- process_module ---------------------------------------------------------


def test_process_module_none_module_returns_unsymbolicated():
    result = process_module(None, ["100", "200"], _CONFIG)
    assert all(entry[1] == [(UNSYMBOLICATED, "unknown")] for entry in result)
    assert len(result) == 2


def test_process_module_pseudo_module_returns_offset_as_symbol():
    pseudo = ("pseudo", None)
    result = process_module(pseudo, ["myFrameLabel", None], _CONFIG)
    # For pseudo frames, the symbol IS the offset (or empty string for None).
    assert result[0][1] == [("myFrameLabel", "")]
    assert result[1][1] == [("", "")]


def test_process_module_resolves_offsets_via_fixture(monkeypatch):
    # Stub fetch_url so the test stays offline.
    import symbolication

    fixture_bytes = _read_fixture()
    monkeypatch.setattr(symbolication, "fetch_url", lambda _url: (True, fixture_bytes))

    module = ("testlib.pdb", "ABCDEF0123456789ABCDEF0123456789A")
    offsets = ["1000", "1015", "2000", "ffffffff"]
    result = process_module(module, offsets, _CONFIG)

    # 0x1000 → exact match on FooFunction. Each offset resolves to a list of
    # frames; without inline data that list holds just the one symbol.
    assert result[0][1] == [("FooFunction()", "testlib.pdb")]
    # 0x1015 → between 0x1000 and 0x2000, bisects to FooFunction().
    assert result[1][1] == [("FooFunction()", "testlib.pdb")]
    # 0x2000 → BarFunction.
    assert result[2][1] == [("BarFunction(int)", "testlib.pdb")]
    # 0xffffffff → past everything, bisects to last entry (MultilineSymbol).
    assert result[3][1] == [("MultilineSymbol", "testlib.pdb")]


def test_process_module_expands_inline_frames(monkeypatch):
    import symbolication

    fixture_bytes = _read_fixture()
    monkeypatch.setattr(symbolication, "fetch_url", lambda _url: (True, fixture_bytes))

    module = ("testlib.pdb", "ABCDEF0123456789ABCDEF0123456789A")
    result = dict(process_module(module, ["2500", "2508", "2530"], _CONFIG))

    lib = "testlib.pdb"
    # 0x2500: inside OuterFunc and only the nest-0 inline, outer-first order.
    assert result[(module, "2500")] == [
        ("OuterFunc()", lib),
        ("InlinedOuter()", lib),
    ]
    # 0x2508: inside both inline levels; chain is FUNC -> nest0 -> nest1.
    assert result[(module, "2508")] == [
        ("OuterFunc()", lib),
        ("InlinedOuter()", lib),
        ("InlinedInner()", lib),
    ]
    # 0x2530: inside OuterFunc but outside every inline range -> just the FUNC.
    assert result[(module, "2530")] == [("OuterFunc()", lib)]


def test_process_module_returns_unsymbolicated_when_fetch_fails(monkeypatch):
    import symbolication

    monkeypatch.setattr(symbolication, "fetch_url", lambda _url: (False, ""))

    module = ("missing.pdb", "DEADBEEF")
    result = process_module(module, ["100", "200"], _CONFIG)
    assert all(entry[1] == [(UNSYMBOLICATED, "missing.pdb")] for entry in result)


# --- symbolicate_modules (parallel dispatcher) -----------------------------


def test_symbolicate_modules_empty_input_returns_empty_dict():
    import symbolication

    assert symbolication.symbolicate_modules({}, _CONFIG) == {}


def test_symbolicate_modules_calls_process_module_per_module(monkeypatch):
    import symbolication

    calls = []

    def fake_process_module(module, offsets, config):
        calls.append((module, list(offsets)))
        return [((module, o), [(f"sym-{o}", module[0])]) for o in offsets]

    monkeypatch.setattr(symbolication, "process_module", fake_process_module)

    frames_by_module = {
        ("a.pdb", "1"): ["100"],
        ("b.pdb", "2"): ["200", "300"],
    }
    result = symbolication.symbolicate_modules(frames_by_module, _CONFIG)

    # Both modules dispatched.
    called_modules = {call[0] for call in calls}
    assert called_modules == {("a.pdb", "1"), ("b.pdb", "2")}

    # Every offset shows up in the result with the right symbol mapping.
    assert result[(("a.pdb", "1"), "100")] == [("sym-100", "a.pdb")]
    assert result[(("b.pdb", "2"), "200")] == [("sym-200", "b.pdb")]
    assert result[(("b.pdb", "2"), "300")] == [("sym-300", "b.pdb")]


def test_symbolicate_modules_runs_in_parallel(monkeypatch):
    # If the dispatcher were serial, the barrier would deadlock (only one
    # thread reaches it, never enough parties to release). The timeout
    # turns that into a BrokenBarrierError, which would propagate out of
    # symbolicate_modules and fail the test.
    import threading

    import symbolication

    parties = 3
    barrier = threading.Barrier(parties, timeout=5.0)

    def fake_process_module(module, offsets, config):
        barrier.wait()
        return [((module, o), [(f"sym-{o}", "")]) for o in offsets]

    monkeypatch.setattr(symbolication, "process_module", fake_process_module)

    frames_by_module = {
        ("a.pdb", "1"): ["100"],
        ("b.pdb", "2"): ["200"],
        ("c.pdb", "3"): ["300"],
    }
    result = symbolication.symbolicate_modules(
        frames_by_module, _CONFIG, max_workers=parties
    )
    assert len(result) == 3


def test_symbolicate_modules_propagates_exceptions(monkeypatch):
    import symbolication

    def raises(_module, _offsets, _config):
        raise RuntimeError("simulated symbol-server outage")

    monkeypatch.setattr(symbolication, "process_module", raises)

    try:
        symbolication.symbolicate_modules({("x.pdb", "1"): ["100"]}, _CONFIG)
    except RuntimeError as exc:
        assert "simulated symbol-server outage" in str(exc)
    else:
        raise AssertionError("expected RuntimeError to propagate")


def _module_result(module, offsets, symbolicated):
    # process_module returns a list of frames per offset (one, or more with
    # inline expansion); a fallback is a single (UNSYMBOLICATED, ...) frame.
    frame = ("Sym", module[0]) if symbolicated else (UNSYMBOLICATED, module[0])
    return [((module, o), [frame]) for o in offsets]


def test_symbolicate_modules_counts_unsymbolicated_separately(monkeypatch, capsys):
    import symbolication

    def fake_process_module(module, offsets, config):
        return _module_result(module, offsets, module == ("good.pdb", "1"))

    monkeypatch.setattr(symbolication, "process_module", fake_process_module)
    symbolication.symbolicate_modules(
        {("good.pdb", "1"): ["100"], ("bad.pdb", "2"): ["200"]}, _CONFIG
    )
    out = capsys.readouterr().out
    # The fallback offset is reported as unsymbolicated, not "resolved".
    assert "1 resolved, 1 unsymbolicated" in out


def test_symbolicate_modules_warns_when_mostly_unsymbolicated(monkeypatch, capsys):
    import symbolication

    def fake_process_module(module, offsets, config):
        return _module_result(module, offsets, symbolicated=False)

    monkeypatch.setattr(symbolication, "process_module", fake_process_module)
    symbolication.symbolicate_modules(
        {("a.pdb", "1"): ["1"], ("b.pdb", "2"): ["2"]}, _CONFIG
    )
    assert "WARNING" in capsys.readouterr().out


def test_symbolicate_modules_no_warning_when_mostly_symbolicated(monkeypatch, capsys):
    import symbolication

    def fake_process_module(module, offsets, config):
        return _module_result(module, offsets, symbolicated=True)

    monkeypatch.setattr(symbolication, "process_module", fake_process_module)
    symbolication.symbolicate_modules(
        {("a.pdb", "1"): ["1"], ("b.pdb", "2"): ["2"]}, _CONFIG
    )
    assert "WARNING" not in capsys.readouterr().out


def test_fetch_url_logs_named_exception_on_failure(monkeypatch, capsys):
    import symbolication

    def boom(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(symbolication.urllib.request, "urlopen", boom)
    symbolication._logged_fetch_error_types.clear()

    ok, _body = symbolication.fetch_url("https://symbols.example.com/x.sym")
    assert ok is False
    out = capsys.readouterr().out
    # The swallowed OSError is now named in the log.
    assert "Symbol fetch failed (OSError)" in out
    assert "connection refused" in out


def test_fetch_url_dedups_error_logging_by_type(monkeypatch, capsys):
    import symbolication

    def boom(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(symbolication.urllib.request, "urlopen", boom)
    symbolication._logged_fetch_error_types.clear()

    symbolication.fetch_url("https://symbols.example.com/a.sym")
    symbolication.fetch_url("https://symbols.example.com/b.sym")
    # Same exception type across many failing fetches is logged once, not per URL.
    assert capsys.readouterr().out.count("Symbol fetch failed") == 1


if __name__ == "__main__":
    mozunit.main()
