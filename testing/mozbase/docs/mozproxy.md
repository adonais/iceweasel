# {mod}`mozproxy` --- Provides an HTTP proxy

Mozproxy let you launch an HTTP proxy when we need to run tests against
third-part websites in a reliable and reproducible way.

Mozproxy provides an interface to a proxy software, and the currently
supported backend is **mitmproxy** for Desktop and Android.

Mozproxy is used by Raptor to run performance test without having to interact
with the real web site.

Mozproxy provide a function that returns a playback class. The usage pattern is


```python
from mozproxy import get_playback

config = {'playback_tool': 'mitmproxy'}
pb = get_playback(config)
pb.start()
try:
  # do your test
finally:
  pb.stop()
```

**config** is a dict with the following options:

- **playback_tool**: name of the backend. can be "mitmproxy", "mitmproxy-android"
- **playback_mode**: "proxy" (default) or "direct". See [Playback modes](#playback-modes)
- **playback_version**: playback tool version
- **playback_files**: playback recording path/manifest/URL
- **binary**: path of the browser binary
- **obj_path**: build dir
- **platform**: platform name (provided by mozinfo.os)
- **run_local**: if True, the test is running locally.
- **app**: tested app. Can be "firefox", "geckoview", "refbrow", "fenix" or "firefox"
- **host**: hostname for the policies.json file
- **local_profile_dir**: profile dir

## Playback modes

In the default **proxy** mode mitmproxy runs as an HTTP proxy and the browser
must be routed through it (proxy preferences or an enterprise policy).

In **direct** mode mitmproxy instead serves the recording as a reverse proxy
on two dedicated ports, exposed as `http_port` and `https_port` on the
playback object. Nothing is proxied and no elevated privileges are needed;
the harness points the browser at those ports directly (for Firefox the
`network.dns.forceResolve` and `network.socket.forcePort` preferences, for
Chromium `--host-resolver-rules`) and replay matching ignores the recorded
port. Direct mode requires mitmproxy >= 9 for multiple `--mode` listen
specs; the supported in-tree versions are 11.0.0 and 12.2.1, so recordings
pinned to 8.1.1 must stay in proxy mode.

HTTP/3 is not supported in either mode.

Supported environment variables:

- **MOZPROXY_DIR**: directory used by mozproxy for all data files, set by mozproxy
- **MOZ_UPLOAD_DIR**: upload directory path
- **GECKO_HEAD_REPOSITORY**: used to find the certutils binary path from the CI
- **GECKO_HEAD_REV**: used to find the certutils binary path from the CI
- **HOSTUTILS_MANIFEST_PATH**: used to find the certutils binary path from the CI
