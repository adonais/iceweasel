# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import hashlib
import logging
import os
import shutil
import stat
import subprocess
from pathlib import Path

from mozfile import json

from mozbuild.base import MozbuildObject
from mozbuild.nodeutil import find_node_executable

# Consumer manifests whose pins must match third_party/node/package.json.
CONSUMER_MANIFESTS = ("browser/extensions/newtab/package.json",)

PRUNED_DIRECTORIES = {
    # Shims pnpm writes for package binaries. They differ per platform and hold
    # absolute paths, and the build runs the tools by their JS entry points.
    ".bin",
    # Upstream CI configuration.
    ".github",
    # Test suites and benchmarks.
    "__tests__",
    "benchmark",
    "benchmarks",
    "test",
    "tests",
    # Coverage reports left in published packages.
    "coverage",
    # Documentation and examples.
    "doc",
    "docs",
    "example",
    "examples",
}

PRUNED_SUFFIXES = {
    # Changelogs and other prose. A README is kept where it is the only license
    # text a package has, see KEPT_NAME_PREFIXES.
    ".markdown",
    ".md",
    # Upstream source maps, which we don't bundle.
    ".map",
}

# Type declarations. Nothing type checks the vendored tree.
PRUNED_NAME_SUFFIXES = {".d.ts"}

# Packages that only carry type declarations.
PRUNED_PACKAGES = {"@types", "csstype", "undici-types"}

# React and Redux ship development and profiling builds beside the production
# one, and the bundles are built with NODE_ENV set to production.
PRUNED_NAME_PARTS = {".development.", ".profiling."}

# License text has to ship with the code it covers, whatever the file is named.
KEPT_NAME_PREFIXES = ("copying", "licence", "license", "notice")

EXECUTABLE_BITS = stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH

PNPM_ISOLATION = ["--ignore-scripts", "--ignore-pnpmfile"]

PRUNED_TOPLEVEL = {
    # pnpm bookkeeping for the local install. .pnpm-workspace-state-v1.json
    # records a timestamp, so keeping it would make every re-vendor a diff.
    ".modules.yaml",
    ".package-map.json",
    ".pnpm",
    ".pnpm-workspace-state-v1.json",
}


VENDOR_INPUTS = ("package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml")


def hash_inputs(vendor_dir):
    hasher = hashlib.sha256()
    for name in VENDOR_INPUTS:
        path = vendor_dir / name
        if path.exists():
            hasher.update(path.read_bytes())
    return hasher.hexdigest()


class VendorNode(MozbuildObject):
    def vendor(self, add=None, remove=None, force=False, ignore_modified=False):
        vendor_dir = Path(self.topsrcdir) / "third_party" / "node"
        hash_file = vendor_dir / "vendor-inputs.hash"
        node_modules = vendor_dir / "node_modules"

        if not ignore_modified:
            modified = sorted(
                p
                for p in self.repository.get_changed_files("ADM")
                if p.replace(os.sep, "/").startswith("third_party/node/")
            )
            if modified:
                self.log(
                    logging.ERROR,
                    "modified_files",
                    {},
                    """You have uncommitted changes to the following files:

{files}

Please commit or stash these changes before vendoring, or re-run with `--ignore-modified`.
""".format(files="\n".join(modified)),
                )
                return 1

        node, _ = find_node_executable()
        if not node:
            self.log(
                logging.ERROR,
                "node_missing",
                {},
                "Could not find a node executable. Run `mach bootstrap`.",
            )
            return 1

        from mozbuild.bootstrap import bootstrap_toolchain

        pnpm = bootstrap_toolchain("pnpm/bin/pnpm.cjs")
        if not pnpm:
            self.log(
                logging.ERROR,
                "pnpm_missing",
                {},
                "Could not find or bootstrap pnpm.",
            )
            return 1

        expected_version = _expected_pnpm_version(vendor_dir)
        if expected_version:
            found_version = _pnpm_version(node, pnpm)
            if found_version != expected_version:
                self.log(
                    logging.ERROR,
                    "pnpm_version",
                    {},
                    f"third_party/node/package.json asks for pnpm "
                    f"{expected_version}, but {pnpm} is {found_version}.",
                )
                return 1

        for package in add or []:
            subprocess.check_call(
                [node, pnpm, "add", "--save-exact"] + PNPM_ISOLATION + [package],
                cwd=vendor_dir,
            )
        for package in remove or []:
            subprocess.check_call(
                [node, pnpm, "remove"] + PNPM_ISOLATION + [package], cwd=vendor_dir
            )

        missing = [
            manifest
            for manifest in CONSUMER_MANIFESTS
            if not (Path(self.topsrcdir) / manifest).exists()
        ]
        if missing:
            self.log(
                logging.ERROR,
                "consumer_missing",
                {},
                "Consumer manifests listed in CONSUMER_MANIFESTS do not exist:\n"
                + "\n".join(f"  {manifest}" for manifest in missing),
            )
            return 1

        mismatches = self._consumer_mismatches(vendor_dir)
        if mismatches:
            lines = "\n".join(
                f"  {manifest}: {package} {wanted}, vendored {vendored}"
                for manifest, package, vendored, wanted in mismatches
            )
            self.log(
                logging.ERROR,
                "consumer_mismatch",
                {},
                f"Versions in third_party/node/package.json disagree with:\n{lines}",
            )
            return 1

        install_flags = PNPM_ISOLATION + [
            "--node-linker=hoisted",
            "--config.confirmModulesPurge=false",
        ]

        lock_file = vendor_dir / "pnpm-lock.yaml"
        if force and lock_file.exists():
            lock_file.unlink()

        resolve = [node, pnpm, "install", "--lockfile-only"] + install_flags
        try:
            subprocess.check_call(resolve, cwd=vendor_dir)
        except subprocess.CalledProcessError as e:
            # A policy in pnpm-workspace.yaml can reject versions the lockfile
            # already pins, which only resolving them again can satisfy.
            self.log(
                logging.ERROR,
                "resolve_failed",
                {},
                "pnpm could not resolve the lock file as it stands. If a policy "
                "in pnpm-workspace.yaml rejects a version it pins, re-run with "
                "--force to resolve from scratch.",
            )
            return e.returncode

        new_hash = hash_inputs(vendor_dir)

        # Pruning removes pnpm's bookkeeping, so it cannot tell what a previous
        # vendor installed. Install into an empty tree to keep the result a
        # function of the lockfile alone.
        if node_modules.exists():
            shutil.rmtree(node_modules)

        try:
            subprocess.check_call(
                [node, pnpm, "install", "--frozen-lockfile"] + install_flags,
                cwd=vendor_dir,
            )
        except subprocess.CalledProcessError as e:
            self.log(
                logging.ERROR,
                "install_failed",
                {},
                "pnpm could not install from the lock file. third_party/node/"
                "node_modules was removed first, restore it from version control.",
            )
            return e.returncode

        pruned_files, pruned_bytes = _prune(node_modules)
        print(f"Pruned {pruned_files} files ({pruned_bytes / 1024**2:.1f} MiB).")

        normalized = _normalize_modes(node_modules)
        print(f"Dropped the executable bit from {normalized} files.")

        kept_files, kept_bytes = _measure(node_modules)
        print(f"Vendored {kept_files} files ({kept_bytes / 1024**2:.1f} MiB).")

        hash_file.write_text(f"{new_hash}\n", newline="\n")
        self.repository.add_remove_files(vendor_dir)
        return 0

    def _consumer_mismatches(self, vendor_dir):
        # There is one consumer today, so its pins are checked against the
        # vendored manifest. With several, third_party/node should become a pnpm
        # workspace with the consumers as its packages, which needs them to
        # separate build from test dependencies first.
        vendored = _package_versions(vendor_dir / "package.json")
        mismatches = []
        for manifest in CONSUMER_MANIFESTS:
            path = Path(self.topsrcdir) / manifest
            for package, wanted in _package_versions(path).items():
                if package in vendored and vendored[package] != wanted:
                    mismatches.append((manifest, package, vendored[package], wanted))
        return mismatches


