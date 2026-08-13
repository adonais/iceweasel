# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Originally based on
# https://github.com/mitmproxy/mitmproxy/blob/v7.0.4/mitmproxy/addons/serverplayback.py
# Modified for mozproxy multi-recording playback with diagnostic logging.

# Behaviors that differ from upstream serverplayback:
#   * On a request with no matching recorded flow, return 404 (when
#     alt_server_replay_kill_extra=true) instead of letting the flow drop
#     and the client hang.
#   * Optional reverse-order replay (alt_server_replay_order_reversed) for
#     tests that need newest-first matching.
#   * Loads multiple recordings into a single flowmap, tracks origin file
#     per flow, and emits structured logging for every request so that
#     hangs and missing-resource bugs are diagnosable from mitmproxy.log.

import hashlib
import logging
import os
import traceback
import urllib
from collections import Counter, defaultdict
from collections.abc import Hashable, Sequence
from typing import Any, Optional

import mitmproxy.types
from mitmproxy import command, ctx, exceptions, flow, hooks, http, io

logger = logging.getLogger(__name__)

# Truncate URLs in log lines so a single replay log stays grep-able.
_URL_LOG_MAX = 160


def _short(url: str) -> str:
    if len(url) <= _URL_LOG_MAX:
        return url
    return url[: _URL_LOG_MAX - 3] + "..."


