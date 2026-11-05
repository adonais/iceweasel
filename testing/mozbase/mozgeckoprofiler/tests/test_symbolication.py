#!/usr/bin/env python

import json
from pathlib import Path
from unittest import mock

import mozunit
import pytest
from mozgeckoprofiler import source_path_mapping_args, symbolicate_profile_file

SOURCE_PATH_MAPPINGS = [
    {"urlPrefix": "http://127.0.0.1:62763/", "localPath": "/path/to/benchmark"}
]


def test_source_path_mapping_args_without_mappings():
    with source_path_mapping_args(None) as args:
        assert args == []
    with source_path_mapping_args([]) as args:
        assert args == []


def test_source_path_mapping_args_writes_a_temporary_mapping_file():
    with source_path_mapping_args(SOURCE_PATH_MAPPINGS) as args:
        assert args[0] == "--map-source-paths"
        mapping_path = Path(args[1])
        assert json.loads(mapping_path.read_text()) == {
            "mappings": SOURCE_PATH_MAPPINGS
        }
    assert not mapping_path.exists()


@pytest.fixture
def toolchain_dir(tmp_path, monkeypatch):
    toolchain_dir = tmp_path / "toolchains"
    for tool in [
        Path("node", "node.exe"),
        Path("node", "bin", "node"),
        Path("samply", "samply.exe"),
        Path("samply", "samply"),
        Path("profiler-node-tools", "profiler-edit.js"),
    ]:
        (toolchain_dir / tool).parent.mkdir(parents=True, exist_ok=True)
        (toolchain_dir / tool).touch()
    monkeypatch.delenv("MOZ_AUTOMATION", raising=False)
    monkeypatch.setenv("MOZBUILD_STATE_PATH", str(toolchain_dir))
    return toolchain_dir


@pytest.mark.parametrize(
    "source_path_mappings, expected_mappings",
    [
        (SOURCE_PATH_MAPPINGS, {"mappings": SOURCE_PATH_MAPPINGS}),
        (None, None),
    ],
)
def test_source_path_mappings_are_passed_to_profiler_edit(
    tmp_path, toolchain_dir, source_path_mappings, expected_mappings
):
    in_path = tmp_path / "profile.json"
    in_path.touch()
    out_path = tmp_path / "profile_symbolicated.json"

    profiler_edit_runs = []

    def popen(cmd, **kwargs):
        process = mock.MagicMock()
        if Path(cmd[0]).name.startswith("samply"):
            process.stdout.readline.side_effect = [
                "http://127.0.0.1:3000/?symbolServer=http://127.0.0.1:3000/abc\n",
                "",
            ]
            return process

        mappings = None
        if "--map-source-paths" in cmd:
            mapping_path = Path(cmd[cmd.index("--map-source-paths") + 1])
            mappings = json.loads(mapping_path.read_text())
        profiler_edit_runs.append(mappings)
        Path(cmd[cmd.index("-o") + 1]).touch()
        process.__enter__.return_value = process
        process.stdout = iter([])
        process.returncode = 0
        return process

    with mock.patch(
        "mozgeckoprofiler.symbolication.subprocess.Popen", side_effect=popen
    ):
        assert symbolicate_profile_file(
            in_path,
            out_path,
            symbol_dir=tmp_path,
            source_path_mappings=source_path_mappings,
        )

    assert profiler_edit_runs == [expected_mappings]


if __name__ == "__main__":
    mozunit.main()
