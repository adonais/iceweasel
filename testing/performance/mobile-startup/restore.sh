#!/bin/bash

#name: tab-restore-newssite
#owner: perftest
#description: Runs the newssite mobile restore test for chrome/fenix

SCRIPT_PATH="testing/performance/mobile-startup/android_startup_videoapplink.py"

source testing/performance/mobile-startup/newssite-setup.sh

start_newssite_server

# Run the Python script
$PYTHON_PATH_SHELL_SCRIPT $SCRIPT_PATH $APP mobile_restore $TEST_URL

stop_newssite_server
