# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
from unittest import mock

import pytest
from mozunit import main

import mozbuild.bootstrap
from mozbuild.vendor import vendor_node
from mozbuild.vendor.vendor_node import VendorNode, hash_inputs


class FakeVendorNode(VendorNode):
    def __init__(self, topsrcdir=None, changed_files=()):
        self.topsrcdir = str(topsrcdir) if topsrcdir else None
        self.populate_logger()
        self._fake_repository = mock.Mock()
        self._fake_repository.get_changed_files.return_value = list(changed_files)

    @property
    def repository(self):
        return self._fake_repository


def write(path, content="content"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


PNPM = "/toolchains/pnpm/bin/pnpm.cjs"


def test_prune_keeps_code_and_license_text(tmp_path):
    package = tmp_path / "node_modules" / "sample"
    write(package / "package.json", "{}")
    write(package / "index.js")
    write(package / "LICENSE.md")
    write(package / "NOTICE.markdown")
    write(package / "README.md")
    write(package / "CHANGELOG.md")
    write(package / "index.js.map")
    write(package / "index.d.ts")
    write(package / "sample.development.js")
    write(package / "sample.profiling.js")
    write(package / "test" / "index.test.js")
    write(package / "docs" / "usage.html")

    vendor_node._prune(tmp_path / "node_modules")

    assert (package / "index.js").exists()
    assert (package / "LICENSE.md").exists()
    assert (package / "NOTICE.markdown").exists()
    assert not (package / "README.md").exists()
    assert not (package / "CHANGELOG.md").exists()
    assert not (package / "index.js.map").exists()
    assert not (package / "index.d.ts").exists()
    assert not (package / "sample.development.js").exists()
    assert not (package / "sample.profiling.js").exists()
    assert not (package / "test").exists()
    assert not (package / "docs").exists()


def test_prune_keeps_readme_when_a_package_has_no_license_text(tmp_path):
    with_license = tmp_path / "node_modules" / "with-license"
    write(with_license / "package.json", "{}")
    write(with_license / "LICENSE")
    write(with_license / "README.md")

    without_license = tmp_path / "node_modules" / "without-license"
    write(without_license / "package.json", "{}")
    write(without_license / "README.md")

    unpackaged = with_license / "lib"
    write(unpackaged / "README.md")

    vendor_node._prune(tmp_path / "node_modules")

    assert not (with_license / "README.md").exists()
    assert (without_license / "README.md").exists()
    assert not (unpackaged / "README.md").exists()


def test_prune_keeps_a_package_named_after_a_pruned_directory(tmp_path):
    node_modules = tmp_path / "node_modules"
    package = node_modules / "test"
    write(package / "package.json", "{}")
    write(package / "index.js")
    scoped = node_modules / "@scope" / "docs"
    write(scoped / "package.json", "{}")
    write(scoped / "index.js")
    write(node_modules / "sample" / "package.json", "{}")
    write(node_modules / "sample" / "test" / "index.test.js")
    write(node_modules / "sample" / "benchmark" / "package.json", "{}")
    write(node_modules / "sample" / "benchmark" / "run.mjs")

    vendor_node._prune(node_modules)

    assert (package / "index.js").exists()
    assert (scoped / "index.js").exists()
    assert not (node_modules / "sample" / "test").exists()
    assert not (node_modules / "sample" / "benchmark").exists()


def test_prune_removes_platform_restricted_packages(tmp_path):
    node_modules = tmp_path / "node_modules"
    write(node_modules / "fsevents" / "package.json", '{"os": ["darwin"]}')
    write(node_modules / "fsevents" / "fsevents.node")
    write(node_modules / "@scope" / "arm-only" / "package.json", '{"cpu": ["arm64"]}')
    write(node_modules / "musl-only" / "package.json", '{"libc": ["musl"]}')
    write(node_modules / "webpack" / "package.json", '{"name": "webpack"}')
    write(node_modules / "webpack" / "lib" / "index.js")

    vendor_node._prune(node_modules)

    assert not (node_modules / "fsevents").exists()
    assert not (node_modules / "@scope" / "arm-only").exists()
    assert not (node_modules / "musl-only").exists()
    assert (node_modules / "webpack" / "lib" / "index.js").exists()


def test_prune_removes_bin_directories_at_every_level(tmp_path):
    node_modules = tmp_path / "node_modules"
    write(node_modules / ".bin" / "webpack")
    write(node_modules / "loader-utils" / "package.json", "{}")
    write(node_modules / "loader-utils" / "node_modules" / ".bin" / "json5.CMD")

    vendor_node._prune(node_modules)

    assert not (node_modules / ".bin").exists()
    assert not (node_modules / "loader-utils" / "node_modules" / ".bin").exists()


def test_prune_removes_bookkeeping_and_type_packages(tmp_path):
    node_modules = tmp_path / "node_modules"
    write(node_modules / ".modules.yaml")
    write(node_modules / ".pnpm" / "lock.yaml")
    write(node_modules / "@types" / "node" / "index.d.ts")
    write(node_modules / "csstype" / "index.js")
    write(node_modules / "webpack" / "package.json", "{}")

    vendor_node._prune(node_modules)

    assert not (node_modules / ".modules.yaml").exists()
    assert not (node_modules / ".pnpm").exists()
    assert not (node_modules / "@types").exists()
    assert not (node_modules / "csstype").exists()
    assert (node_modules / "webpack" / "package.json").exists()


@pytest.mark.skipif(os.name == "nt", reason="Windows has no executable bit")
def test_normalize_modes_drops_the_executable_bit(tmp_path):
    node_modules = tmp_path / "node_modules"
    script = write(node_modules / "acorn" / "bin" / "acorn")
    plain = write(node_modules / "acorn" / "index.js")
    script.chmod(0o755)
    plain.chmod(0o644)

    assert vendor_node._normalize_modes(node_modules) == 1
    assert script.stat().st_mode & 0o111 == 0
    assert plain.stat().st_mode & 0o777 == 0o644


def test_prune_reports_what_it_removed(tmp_path):
    package = tmp_path / "node_modules" / "sample"
    write(package / "package.json", "{}")
    write(package / "LICENSE")
    write(package / "CHANGELOG.md", "0123456789")

    pruned_files, pruned_bytes = vendor_node._prune(tmp_path / "node_modules")

    assert pruned_files == 1
    assert pruned_bytes == 10


@pytest.fixture
def vendor_tree(tmp_path, monkeypatch):
    vendor_dir = tmp_path / "third_party" / "node"
    lock_file = write(vendor_dir / "pnpm-lock.yaml", "lockfileVersion: 9.0\n")
    write(vendor_dir / "node_modules" / "sample" / "index.js")
    write(
        vendor_dir / "package.json",
        '{"devDependencies": {"webpack": "5.89.0"}}',
    )
    write(
        tmp_path / "browser" / "extensions" / "newtab" / "package.json",
        '{"devDependencies": {"webpack": "5.89.0", "jest": "29.7.0"}}',
    )

    monkeypatch.setattr(
        mozbuild.bootstrap, "bootstrap_toolchain", lambda toolchain: PNPM
    )
    monkeypatch.setattr(vendor_node, "find_node_executable", lambda: ("node", None))

    return vendor_dir, lock_file


def test_vendor_runs_the_bootstrapped_pnpm(tmp_path, monkeypatch, vendor_tree):
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    assert FakeVendorNode(topsrcdir=tmp_path).vendor() == 0
    assert check_call.call_args_list[0].args[0][:2] == ["node", PNPM]


def test_vendor_fails_without_pnpm(tmp_path, monkeypatch, vendor_tree):
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)
    monkeypatch.setattr(
        mozbuild.bootstrap, "bootstrap_toolchain", lambda toolchain: None
    )

    assert FakeVendorNode(topsrcdir=tmp_path).vendor() == 1
    check_call.assert_not_called()


