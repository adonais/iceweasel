#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

r"""Create a minimal WebM file containing repeated VP8 keyframes.

The command can set WebM pixel geometry, pixel crop, timing, track identity,
and muxer labels. Each --block-timecode adds a SimpleBlock that reuses the same
VP8 keyframe. Timecode values are Segment Ticks; --timecode-scale specifies the
number of nanoseconds in one tick.

The built-in keyframe is 320x240 and has a distinctive border around its
interior. Use --frame to supply another raw encoded VP8 keyframe. Pixel metadata
is written as requested and is not inferred from the encoded frame.

Run ``python3 generate_vp8_pixel_crop.py --help`` for all options. For example:

  python3 generate_vp8_pixel_crop.py \
    --pixel-width 320 --pixel-height 240 \
    --pixel-crop-top 16 --pixel-crop-right 16 \
    --pixel-crop-bottom 16 --pixel-crop-left 16 \
    --timecode-scale 1000000 --duration 2000 \
    --block-timecode 0 --block-timecode 1000 output.webm
"""

from __future__ import annotations

import argparse
import hashlib
import math
import struct
from dataclasses import dataclass
from pathlib import Path

IDS = {
    "EBML": b"\x1aE\xdf\xa3",
    "DocType": b"\x42\x82",
    "DocTypeVersion": b"\x42\x87",
    "DocTypeReadVersion": b"\x42\x85",
    "EBMLVersion": b"\x42\x86",
    "EBMLReadVersion": b"\x42\xf7",
    "EBMLMaxIDLength": b"\x42\xf2",
    "EBMLMaxSizeLength": b"\x42\xf3",
    "Segment": b"\x18S\x80g",
    "Info": b"\x15I\xa9\x66",
    "TimecodeScale": b"\x2a\xd7\xb1",
    "Duration": b"\x44\x89",
    "MuxingApp": b"M\x80",
    "WritingApp": b"W\x41",
    "Tracks": b"\x16T\xae\x6b",
    "TrackEntry": b"\xae",
    "TrackNumber": b"\xd7",
    "TrackUID": b"s\xc5",
    "TrackType": b"\x83",
    "CodecID": b"\x86",
    "Video": b"\xe0",
    "PixelWidth": b"\xb0",
    "PixelHeight": b"\xba",
    "PixelCropBottom": b"T\xaa",
    "PixelCropTop": b"T\xbb",
    "PixelCropLeft": b"T\xcc",
    "PixelCropRight": b"T\xdd",
    "Cluster": b"\x1fC\xb6u",
    "Timecode": b"\xe7",
    "SimpleBlock": b"\xa3",
}

DEFAULT_VP8_KEYFRAME = bytes.fromhex(
    "501a009d012a4001f00000470885858899848802021be7b01f01fc07ec0fe80c"
    "8fb7c0bf80fe00ea8af01fc01fd01dc0104951be4131b61ed33da67b38305f0b"
    "cc2b494f0adf6179856929e15be8bbbfe4131b61ed33d9c76b211bb08c4fe413"
    "1b39dac846ec2313f904c6ce76b211bb08c4fe4131b39dac846ec2313f904c6"
    "ce76b211bb08c4fe4131b39dac846ec2313f904c6ce76b211bb08c4fe4131b39"
    "dac846ec2313f904c6ce76b211bb08c4fe4131b39dac846ec2313f904c6ce76"
    "b211bb08c4fe4131b39dacf0adf6179856929e15bec2f30ad253c59000feff81"
    "2322737930a73ccd43aac1d9de770bffba507e94c2331d0fe9cffa5b6936796f"
    "a7c086a4455523220b975be5d6a46f622aa919105cbadf2eb5237b115548c8b1"
    "653693fa20b9c0be5d7746f624d2919162cbae02eb523a391554fe882e702f97"
    "5dd1bd8934a46458b38180baee8e8e49a53fa2c59c0c05d77474724d29fd162"
    "ce0602ebba38780"
)


@dataclass(frozen=True)
class WebMOptions:
    pixel_width: int
    pixel_height: int
    pixel_crop_bottom: int
    pixel_crop_top: int
    pixel_crop_left: int
    pixel_crop_right: int
    timecode_scale: int
    duration: float
    muxing_app: str
    writing_app: str
    track_number: int
    track_uid: int
    cluster_timecode: int
    block_timecodes: tuple[int, ...]
    vp8_frame: bytes


def positive_integer(value):
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return result


def nonnegative_integer(value):
    result = int(value)
    if result < 0:
        raise argparse.ArgumentTypeError("must not be negative")
    return result


def block_timecode(value):
    result = int(value)
    if not -(1 << 15) <= result < (1 << 15):
        raise argparse.ArgumentTypeError("must fit in a signed 16-bit integer")
    return result


def nonnegative_float(value):
    result = float(value)
    if result < 0 or not math.isfinite(result):
        raise argparse.ArgumentTypeError("must be finite and not negative")
    return result


