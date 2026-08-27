# coding=UTF-8

import json
import uuid

import mozcrash
import pytest


@pytest.fixture(scope="session")
def stackwalk(tmpdir_factory):
    stackwalk = tmpdir_factory.mktemp("stackwalk_binary").join("stackwalk")
    stackwalk.write("fake binary")
    stackwalk.chmod(0o744)
    return stackwalk


@pytest.fixture
def check_for_crashes(tmpdir, stackwalk, monkeypatch):
    monkeypatch.delenv("MINIDUMP_SAVE_PATH", raising=False)

    def wrapper(
        dump_directory=str(tmpdir),
        symbols_path="symbols_path",
        stackwalk_binary=str(stackwalk),
        dump_save_path=None,
        test_name=None,
        quiet=True,
        keep=None,
    ):
        return mozcrash.check_for_crashes(
            dump_directory,
            symbols_path,
            stackwalk_binary,
            dump_save_path,
            test_name,
            quiet,
            keep,
        )

    return wrapper


@pytest.fixture
def write_minidump(tmpdir):
    """Write a minidump (a .dmp/.extra pair) carrying the given annotations to
    the directory that check_for_crashes scans."""

    def wrapper(annotations):
        name = uuid.uuid4()
        tmpdir.join(f"{name}.dmp").write("foo")
        tmpdir.join(f"{name}.extra").write_text(
            json.dumps(annotations), encoding="utf-8"
        )

    return wrapper


@pytest.fixture
def make_annotations():
    """Return a factory that builds an annotation set from the minimal set that
    makes check_for_crashes report a crash. Pass keyword arguments to add or
    override annotations."""

    def make(**overrides):
        return {
            "ProductName": "Firefox",
            "Version": "55.0a1",
            "BuildID": "20170512114708",
            "ProcessType": "utility",
            **overrides,
        }

    return make


@pytest.fixture
def check_for_java_exception():
    def wrapper(logcat=None, test_name=None, quiet=True):
        return mozcrash.check_for_java_exception(logcat, test_name, quiet)

    return wrapper


def minidump_files(request, tmpdir):
    files = []

    for i in range(getattr(request, "param", 1)):
        name = uuid.uuid4()

        dmp = tmpdir.join(f"{name}.dmp")
        dmp.write("foo")

        extra = tmpdir.join(f"{name}.extra")

        extra.write_text(
            """
{
  "ContentSandboxLevel":"2",
  "TelemetryEnvironment":"{🍪}",
  "EMCheckCompatibility":"true",
  "ProductName":"Firefox",
  "ContentSandboxCapabilities":"119",
  "TelemetryClientId":"",
  "Vendor":"Mozilla",
  "InstallTime":"1000000000",
  "Theme":"classic/1.0",
  "ReleaseChannel":"default",
  "ServerURL":"https://crash-reports.mozilla.com",
  "SafeMode":"0",
  "ContentSandboxCapable":"1",
  "useragent_locale":"en-US",
  "Version":"55.0a1",
  "BuildID":"20170512114708",
  "ProductID":"{ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
  "MozCrashReason": "MOZ_CRASH()",
  "TelemetryServerURL":"",
  "DOMIPCEnabled":"1",
  "Add-ons":"",
  "CrashTime":"1494582646",
  "UptimeTS":"14.9179586",
  "ContentSandboxEnabled":"1",
  "ProcessType":"content",
  "StartupTime":"1000000000",
  "URL":"about:home"
}

        """,
            encoding="utf-8",
        )

        files.append({"dmp": dmp, "extra": extra})

    return files


@pytest.fixture(name="minidump_files")
def minidump_files_fixture(request, tmpdir):
    return minidump_files(request, tmpdir)


@pytest.fixture(autouse=True)
def mock_popen(monkeypatch):
    """Generate a class that can mock subprocess.Popen.

    :param stdouts: Iterable that should return an iterable for the
                    stdout of each process in turn.
    """

    class MockPopen:
        def __init__(self, args, *args_rest, **kwargs):
            # all_popens.append(self)
            self.args = args
            self.returncode = 0

        def communicate(self):
            return ("Stackwalk command: {}".format(" ".join(self.args)), "")

        def wait(self):
            return self.returncode

    monkeypatch.setattr(mozcrash.mozcrash.subprocess, "Popen", MockPopen)