class AltServerPlayback:
    flowmap: dict[Hashable, list[http.HTTPFlow]]
    flow_origin: dict[int, str]
    configured: bool

    def __init__(self):
        self.flowmap = {}
        # id(flow) -> source recording basename; lets request logs say
        # which file actually served a given resource.
        self.flow_origin = {}
        self.configured = False
        self._matched = 0
        self._missed = 0
        self._killed = 0
        self._missed_urls: Counter = Counter()

    def load(self, loader):
        loader.add_option(
            "alt_server_replay_kill_extra",
            bool,
            False,
            "Kill extra requests during replay.",
        )
        loader.add_option(
            "alt_server_replay_nopop",
            bool,
            False,
            """
            Don't remove flows from server replay state after use. This makes it
            possible to replay same response multiple times.
            """,
        )
        loader.add_option(
            "alt_server_replay_refresh",
            bool,
            True,
            """
            Refresh server replay responses by adjusting date, expires and
            last-modified headers, as well as adjusting cookie expiration.
            """,
        )
        loader.add_option(
            "alt_server_replay_use_headers",
            Sequence[str],
            [],
            "Request headers to be considered during replay.",
        )
        loader.add_option(
            "alt_server_replay",
            Sequence[str],
            [],
            "Replay server responses from a saved file.",
        )
        loader.add_option(
            "alt_server_replay_ignore_content",
            bool,
            False,
            "Ignore request's content while searching for a saved flow to replay.",
        )
        loader.add_option(
            "alt_server_replay_ignore_params",
            Sequence[str],
            [],
            """
            Request's parameters to be ignored while searching for a saved flow
            to replay.
            """,
        )
        loader.add_option(
            "alt_server_replay_ignore_payload_params",
            Sequence[str],
            [],
            """
            Request's payload parameters (application/x-www-form-urlencoded or
            multipart/form-data) to be ignored while searching for a saved flow
            to replay.
            """,
        )
        loader.add_option(
            "alt_server_replay_ignore_host",
            bool,
            False,
            """
            Ignore request's destination host while searching for a saved flow
            to replay.
            """,
        )
        loader.add_option(
            "alt_server_replay_ignore_port",
            bool,
            False,
            """
            Ignore request's destination port while searching for a saved flow
            to replay.
            """,
        )
        loader.add_option(
            "alt_server_replay_order_reversed",
            bool,
            False,
            """
            Reverse the order of flows when replaying.
            """,
        )

    @command.command("replay.server")
    def load_flows(self, flows: Sequence[flow.Flow]) -> None:
        """
        Replay server responses from flows.
        """
        self.flowmap = {}
        # NB: do not reset flow_origin here. _load_paths populates it
        # before calling us, and command-line replay.server loaders that
        # don't go through _load_paths simply won't have origin labels
        # (the request log will say "from ?", which is fine).
        if ctx.options.alt_server_replay_order_reversed:
            flows = list(flows)
            flows.reverse()
        kept = 0
        dropped_no_response = 0
        for f in flows:
            if not isinstance(f, http.HTTPFlow):
                continue
            if not f.response:
                # A request that never got a response in the recording
                # would silently turn into a hang at replay time. Drop it
                # at load time and log it.
                dropped_no_response += 1
                logger.warning(
                    "replay.load: dropping flow with no response: %s %s",
                    f.request.method,
                    _short(f.request.url),
                )
                continue
            lst = self.flowmap.setdefault(self._hash(f), [])
            lst.append(f)
            kept += 1
        logger.info(
            "replay.load: kept=%d dropped_no_response=%d unique_keys=%d",
            kept,
            dropped_no_response,
            len(self.flowmap),
        )
        ctx.master.addons.trigger(hooks.UpdateHook([]))

    def _load_paths(self, paths: list[str]) -> None:
        """
        Load flows from each recording path independently so we can log
        per-file counts and tag each flow with its source. Without this,
        a hang in iteration N is impossible to attribute to the right
        recording.
        """
        all_flows: list[flow.Flow] = []
        per_file: list[tuple[str, int]] = []
        for path in paths:
            try:
                file_flows = list(io.read_flows_from_paths([path]))
            except exceptions.FlowReadException as e:
                # Don't let one bad recording prevent the rest from loading;
                # log and continue. mitmproxy still raises if zero flows load.
                logger.error("replay.load: failed to read %s: %s", path, e)
                continue
            origin = os.path.basename(os.path.dirname(path)) or os.path.basename(path)
            http_count = 0
            for f in file_flows:
                if isinstance(f, http.HTTPFlow):
                    self.flow_origin[id(f)] = origin
                    http_count += 1
            per_file.append((origin, http_count))
            all_flows.extend(file_flows)

        for origin, count in per_file:
            logger.info("replay.load: %s -> %d HTTP flow(s)", origin, count)
        logger.info(
            "replay.load: total recordings=%d total HTTP flows=%d",
            len(per_file),
            sum(c for _, c in per_file),
        )

        # Detect cross-file hash collisions before they become a debug
        # mystery. Two recordings hashing the same URL is fine (we keep
        # all of them) but worth surfacing.
        per_key_origins: dict[Hashable, set[str]] = defaultdict(set)
        for f in all_flows:
            if isinstance(f, http.HTTPFlow) and f.response:
                per_key_origins[self._hash(f)].add(self.flow_origin.get(id(f), "?"))
        cross_file_keys = sum(1 for s in per_key_origins.values() if len(s) > 1)
        if cross_file_keys:
            logger.info(
                "replay.load: %d hash key(s) appear in multiple recordings",
                cross_file_keys,
            )

        self.load_flows(all_flows)

    @command.command("replay.server.file")
    def load_file(self, path: mitmproxy.types.Path) -> None:
        try:
            flows = io.read_flows_from_paths([path])
        except exceptions.FlowReadException as e:
            raise exceptions.CommandError(str(e))
        self.load_flows(flows)

    @command.command("replay.server.stop")
    def clear(self) -> None:
        """
        Stop server replay.
        """
        self.flowmap = {}
        self.flow_origin = {}
        ctx.master.addons.trigger(hooks.UpdateHook([]))

    @command.command("replay.server.count")
    def count(self) -> int:
        return sum([len(i) for i in self.flowmap.values()])

    def _hash(self, flow: http.HTTPFlow) -> Hashable:
        """
        Calculates a loose hash of the flow request.
        """
        r = flow.request
        _, _, path, _, query, _ = urllib.parse.urlparse(r.url)
        queriesArray = urllib.parse.parse_qsl(query, keep_blank_values=True)

        key: list[Any] = [str(r.scheme), str(r.method), str(path)]
        if not ctx.options.alt_server_replay_ignore_content:
            if ctx.options.alt_server_replay_ignore_payload_params and r.multipart_form:
                key.extend(
                    (k, v)
                    for k, v in r.multipart_form.items(multi=True)
                    if k.decode(errors="replace")
                    not in ctx.options.alt_server_replay_ignore_payload_params
                )
            elif (
                ctx.options.alt_server_replay_ignore_payload_params
                and r.urlencoded_form
            ):
                key.extend(
                    (k, v)
                    for k, v in r.urlencoded_form.items(multi=True)
                    if k not in ctx.options.alt_server_replay_ignore_payload_params
                )
            else:
                key.append(str(r.raw_content))

        if not ctx.options.alt_server_replay_ignore_host:
            key.append(r.pretty_host)
        if not ctx.options.alt_server_replay_ignore_port:
            key.append(r.port)

        filtered = []
        ignore_params = ctx.options.alt_server_replay_ignore_params or []
        for p in queriesArray:
            if p[0] not in ignore_params:
                filtered.append(p)
        for p in filtered:
            key.append(p[0])
            key.append(p[1])

        if ctx.options.alt_server_replay_use_headers:
            headers = []
            for i in ctx.options.alt_server_replay_use_headers:
                v = r.headers.get(i)
                headers.append((i, v))
            key.append(headers)
        return hashlib.sha256(repr(key).encode("utf8", "surrogateescape")).digest()

    def next_flow(self, flow: http.HTTPFlow) -> Optional[http.HTTPFlow]:
        """
        Returns the next flow object, or None if no matching flow was
        found.
        """
        hash = self._hash(flow)
        if hash in self.flowmap:
            if ctx.options.alt_server_replay_nopop:
                # Flows without responses were filtered at load time, but
                # be defensive — a flow whose response field was reset
                # would otherwise return None and look like a miss.
                return next(
                    (flow for flow in self.flowmap[hash] if flow.response), None
                )
            else:
                ret = self.flowmap[hash].pop(0)
                while not ret.response:
                    if self.flowmap[hash]:
                        ret = self.flowmap[hash].pop(0)
                    else:
                        del self.flowmap[hash]
                        return None
                if not self.flowmap[hash]:
                    del self.flowmap[hash]
                return ret
        else:
            return None

    def configure(self, updated):
        if not self.configured and ctx.options.alt_server_replay:
            self.configured = True
            try:
                # alt_server_replay is passed as one comma-joined string;
                # split it back into individual paths so we can attribute
                # each flow to its source recording.
                raw = ctx.options.alt_server_replay[0]
                paths = [p for p in raw.split(",") if p]
                self._load_paths(paths)
            except exceptions.FlowReadException:
                raise exceptions.OptionsError(str(traceback.format_exc()))

    def request(self, f: http.HTTPFlow) -> None:
        if self.flowmap:
            rflow = self.next_flow(f)
            if rflow:
                assert rflow.response
                response = rflow.response.copy()
                if ctx.options.alt_server_replay_refresh:
                    response.refresh()
                f.response = response
                f.is_replay = "response"
                self._matched += 1
                logger.info(
                    "replay.match: %s %s -> %d (from %s)",
                    f.request.method,
                    _short(f.request.url),
                    response.status_code,
                    self.flow_origin.get(id(rflow), "?"),
                )
            elif ctx.options.alt_server_replay_kill_extra:
                # Returning 404 with Connection: close ensures the HTTP/2
                # stream is terminated; otherwise the client can keep the
                # subresource pending and window.onload never fires.
                self._killed += 1
                self._missed_urls[f.request.url] += 1
                logger.warning(
                    "replay.kill: %s %s (no recorded flow, returning 404)",
                    f.request.method,
                    _short(f.request.url),
                )
                # HTML-comment body so a kill on a top-level document
                # renders as a blank page instead of leaking the marker
                # text into screenshots/recordings. The marker is still
                # visible in view-source / mitmproxy.log for debugging.
                f.response = http.Response.make(
                    404,
                    b"<!-- mozproxy: no recorded flow -->\n",
                    {
                        "content-type": "text/html; charset=utf-8",
                        "connection": "close",
                    },
                )
            else:
                self._missed += 1
                self._missed_urls[f.request.url] += 1
                logger.warning(
                    "replay.miss: %s %s (no recorded flow, passthrough)",
                    f.request.method,
                    _short(f.request.url),
                )

    def done(self) -> None:
        # Surface a one-line summary so that even without -v, the operator
        # can see hit/miss counts at the end of mitmproxy.log.
        logger.info(
            "replay.summary: matched=%d killed=%d passthrough_missed=%d",
            self._matched,
            self._killed,
            self._missed,
        )
        # Top missed URLs make it obvious which site needs a recording
        # update. Cap to keep the log small.
        if self._missed_urls:
            for url, count in self._missed_urls.most_common(20):
                logger.info("replay.summary.missed: %dx %s", count, _short(url))


addons = [AltServerPlayback()]