def test_vendor_keeps_the_lock_file_without_force(tmp_path, monkeypatch, vendor_tree):
    vendor_dir, lock_file = vendor_tree
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    vendor = FakeVendorNode(topsrcdir=tmp_path)

    assert vendor.vendor() == 0
    assert lock_file.exists()
    assert "--lockfile-only" in check_call.call_args_list[0].args[0]


def test_vendor_discards_the_lock_file_with_force(tmp_path, monkeypatch, vendor_tree):
    vendor_dir, lock_file = vendor_tree
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    vendor = FakeVendorNode(topsrcdir=tmp_path)

    assert vendor.vendor(force=True) == 0
    assert not lock_file.exists()
    assert "--lockfile-only" in check_call.call_args_list[0].args[0]


def test_vendor_installs_when_the_tree_is_missing(tmp_path, monkeypatch, vendor_tree):
    vendor_dir, _ = vendor_tree
    hash_file = vendor_dir / "vendor-inputs.hash"
    hash_file.write_text(f"{hash_inputs(vendor_dir)}\n", encoding="utf-8")
    shutil.rmtree(vendor_dir / "node_modules")
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    vendor = FakeVendorNode(topsrcdir=tmp_path)

    assert vendor.vendor() == 0
    assert "--frozen-lockfile" in check_call.call_args_list[1].args[0]
    vendor._fake_repository.add_remove_files.assert_called_once()


def test_vendor_installs_and_records_the_lock_file_hash(
    tmp_path, monkeypatch, vendor_tree
):
    vendor_dir, lock_file = vendor_tree
    hash_file = vendor_dir / "vendor-inputs.hash"
    hash_file.write_text(f"{hash_inputs(vendor_dir)}\n", encoding="utf-8")
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    vendor = FakeVendorNode(topsrcdir=tmp_path)

    assert vendor.vendor(force=True) == 0
    assert "--lockfile-only" in check_call.call_args_list[0].args[0]
    assert "--frozen-lockfile" in check_call.call_args_list[1].args[0]
    assert not (vendor_dir / "node_modules").exists()
    assert hash_file.read_bytes() == f"{hash_inputs(vendor_dir)}\n".encode()
    vendor._fake_repository.add_remove_files.assert_called_once()


