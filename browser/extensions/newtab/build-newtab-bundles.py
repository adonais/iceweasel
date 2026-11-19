# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import hashlib
import os
import subprocess
import tempfile

import buildconfig
from mozbuild.nodeutil import find_node_executable
from mozbuild.util import FileAvoidWrite

HASHED_EXTENSIONS = (".jsx", ".js", ".mjs", ".scss")


def _newtab_dir():
    return os.path.join(buildconfig.topsrcdir, "browser", "extensions", "newtab")


def _node():
    node, _ = find_node_executable(nodejs_exe=buildconfig.substs.get("NODEJS"))
    if not node:
        raise Exception(
            "Node.js is required to build newtab bundles. "
            "Ensure node is in PATH or set NODEJS in your environment."
        )
    return node


def _node_modules():
    node_modules = os.path.join(
        buildconfig.topsrcdir, "third_party", "node", "node_modules"
    )
    if not os.path.isdir(node_modules):
        raise Exception(
            "The vendored node packages under third_party/node are missing. "
            "Run `./mach vendor node`, or check out third_party/node."
        )
    return node_modules


def _deps_record(objdir):
    return os.path.join(objdir, "webpack-deps.txt")


def _reported_inputs(objdir):
    """Files webpack read during the previous build. The FasterMake backend
    ignores the dependency files an action returns, so hashing these is what
    makes a change to one of them rebuild the bundles."""
    record = _deps_record(objdir)
    if not os.path.exists(record):
        return set()
    with open(record, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


def _declared_inputs(newtab_dir):
    inputs = {
        os.path.abspath(__file__),
        os.path.join(newtab_dir, "package.json"),
        os.path.join(newtab_dir, "webpack.system-addon.config.js"),
        os.path.join(buildconfig.topsrcdir, "browser", "tools", "mozsrcUriPlugin.js"),
        os.path.join(buildconfig.topsrcdir, "browser", "tools", "resourceUriPlugin.js"),
        os.path.join(buildconfig.topsrcdir, "browser", "modules", "Dedupe.sys.mjs"),
        os.path.join(
            buildconfig.topsrcdir, "third_party", "node", "vendor-inputs.hash"
        ),
    }
    for directory in (
        os.path.join(newtab_dir, "content-src"),
        os.path.join(newtab_dir, "common"),
        os.path.join(buildconfig.topsrcdir, "browser", "components", "topsites"),
    ):
        for root, dirs, files in os.walk(directory):
            dirs.sort()
            inputs.update(
                os.path.join(root, f) for f in files if f.endswith(HASHED_EXTENSIONS)
            )
    return inputs


def _hash_sources(inputs):
    hasher = hashlib.sha256()
    for path in sorted(inputs):
        if not os.path.isfile(path):
            continue
        hasher.update(path.encode("utf-8"))
        with open(path, "rb") as f:
            hasher.update(f.read())
    return hasher.hexdigest()


def _is_up_to_date(hash_file, digest, outputs):
    """The bundles are forced in moz.build so that Make doesn't wait on a
    separate stamp before starting them; this is what skips running webpack
    and sass when the sources haven't changed."""
    if not all(os.path.exists(path) for path in outputs):
        return False
    try:
        with open(hash_file, encoding="utf-8") as f:
            return f.read() == digest
    except FileNotFoundError:
        return False


def _reuse_output(output):
    with open(output.name, "rb") as f:
        output.write(f.read())


def _write_hash(hash_file, digest):
    with FileAvoidWrite(hash_file) as f:
        f.write(digest)


def _record_reported_inputs(objdir, deps_file):
    if not os.path.exists(deps_file):
        return
    with open(deps_file, encoding="utf-8") as f:
        reported = sorted({line.strip() for line in f if line.strip()})
    kept = [path for path in reported if os.path.isfile(path)]
    with FileAvoidWrite(_deps_record(objdir)) as record:
        for path in kept:
            record.write(path + "\n")


def _run(argv, newtab_dir, node_modules, extra_env=None):
    env = dict(os.environ)
    env["MOZ_NODE_MODULES"] = node_modules
    env["WEBPACK_CLI_SKIP_IMPORT_LOCAL"] = "1"
    env.update(extra_env or {})
    result = subprocess.run(argv, check=False, cwd=newtab_dir, env=env)
    if result.returncode != 0:
        raise Exception(f"{argv[1]} failed with exit code {result.returncode}")


def generate_js(output):
    newtab_dir = _newtab_dir()
    content_dir = os.path.dirname(output.name)
    as_path = os.path.join(content_dir, "activity-stream.bundle.js")
    objdir = os.path.dirname(os.path.dirname(content_dir))

    hash_file = os.path.join(objdir, "newtab-js.hash")
    declared = _declared_inputs(newtab_dir)
    reported = _reported_inputs(objdir)
    digest = _hash_sources(declared | reported)
    if _is_up_to_date(hash_file, digest, (output.name, as_path)):
        _reuse_output(output)
        return

    node_modules = _node_modules()
    webpack = os.path.join(node_modules, "webpack", "bin", "webpack.js")

    with tempfile.TemporaryDirectory() as tmpdir:
        deps_file = os.path.join(tmpdir, "webpack-deps.txt")
        _run(
            [
                _node(),
                webpack,
                "--config",
                os.path.join(newtab_dir, "webpack.system-addon.config.js"),
                "--env",
                "outputPath=" + tmpdir,
            ],
            newtab_dir,
            node_modules,
            extra_env={"MOZ_WEBPACK_DEPS": deps_file},
        )

        with open(os.path.join(tmpdir, "vendor.bundle.js"), "rb") as f:
            output.write(f.read())

        with FileAvoidWrite(as_path, readmode="rb") as as_output:
            with open(os.path.join(tmpdir, "activity-stream.bundle.js"), "rb") as f:
                as_output.write(f.read())

        _record_reported_inputs(objdir, deps_file)

    # The set of reported inputs is only known after webpack ran, so on a
    # first build or when it changed, hash it now rather than have the next
    # build see a different hash and run webpack again.
    new_reported = _reported_inputs(objdir)
    if new_reported != reported:
        digest = _hash_sources(declared | new_reported)
    _write_hash(hash_file, digest)


def generate_css(output):
    newtab_dir = _newtab_dir()
    css_dir = os.path.dirname(output.name)
    nova_css_path = os.path.join(css_dir, "nova", "activity-stream.css")

    hash_file = os.path.join(os.path.dirname(css_dir), "newtab-css.hash")
    digest = _hash_sources(_declared_inputs(newtab_dir))
    if _is_up_to_date(hash_file, digest, (output.name, nova_css_path)):
        _reuse_output(output)
        return

    node_modules = _node_modules()
    sass = os.path.join(node_modules, "sass", "sass.js")

    src_styles_dir = os.path.join(newtab_dir, "content-src", "styles")

    with tempfile.TemporaryDirectory() as tmpdir:
        _run(
            [
                _node(),
                sass,
                src_styles_dir + ":" + tmpdir,
                "--no-source-map",
            ],
            newtab_dir,
            node_modules,
        )

        with open(os.path.join(tmpdir, "activity-stream.css"), "rb") as f:
            output.write(f.read())

        os.makedirs(os.path.dirname(nova_css_path), exist_ok=True)
        with FileAvoidWrite(nova_css_path, readmode="rb") as nova_output:
            with open(os.path.join(tmpdir, "nova", "activity-stream.css"), "rb") as f:
                nova_output.write(f.read())

    _write_hash(hash_file, digest)