def uint(value):
    return value.to_bytes(max(1, (value.bit_length() + 7) // 8), "big")


def vint(value):
    for length in range(1, 9):
        if value < (1 << (7 * length)) - 1:
            encoded = bytearray(uint(value).rjust(length, b"\x00"))
            encoded[0] |= 0x80 >> (length - 1)
            return bytes(encoded)
    raise ValueError("value is too large")


def element(name, payload):
    return IDS[name] + vint(len(payload)) + payload


def unsigned_element(name, value):
    return element(name, uint(value))


def simple_block(track_number, timecode, frame):
    payload = vint(track_number) + timecode.to_bytes(2, "big", signed=True)
    return element("SimpleBlock", payload + b"\x80" + frame)


def make_fixture(options):
    if options.pixel_crop_left + options.pixel_crop_right >= options.pixel_width:
        raise ValueError("horizontal pixel crop must leave a visible pixel")
    if options.pixel_crop_top + options.pixel_crop_bottom >= options.pixel_height:
        raise ValueError("vertical pixel crop must leave a visible pixel")
    if not options.block_timecodes:
        raise ValueError("at least one block timecode is required")
    if options.cluster_timecode + min(options.block_timecodes) < 0:
        raise ValueError("block timecodes must not precede timecode zero")
    if not options.vp8_frame:
        raise ValueError("the VP8 frame must not be empty")

    ebml = element(
        "EBML",
        unsigned_element("EBMLVersion", 1)
        + unsigned_element("EBMLReadVersion", 1)
        + unsigned_element("EBMLMaxIDLength", 4)
        + unsigned_element("EBMLMaxSizeLength", 8)
        + element("DocType", b"webm")
        + unsigned_element("DocTypeVersion", 2)
        + unsigned_element("DocTypeReadVersion", 2),
    )
    info = element(
        "Info",
        unsigned_element("TimecodeScale", options.timecode_scale)
        + element("Duration", struct.pack(">d", options.duration))
        + element("MuxingApp", options.muxing_app.encode())
        + element("WritingApp", options.writing_app.encode()),
    )
    video = element(
        "Video",
        unsigned_element("PixelWidth", options.pixel_width)
        + unsigned_element("PixelHeight", options.pixel_height)
        + unsigned_element("PixelCropBottom", options.pixel_crop_bottom)
        + unsigned_element("PixelCropTop", options.pixel_crop_top)
        + unsigned_element("PixelCropLeft", options.pixel_crop_left)
        + unsigned_element("PixelCropRight", options.pixel_crop_right),
    )
    tracks = element(
        "Tracks",
        element(
            "TrackEntry",
            unsigned_element("TrackNumber", options.track_number)
            + unsigned_element("TrackUID", options.track_uid)
            + unsigned_element("TrackType", 1)
            + element("CodecID", b"V_VP8")
            + video,
        ),
    )
    blocks = b"".join(
        simple_block(options.track_number, timecode, options.vp8_frame)
        for timecode in options.block_timecodes
    )
    cluster = element(
        "Cluster",
        unsigned_element("Timecode", options.cluster_timecode) + blocks,
    )
    return ebml + element("Segment", info + tracks + cluster)


def parse_args():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path(__file__).with_name("vp8-pixel-crop.webm"),
        help="output WebM path (default: %(default)s)",
    )
    parser.add_argument(
        "--pixel-width",
        type=positive_integer,
        default=320,
        help="WebM PixelWidth metadata (default: %(default)s)",
    )
    parser.add_argument(
        "--pixel-height",
        type=positive_integer,
        default=240,
        help="WebM PixelHeight metadata (default: %(default)s)",
    )
    for edge in ("bottom", "top", "left", "right"):
        parser.add_argument(
            f"--pixel-crop-{edge}",
            type=nonnegative_integer,
            default=16,
            help=f"WebM PixelCrop{edge.title()} metadata (default: %(default)s)",
        )
    parser.add_argument(
        "--timecode-scale",
        type=positive_integer,
        default=1_000_000,
        help="nanoseconds per Segment Tick (default: %(default)s)",
    )
    parser.add_argument(
        "--duration",
        type=nonnegative_float,
        default=2000.0,
        help="segment duration in Segment Ticks (default: %(default)s)",
    )
    parser.add_argument(
        "--cluster-timecode",
        type=nonnegative_integer,
        default=0,
        help="absolute cluster timecode in Segment Ticks (default: %(default)s)",
    )
    parser.add_argument(
        "--block-timecode",
        action="append",
        type=block_timecode,
        help="SimpleBlock timecode relative to its cluster; repeat for each frame",
    )
    parser.add_argument(
        "--track-number",
        type=positive_integer,
        default=1,
        help="WebM track number (default: %(default)s)",
    )
    parser.add_argument(
        "--track-uid",
        type=positive_integer,
        default=1,
        help="WebM track UID (default: %(default)s)",
    )
    parser.add_argument(
        "--muxing-app",
        default="generate_vp8_pixel_crop.py",
        help="WebM MuxingApp label (default: %(default)s)",
    )
    parser.add_argument(
        "--writing-app",
        default="generate_vp8_pixel_crop.py",
        help="WebM WritingApp label (default: %(default)s)",
    )
    parser.add_argument(
        "--frame",
        type=Path,
        help="raw encoded VP8 keyframe (default: built-in 320x240 frame)",
    )
    return parser, parser.parse_args()


def main():
    parser, args = parse_args()
    try:
        frame = args.frame.read_bytes() if args.frame else DEFAULT_VP8_KEYFRAME
        options = WebMOptions(
            pixel_width=args.pixel_width,
            pixel_height=args.pixel_height,
            pixel_crop_bottom=args.pixel_crop_bottom,
            pixel_crop_top=args.pixel_crop_top,
            pixel_crop_left=args.pixel_crop_left,
            pixel_crop_right=args.pixel_crop_right,
            timecode_scale=args.timecode_scale,
            duration=args.duration,
            muxing_app=args.muxing_app,
            writing_app=args.writing_app,
            track_number=args.track_number,
            track_uid=args.track_uid,
            cluster_timecode=args.cluster_timecode,
            block_timecodes=tuple(args.block_timecode or (0, 1000)),
            vp8_frame=frame,
        )
        fixture = make_fixture(options)
        args.output.write_bytes(fixture)
    except (OSError, ValueError) as error:
        parser.error(str(error))

    digest = hashlib.sha256(fixture).hexdigest()
    print(f"wrote {args.output} ({len(fixture)} bytes, sha256={digest})")


if __name__ == "__main__":
    main()
