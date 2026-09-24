#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with
# this file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Generate a small video fixture with explicit color metadata.

The command below reproduces av1-color-metadata.mp4. This script is not run by CI;
run it manually when adding or regenerating color-metadata fixtures.

  ./generate_color_metadata_video.py av1-color-metadata.mp4 \
      --encoder-option cpu-used=8 \
      --encoder-option still-picture=1 \
      --encoder-option crf=30

The checked-in fixture was generated with FFmpeg 6.1.1-3ubuntu5.
"""

import argparse
import subprocess
from pathlib import Path


def encoder_option(value):
    name, separator, option_value = value.partition("=")
    if not separator or not name or not option_value:
        raise argparse.ArgumentTypeError("expected NAME=VALUE")
    return name, option_value


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--codec", default="libaom-av1")
    parser.add_argument("--source-color", default="red")
    parser.add_argument("--size", default="16x16")
    parser.add_argument("--frame-rate", default="1")
    parser.add_argument("--duration", default="1")
    parser.add_argument("--frames", type=int, default=1)
    parser.add_argument("--pixel-format", default="yuv420p10le")
    parser.add_argument("--color-primaries", default="bt2020")
    parser.add_argument("--color-transfer", default="smpte2084")
    parser.add_argument("--color-matrix", default="bt2020nc")
    parser.add_argument("--color-range", default="tv")
    parser.add_argument("--movflags", default="+faststart")
    parser.add_argument(
        "--encoder-option", action="append", default=[], type=encoder_option
    )
    return parser.parse_args()


def main():
    args = parse_args()
    command = [
        args.ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        (
            f"color=c={args.source_color}:s={args.size}:"
            f"r={args.frame_rate}:d={args.duration}"
        ),
        "-frames:v",
        str(args.frames),
        "-pix_fmt",
        args.pixel_format,
        "-c:v",
        args.codec,
    ]
    for name, value in args.encoder_option:
        command.extend((f"-{name}", value))
    command.extend((
        "-color_primaries",
        args.color_primaries,
        "-color_trc",
        args.color_transfer,
        "-colorspace",
        args.color_matrix,
        "-color_range",
        args.color_range,
    ))
    if args.movflags:
        command.extend(("-movflags", args.movflags))
    command.append(str(args.output))
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
