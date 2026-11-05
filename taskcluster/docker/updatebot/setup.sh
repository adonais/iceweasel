#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -vex

# Install the evolve extension
# Mercurial will complain that it can't find the evolve extension - this is
# because we don't have it yet, and we are asking mercurial to go install it
# so mercurial can use it.
# Clone from foss.heptapod.net rather than repo.mercurial-scm.org, which is
# often overloaded and fails clones (as version-control-tools also does).
hg clone https://foss.heptapod.net/mercurial/evolve "$HOME/.mozbuild/evolve"
(
  cd "$HOME/.mozbuild/evolve"
  rev=$(hg tags | sort -k 1 -V -r | awk -F: 'NR==2 {print $2}')
  hg up "${rev}"
)

# Copy the system known_hosts to the home directory so we have uniformity with Windows
# and the ssh command will find them in the same place.
cp /etc/ssh/ssh_known_hosts "$HOME/ssh_known_hosts"

# If poetry is not run as worker, then it won't work when run as user later.
cd /builds/worker/updatebot
/usr/local/bin/poetry install --no-ansi
