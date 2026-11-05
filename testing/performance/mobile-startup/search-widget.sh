#!/bin/bash

#name: search-widget-startup-first-frame
#owner: perftest
#description: Runs the Cold Search Widget First Frame startup test for chrome/fenix

SCRIPT_PATH="testing/performance/mobile-startup/android_startup_cmff_cvns.py"

$PYTHON_PATH_SHELL_SCRIPT $SCRIPT_PATH $APP cold_search_widget_first_frame
TEST_STATUS=$?

exit $TEST_STATUS
