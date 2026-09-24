#!/bin/bash

#name: homeview-startup
#owner: perftest
#description: Runs the homeview startup test for chrome/fenix
#options: {"default": {"hooks": "testing/performance/mobile-startup/hooks_opencv.py"}}

# Path to the Python script
SCRIPT_PATH="testing/performance/mobile-startup/android_startup_videoapplink.py"

# Run the Python script
$PYTHON_PATH_SHELL_SCRIPT $SCRIPT_PATH $APP homeview_startup https://theme-crave-demo.myshopify.com
TEST_STATUS=$?

# Propagate the test status so the harness reports the script failure instead
# of a missing metrics error.
exit $TEST_STATUS