def _expected_pnpm_version(vendor_dir):
    manifest = json.loads((vendor_dir / "package.json").read_text(encoding="utf-8"))
    name, _, version = (manifest.get("packageManager") or "").partition("@")
    return version if name == "pnpm" else None


def _pnpm_version(node, pnpm):
    return subprocess.check_output([node, pnpm, "--version"], text=True).strip()


def _prune(node_modules):
    removed = []

    for name in PRUNED_TOPLEVEL | PRUNED_PACKAGES:
        path = node_modules / name
        if path.exists():
            removed.append(_remove(path))

    for root, dirs, files in os.walk(node_modules, topdown=True):
        for name in list(dirs):
            path = Path(root) / name
            if _is_package_root(path):
                if not _is_platform_restricted(path):
                    continue
            elif name not in PRUNED_DIRECTORIES:
                continue
            removed.append(_remove(path))
            dirs.remove(name)
        keep_readme = "package.json" in files and not any(
            name.lower().startswith(KEPT_NAME_PREFIXES) for name in files
        )
        for name in files:
            path = Path(root) / name
            if _is_pruned_file(path, keep_readme):
                removed.append(_remove(path))

    return sum(files for files, _ in removed), sum(size for _, size in removed)


def _package_versions(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    versions = {}
    for field in ("dependencies", "devDependencies"):
        versions.update(manifest.get(field) or {})
    return versions


def _is_platform_restricted(path):
    """A package declaring `os`, `cpu` or `libc` is installed on some platforms
    and not others, so vendoring it would make the tree depend on where it was
    vendored."""
    manifest = path / "package.json"
    if not manifest.is_file():
        return False
    declared = json.loads(manifest.read_text(encoding="utf-8"))
    return any(declared.get(field) for field in ("os", "cpu", "libc"))


def _is_package_root(path):
    if path.name.startswith("."):
        return False
    parent = path.parent
    if parent.name.startswith("@"):
        parent = parent.parent
    return parent.name == "node_modules"


def _is_pruned_file(path, keep_readme):
    lowered = path.name.lower()
    if lowered.startswith(KEPT_NAME_PREFIXES):
        return False
    if keep_readme and lowered.startswith("readme"):
        return False
    if path.suffix.lower() in PRUNED_SUFFIXES:
        return True
    if any(lowered.endswith(suffix) for suffix in PRUNED_NAME_SUFFIXES):
        return True
    return any(part in lowered for part in PRUNED_NAME_PARTS)


def _normalize_modes(node_modules):
    """npm publishes some packages with the executable bit set, and pnpm keeps
    it. A Windows checkout cannot carry that bit, so leaving it makes the
    vendored tree differ by host rather than by content."""
    normalized = 0
    for root, _dirs, names in os.walk(node_modules):
        for name in names:
            path = Path(root) / name
            mode = path.stat().st_mode
            wanted = mode & ~EXECUTABLE_BITS
            if wanted != mode:
                path.chmod(wanted)
                normalized += 1
    return normalized


def _remove(path):
    if path.is_dir():
        files, size = _measure(path)
        shutil.rmtree(path)
        return files, size
    size = path.stat().st_size
    path.unlink()
    return 1, size


def _measure(path):
    files = total = 0
    for root, _dirs, names in os.walk(path):
        for name in names:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
            files += 1
    return files, total
