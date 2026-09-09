#!/bin/bash

#name: newssite-applink-startup
#owner: perftest
#description: Runs the newssite applink startup(cvne) test for chrome/fenix

SCRIPT_PATH="testing/performance/mobile-startup/android_startup_videoapplink.py"

source testing/performance/mobile-startup/newssite-setup.sh

start_newssite_server

# Run the Python script
$PYTHON_PATH_SHELL_SCRIPT $SCRIPT_PATH $APP cold_view_nav_end $TEST_URL

stop_newssite_server
