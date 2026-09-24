#!/bin/bash

#name: shopify-applink-startup
#owner: perftest
#description: Runs the shopify applink startup(cvne) test for chrome/fenix
#options: {"default": {"hooks": "testing/performance/mobile-startup/hooks_opencv.py"}}

# Path to the Python script
SCRIPT_PATH="testing/performance/mobile-startup/android_startup_videoapplink.py"

# Run the Python script
$PYTHON_PATH_SHELL_SCRIPT $SCRIPT_PATH $APP cold_view_nav_end https://theme-crave-demo.myshopify.com
TEST_STATUS=$?

# Propagate the test status so the harness reports the script failure instead
# of a missing metrics error.
exit $TEST_STATUS
