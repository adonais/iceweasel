# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Provisioning of the "server" Firefox used by the DevTools backward
compatibility tests.

Each recipe here produces a running Firefox with an open DevTools server socket,
reachable from the client as a plain about:debugging network location. The
client side of the tests never needs to know which recipe was used.
"""

from __future__ import annotations

import socket
import time

from marionette_driver.marionette import Marionette

# Preferences needed on the server for a client to connect without any manual
# interaction. On desktop the socket is opened by --start-debugger-server, which
# bails out early unless remote debugging is enabled.
SERVER_PREFS = {
    "devtools.debugger.remote-enabled": True,
    "devtools.debugger.prompt-connection": False,
    "devtools.chrome.enabled": True,
}

# Read back the values that the device actor will report to the client, so the
# tests can assert on them without duplicating any branding logic.
# See getSystemInfo in devtools/shared/system.js.
DESCRIBE_SCRIPT = """
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  const bundle = Services.strings.createBundle(
    "chrome://branding/locale/brand.properties"
  );
  return {
    brandName: bundle.GetStringFromName("brandFullName"),
    version: Services.appinfo.version,
    channel: AppConstants.MOZ_UPDATE_CHANNEL,
  };
"""


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_port(port: int, timeout: float = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"DevTools server did not start listening on port {port}")


class DesktopServer:
    """A second desktop Firefox acting as the DevTools server.

    Runs with a dedicated temporary profile and is driven over Marionette, so
    the harness can perform server-side page actions (open a tab, click in the
    page, install an extension) that the client cannot perform itself.

    :param binary: path to the Firefox binary to run as the server.
    :param gecko_log: path of the log file for the server instance.
    :param headless: whether to run the server without a visible window.
    """

    def __init__(
        self,
        binary: str,
        gecko_log: str | None = None,
        headless: bool = True,
    ) -> None:
        self.binary = binary
        self.gecko_log = gecko_log
        self.headless = headless
        self.port = None
        self.marionette = None

    def start(self) -> None:
        self.port = find_free_port()
        self.marionette = Marionette(
            bin=self.binary,
            app_args=["--start-debugger-server", str(self.port)],
            prefs=SERVER_PREFS,
            gecko_log=self.gecko_log,
            headless=self.headless,
        )
        self.marionette.start_session()
        wait_for_port(self.port)

    def stop(self) -> None:
        if self.marionette:
            self.marionette.cleanup()
            self.marionette = None

    @property
    def host(self) -> str:
        return f"localhost:{self.port}"

    def describe(self) -> dict[str, str]:
        with self.marionette.using_context("chrome"):
            return self.marionette.execute_script(DESCRIBE_SCRIPT)

    def __enter__(self) -> DesktopServer:
        self.start()
        return self

    def __exit__(self, *args) -> None:
        self.stop()
