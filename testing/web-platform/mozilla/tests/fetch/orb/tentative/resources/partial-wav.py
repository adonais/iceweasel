"""Serves a throttled silent WAV that forces a second window to make its own
mid-file media range request.

The resource is a long silent WAV whose body is streamed slowly (throttled).
The WAV header is sent immediately so a media element can read metadata right
away, but the audio samples trickle out over time. A window that only wants
metadata (preload="metadata") therefore caches just the beginning of the file.

When a second, same-principal window clones that media resource and seeks close
to the end, the bytes it needs have not been downloaded yet, so it must issue
its own range request starting well past byte 0 (a non-first-partial 206).
Opaque Response Blocking only allows such a request if the resource has already
been recorded as media. This is what lets the test tell apart per-window and
per-principal recording (bug 2057272).
"""

import re
import struct
import time

from wptserve.utils import isomorphic_decode

SAMPLE_RATE = 8000
BIT_DEPTH = 8
CHANNELS = 1
# Long enough that, while throttled, the tail of the file is nowhere near
# downloaded by the time the second window seeks to it.
DURATION_SECONDS = 300
# Bytes handed out per throttle tick, and the delay between ticks.
CHUNK = SAMPLE_RATE
THROTTLE_SECONDS = 0.5


def wav_header(data_size):
    block_align = int(BIT_DEPTH / 8) * CHANNELS
    byte_rate = SAMPLE_RATE * block_align
    header = b""
    header += b"RIFF"
    header += struct.pack("<L", 36 + data_size)
    header += b"WAVE"
    header += b"fmt "
    header += struct.pack("<L", 16)
    header += struct.pack("<H", 1)
    header += struct.pack("<H", CHANNELS)
    header += struct.pack("<L", SAMPLE_RATE)
    header += struct.pack("<L", byte_rate)
    header += struct.pack("<H", block_align)
    header += struct.pack("<H", BIT_DEPTH)
    header += b"data"
    header += struct.pack("<L", data_size)
    return header


def main(request, response):
    data_size = int(SAMPLE_RATE * BIT_DEPTH * CHANNELS * DURATION_SECONDS / 8)
    header = wav_header(data_size)
    total = len(header) + data_size

    range_header = request.headers.get(b"Range", b"")
    match = range_header and re.search(
        r"^bytes=(\d+)-(\d*)$", isomorphic_decode(range_header)
    )
    start = int(match.group(1)) if match else 0
    end = int(match.group(2)) if (match and match.group(2)) else total - 1

    response.status = 206
    response.headers.set(b"Content-Type", b"audio/wav")
    response.headers.set(b"Accept-Ranges", b"bytes")
    response.headers.set(b"Cache-Control", b"no-store")
    response.headers.set(b"Content-Range", b"bytes %d-%d/%d" % (start, end, total))
    response.headers.set(b"Content-Length", b"%d" % (end - start + 1))
    response.write_status_headers()

    pos = start
    # Send any requested part of the header immediately so metadata is available
    # without waiting on the throttle.
    if pos <= end and pos < len(header):
        chunk = header[pos : min(len(header), end + 1)]
        if not response.writer.write(chunk):
            return
        pos += len(chunk)

    # Stream the silent PCM data slowly. A client that cancels (e.g. after
    # reading metadata) makes write() fail, which ends the response.
    while pos <= end:
        chunk = b"\x00" * min(CHUNK, end - pos + 1)
        if not response.writer.write(chunk):
            return
        pos += len(chunk)
        time.sleep(THROTTLE_SECONDS)
