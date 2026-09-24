import os
from pathlib import Path


def before_iterations(args):
    # Records that a test-declared hook file gets a virtualenv it can
    # install the packages the test needs into.
    Path(os.environ["HOOK_MARKER"]).write_text(str(args["virtualenv"] is not None))
