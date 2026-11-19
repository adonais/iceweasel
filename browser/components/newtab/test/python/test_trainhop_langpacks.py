# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Startup smoke test for the trainhop newtab integration layer.

Regression test for bug 2049845: an AboutNewTabResourceMapping observer
cascade that explodes memory when a trainhop newtab XPI is registered while
many langpacks are active. See
browser/extensions/newtab/docs/v2-system-addon/trainhop-langpack-smoke.md.

The test generates a minimal langpack for every locale in
browser/locales/shipped-locales (what an MSIX/Snap/Flatpak bundles), so it
reproduces the same scale on every project regardless of which locales a
given build was repacked with. It installs them into a Marionette-driven
Firefox, then calls AboutNewTabResourceMapping.registerFluentSources()
against a minimal trainhop XPI that, like the shipped one, supports every
shipped locale, while sampling peak RSS of the Firefox process tree.
"""

import json
import os
import threading
import time
import zipfile
from pathlib import Path

import mozunit
import psutil
import pytest
from marionette_driver.addons import Addons
from marionette_driver.marionette import Marionette
from moztest.selftest.fixtures import binary_fixture  # noqa: F401

TOPSRCDIR = Path(__file__).resolve().parents[5]

SHIPPED_LOCALES = [
    locale
    for locale in (TOPSRCDIR / "browser" / "locales" / "shipped-locales")
    .read_text(encoding="utf-8")
    .split()
    if locale != "en-US"
]
# RSS growth during registerFluentSources is the pass/fail signal. Without
# the fix the cascade grows without bound; with it growth is a few MiB.
MAX_GROWTH_MIB = 300
CASCADE_WINDOW_SECONDS = 30

PREFS = {
    "intl.locale.requested": "en-US",
    # Activate every installed langpack, not just the OS-locale match.
    "intl.multilingual.enabled": True,
    "extensions.langpacks.signatures.required": False,
    "browser.newtabpage.resource-mapping.log": True,
}

REGISTER_SCRIPT = """
const [xpiPath, resolve] = arguments;
const { AboutNewTabResourceMapping } = ChromeUtils.importESModule(
  "resource:///modules/AboutNewTabResourceMapping.sys.mjs"
);
const { Langpack } = ChromeUtils.importESModule(
  "resource://gre/modules/Extension.sys.mjs"
);
const file = new FileUtils.File(xpiPath);
const rootURI = Services.io.newURI(
  `jar:${Services.io.newFileURI(file).spec}!/`
);
const activeLangpacks = Langpack.activeLangpackIds.size;
AboutNewTabResourceMapping.registerFluentSources(rootURI).then(
  () => resolve({ activeLangpacks }),
  e => resolve({ activeLangpacks, error: String(e) })
);
"""


def log(msg):
    print(f"[trainhop-smoke] {msg}", flush=True)


def build_trainhop_xpi(out_xpi):
    """A minimal trainhop newtab XPI with the parts registerFluentSources
    reads, laid out as browser/extensions/newtab/webext-glue/moz.build
    packages them for a shipped train-hop build."""
    manifest_path = TOPSRCDIR / "browser" / "extensions" / "newtab" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = "999.0.0"
    newtab_ftl = TOPSRCDIR / "browser" / "locales" / "en-US" / "browser" / "newtab"
    with zipfile.ZipFile(out_xpi, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(
            "locales/supported-locales.json", json.dumps(["en-US"] + SHIPPED_LOCALES)
        )
        zf.write(newtab_ftl / "newtab.ftl", "locales/en-US/browser/newtab/newtab.ftl")


def build_langpacks(out_dir, locales, app_version):
    """Generate a minimal langpack for each locale. Returns their paths."""
    paths = []
    for locale in locales:
        manifest = {
            "manifest_version": 2,
            "name": f"Language: {locale}",
            "version": app_version.split("a")[0] + ".20260101",
            "langpack_id": locale,
            "browser_specific_settings": {
                "gecko": {
                    "id": f"langpack-{locale}@firefox.mozilla.org",
                    "strict_min_version": app_version,
                    "strict_max_version": app_version,
                }
            },
            "languages": {locale: {"version": "1", "chrome_resources": {}}},
            "sources": {"browser": {"base_path": "browser/"}},
        }
        path = out_dir / f"{locale}.xpi"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr(f"localization/{locale}/test.ftl", "test = Test\n")
            zf.writestr(f"browser/localization/{locale}/test.ftl", "test = Test\n")
        paths.append(path)
    return paths


def tree_rss_mib(proc):
    rss = proc.memory_info().rss
    for child in proc.children(recursive=True):
        try:
            rss += child.memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return rss / (1024 * 1024)


@pytest.fixture
def marionette(binary, tmp_path):
    if not binary:
        if os.environ.get("MOZ_AUTOMATION"):
            pytest.fail("No Firefox binary; is GECKO_BINARY_PATH set?")
        pytest.skip("No Firefox build available")
    client = Marionette(
        bin=binary,
        headless=True,
        prefs=PREFS,
        gecko_log=str(tmp_path / "gecko.log"),
    )
    client.start_session()
    yield client
    client.cleanup()


def test_registerFluentSources_with_many_langpacks(marionette, tmp_path):
    app_version = marionette.session_capabilities["browserVersion"]
    addons = Addons(marionette)
    for path in build_langpacks(tmp_path, SHIPPED_LOCALES, app_version):
        addons.install(str(path), temp=True)

    xpi_path = tmp_path / "trainhop-newtab.xpi"
    build_trainhop_xpi(xpi_path)

    proc = psutil.Process(marionette.session_capabilities["moz:processID"])
    baseline = tree_rss_mib(proc)
    log(f"Baseline RSS with {len(SHIPPED_LOCALES)} langpacks: {baseline:.0f} MiB")

    result = {}

    def register():
        marionette.timeout.script = CASCADE_WINDOW_SECONDS
        with marionette.using_context("chrome"):
            try:
                result.update(
                    marionette.execute_async_script(
                        REGISTER_SCRIPT, script_args=(str(xpi_path),)
                    )
                )
            except Exception as e:
                result["error"] = repr(e)

    thread = threading.Thread(target=register, daemon=True)
    thread.start()
    peak = baseline
    deadline = time.monotonic() + CASCADE_WINDOW_SECONDS
    while thread.is_alive() and time.monotonic() < deadline:
        peak = max(peak, tree_rss_mib(proc))
        if peak - baseline > MAX_GROWTH_MIB:
            break
        time.sleep(0.25)
    if thread.is_alive():
        # A cascading main thread never answers Marionette, so kill the
        # browser rather than let teardown hang.
        for p in [proc, *proc.children(recursive=True)]:
            p.kill()
        thread.join()
    log(f"Peak RSS: {peak:.0f} MiB (baseline {baseline:.0f} MiB), result: {result}")

    assert peak - baseline <= MAX_GROWTH_MIB, (
        f"RSS grew {peak - baseline:.0f} MiB during registerFluentSources; "
        "likely AboutNewTabResourceMapping observer cascade (bug 2049845)."
    )
    assert result.get("activeLangpacks") == len(SHIPPED_LOCALES), result
    assert "error" not in result, result


if __name__ == "__main__":
    mozunit.main()
