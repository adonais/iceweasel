#!/bin/bash

set -e

mkdir -p /run/dbus
if [ -f /etc/init.d/dbus ]; then
    /etc/init.d/dbus start 2>&1
else
    dbus-daemon --system --fork 2>&1
fi

exec "${@}"
