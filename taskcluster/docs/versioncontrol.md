# Version Control in CI

## Upgrading Mercurial

Upgrading Mercurial in CI requires touching a handful of different
components.

### Vendored robustcheckout

The `robustcheckout` Mercurial extension is used throughout CI to
perform clones and working directory updates. The canonical home of
the extension is in the
<https://hg.mozilla.org/hgcustom/version-control-tools> repository
at the path `hgext/robustcheckout/__init__.py`.

When upgrading Mercurial, the `robustcheckout` extension should also
be updated to ensure it is compatible with the version of Mercurial
being upgraded to. Typically, one simply copies the latest version
from `version-control-tools` into the vendored locations.

The locations are as follows:

- In-tree: `taskcluster/scripts/robustcheckout.py`
- ronin_puppet: `https://github.com/mozilla-platform-ops/ronin_puppet/blob/master/modules/mercurial/files/robustcheckout.py`, `https://github.com/mozilla-platform-ops/ronin_puppet/blob/master/modules/win_mozilla_build/files/robustcheckout.py`, `https://github.com/mozilla-platform-ops/ronin_puppet/blob/master/modules/linux_mercurial/files/robustcheckout.py`
- taskgraph: `https://github.com/taskcluster/taskgraph/blob/main/src/taskgraph/run-task/robustcheckout.py`

### Debian Packages for Debian and Ubuntu Based Docker Images

`taskcluster/kinds/packages/debian.yml` and `taskcluster/kinds/packages/ubuntu.yml`
define custom Debian packages for Mercurial. These are installed in various
Docker images.

To upgrade Mercurial, typically you just need to update the source URL
and its hash in this file.
