# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Support for optimizing tasks based on the set of files that have changed.
"""

from subprocess import CalledProcessError

from mozbuild.util import memoize
from mozversioncontrol import InvalidRepoPath, get_repository_object


@memoize
def get_locally_changed_files(repo):
    try:
        vcs = get_repository_object(repo)
        return set(vcs.get_outgoing_files("AM"))
    except (InvalidRepoPath, CalledProcessError):
        return set()
