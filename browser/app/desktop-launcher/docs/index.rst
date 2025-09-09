=====================
Desktop Launcher app
=====================

A substantial number of users will upgrade to Windows 11 in a way that leaves no trace of Firefox on their device. To address these cases we will leave
an install entry point in their personal files, which will migrate at a higher rate than the app itself. In particular, files in the Desktop folder are
backed up by OneDrive and other cloud storage products, and likely to find their way back onto a new device.

This app acts as a replacement for the desktop shortcut to Firefox.

When Firefox is installed on the user's machine, when the user launches this app, it finds the path to Firefox in the appropriate Windows Registry keys
and attempts to launch Firefox from that path.

When there is no Firefox installation found, this app will attempt to download and run the Firefox "stub" installer.

As a final fallback, this app will open the Firefox download URL in the default browser.
