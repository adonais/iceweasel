# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Control channel between the client tests and the server Firefox.

The client side of the backward compatibility tests runs as a browser mochitest
inside the Firefox under test, and cannot act on the separate Firefox acting as
the DevTools server. This module exposes the actions it needs over plain HTTP:

    POST /command  {"name": "open-tab", "args": {"url": "..."}}

The pages those actions load are served by the regular mochitest HTTP server,
see FIXTURE_ROOT in helper-backward-compat.js.
"""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from marionette_driver.addons import Addons
from marionette_driver.by import By

from .servers import DesktopServer, find_free_port

# The test extension is installed through the AddonManager rather than fetched
# over HTTP, so unlike the fixture pages it stays next to the harness.
EXTENSION_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "fixtures", "extension"
)


class ControlServer:
    """HTTP control channel for acting on the server Firefox.

    :param server: the provisioned server instance, used to run the commands.
    """

    def __init__(self, server: DesktopServer) -> None:
        self.server = server
        self.port = None
        self._httpd = None
        self._thread = None
        # A command can stay pending for a long time: the click which hits a
        # breakpoint only returns once the test resumes. Requests are therefore
        # served on threads, and this serializes access to the Marionette
        # client, which is not thread safe.
        self._lock = threading.Lock()

    def start(self) -> None:
        self.port = find_free_port()
        self._httpd = ThreadingHTTPServer(("127.0.0.1", self.port), _make_handler(self))
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def run_command(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_cmd_{name.replace('-', '_')}", None)
        if handler is None:
            raise ValueError(f"Unknown command '{name}'")

        with self._lock:
            return handler(**args)

    def _cmd_open_tab(self, url: str) -> dict:
        marionette = self.server.marionette
        # Tests run in the same session one after the other, and a test which
        # failed early may have left the current browsing context discarded.
        marionette.switch_to_window(marionette.window_handles[0])
        handle = marionette.open(type="tab", focus=True)["handle"]
        marionette.switch_to_window(handle)
        marionette.navigate(url)
        return {"handle": handle}

    def _cmd_close_tab(self, handle: str) -> dict:
        marionette = self.server.marionette
        marionette.switch_to_window(handle)
        # Closing a window discards the current browsing context, WebDriver
        # expects the client to explicitly switch to a remaining one.
        remaining = marionette.close()
        if remaining:
            marionette.switch_to_window(remaining[0])
        return {}

    def _cmd_navigate(self, url: str, handle: str | None = None) -> dict:
        marionette = self.server.marionette
        if handle:
            marionette.switch_to_window(handle)
        marionette.navigate(url)
        return {}

    def _cmd_reload(self, handle: str | None = None) -> dict:
        marionette = self.server.marionette
        if handle:
            marionette.switch_to_window(handle)
        marionette.refresh()
        return {}

    def _cmd_click(self, selector: str, handle: str | None = None) -> dict:
        marionette = self.server.marionette
        if handle:
            marionette.switch_to_window(handle)
        marionette.find_element(By.CSS_SELECTOR, selector).click()
        return {}

    def _cmd_install_extension(self) -> dict:
        addon_id = Addons(self.server.marionette).install(EXTENSION_DIR, temp=True)
        return {"addonId": addon_id}

    def _cmd_uninstall_extension(self, addonId: str) -> dict:
        Addons(self.server.marionette).uninstall(addonId)
        return {}


def _make_handler(control: ControlServer) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def _respond(self, status, body, content_type="application/json"):
            payload = body if isinstance(body, bytes) else body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            if self.path != "/command":
                self._respond(404, json.dumps({"error": "not found"}))
                return

            length = int(self.headers.get("Content-Length", 0))
            request = json.loads(self.rfile.read(length) or b"{}")
            try:
                result = control.run_command(
                    request["name"], request.get("args", {}) or {}
                )
                self._respond(200, json.dumps({"result": result}))
            except Exception as e:
                self._respond(500, json.dumps({"error": str(e)}))

    return Handler
