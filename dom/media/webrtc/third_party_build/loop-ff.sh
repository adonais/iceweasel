#!/bin/bash

# This is a thin wrapper that prepares the environment (via use_config_env.sh)
# and then hands off to the Python implementation in loop-ff.py.  All of the
# fast-forward loop logic lives there.

source dom/media/webrtc/third_party_build/use_config_env.sh

# A couple command line flags that may be useful:
# MOZ_STOP_AFTER_COMMIT # stops after processing the provided upstream commit
#   usage: MOZ_STOP_AFTER_COMMIT=90ef797418 bash loop-ff.sh
#
# MOZ_ADVANCE_ONE_COMMIT # stops after processing one commit
#   usage: MOZ_ADVANCE_ONE_COMMIT=1 bash loop-ff.sh

# Capture all output (stdout and stderr) from the Python loop into the log
# file, while still showing it on the console.  pipefail ensures the wrapper
# exits with the Python script's status rather than tee's.
set -o pipefail
PYTHONUNBUFFERED=1 ./mach python $SCRIPT_DIR/loop-ff.py 2>&1 \
  | tee $LOG_DIR/log-loop-ff.txt
