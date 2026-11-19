import contextlib
import os
import shutil
import tempfile


# This helper can be replaced by pytest tmpdir fixture
# once Bug 1536029 lands (@mock.patch disturbs pytest fixtures)
@contextlib.contextmanager
def tempdir():
    dest_dir = tempfile.mkdtemp()
    try:
        yield dest_dir
    finally:
        shutil.rmtree(dest_dir, ignore_errors=True)


def firefox_binary(dest_dir):
    """Firefox path whose policies directory lands inside dest_dir on every platform"""
    return os.path.join(dest_dir, "MacOS", "firefox")