def test_hash_inputs_covers_the_workspace_settings(tmp_path):
    vendor_dir = tmp_path / "third_party" / "node"
    write(vendor_dir / "package.json", "{}")
    write(vendor_dir / "pnpm-lock.yaml", "lockfileVersion: 9.0")
    settings = write(vendor_dir / "pnpm-workspace.yaml", "nodeLinker: hoisted")

    before = hash_inputs(vendor_dir)
    settings.write_text("nodeLinker: isolated", encoding="utf-8")

    assert hash_inputs(vendor_dir) != before


def test_vendor_refuses_a_pnpm_the_manifest_does_not_ask_for(
    tmp_path, monkeypatch, vendor_tree
):
    vendor_dir, _ = vendor_tree
    write(
        vendor_dir / "package.json",
        '{"packageManager": "pnpm@11.22.0", "devDependencies": {}}',
    )
    monkeypatch.setattr(
        vendor_node.subprocess, "check_output", lambda *args, **kwargs: "11.0.0\n"
    )
    monkeypatch.setattr(
        vendor_node.subprocess,
        "check_call",
        mock.Mock(side_effect=AssertionError("pnpm should not install")),
    )

    assert FakeVendorNode(topsrcdir=tmp_path).vendor(force=True) == 1


def test_vendor_accepts_the_pnpm_the_manifest_asks_for(
    tmp_path, monkeypatch, vendor_tree
):
    vendor_dir, _ = vendor_tree
    write(
        vendor_dir / "package.json",
        '{"packageManager": "pnpm@11.22.0", "devDependencies": {}}',
    )
    monkeypatch.setattr(
        vendor_node.subprocess, "check_output", lambda *args, **kwargs: "11.22.0\n"
    )
    monkeypatch.setattr(vendor_node.subprocess, "check_call", mock.Mock())

    assert FakeVendorNode(topsrcdir=tmp_path).vendor(force=True) == 0


def test_vendor_refuses_to_run_when_a_consumer_wants_another_version(
    tmp_path, monkeypatch, vendor_tree
):
    write(
        tmp_path / "browser" / "extensions" / "newtab" / "package.json",
        '{"devDependencies": {"webpack": "5.90.0"}}',
    )
    monkeypatch.setattr(
        vendor_node.subprocess,
        "check_call",
        mock.Mock(side_effect=AssertionError("pnpm should not run")),
    )

    assert FakeVendorNode(topsrcdir=tmp_path).vendor(force=True) == 1


def test_vendor_fails_when_a_consumer_manifest_is_missing(
    tmp_path, monkeypatch, vendor_tree
):
    (tmp_path / "browser" / "extensions" / "newtab" / "package.json").unlink()
    monkeypatch.setattr(
        vendor_node.subprocess,
        "check_call",
        mock.Mock(side_effect=AssertionError("pnpm should not run")),
    )

    assert FakeVendorNode(topsrcdir=tmp_path).vendor(force=True) == 1


def test_vendor_keeps_the_lockfile_when_resolving_fails(
    tmp_path, monkeypatch, vendor_tree
):
    vendor_dir, lock_file = vendor_tree

    def check_call(argv, cwd=None):
        raise vendor_node.subprocess.CalledProcessError(7, argv)

    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    assert FakeVendorNode(topsrcdir=tmp_path).vendor() == 7
    assert lock_file.exists()


def test_vendor_reports_a_failed_install(tmp_path, monkeypatch, vendor_tree):
    vendor_dir, _ = vendor_tree

    def check_call(argv, cwd=None):
        if "--frozen-lockfile" in argv:
            raise vendor_node.subprocess.CalledProcessError(9, argv)

    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    assert FakeVendorNode(topsrcdir=tmp_path).vendor() == 9
    assert not (vendor_dir / "vendor-inputs.hash").exists()


def test_vendor_add_pins_an_exact_version(tmp_path, monkeypatch, vendor_tree):
    check_call = mock.Mock()
    monkeypatch.setattr(vendor_node.subprocess, "check_call", check_call)

    FakeVendorNode(topsrcdir=tmp_path).vendor(add=["webpack@5.109.0"])

    argv = check_call.call_args_list[0].args[0]
    assert "add" in argv
    assert "--save-exact" in argv
    assert argv[-1] == "webpack@5.109.0"


def test_vendor_refuses_to_run_over_local_changes(tmp_path, vendor_tree):
    vendor = FakeVendorNode(
        topsrcdir=tmp_path, changed_files=["third_party/node/package.json"]
    )

    assert vendor.vendor() == 1


if __name__ == "__main__":
    main()
