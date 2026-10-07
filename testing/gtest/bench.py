#!/usr/bin/env python3

import json
import re
import statistics
import subprocess
import sys

# `mach gtest` routes process output through MachFormatter, which prefixes each
# line with a timestamp and the process name, so match anywhere in the line.
PERFHERDER_MATCHER = re.compile(rb"PERFHERDER_DATA:\s*(\{.*\})\s*$")

proc = subprocess.Popen(["./mach", "gtest", sys.argv[1]], stdout=subprocess.PIPE)
for line in proc.stdout:
    match = PERFHERDER_MATCHER.search(line)
    if match:
        data = json.loads(match.group(1).decode("utf8"))
        for suite in data["suites"]:
            for subtest in suite["subtests"]:
                replicates = subtest["replicates"]
                # A single replicate has no deviation to report.
                deviation = (
                    "± %6.3f" % (statistics.stdev(replicates) / 1000)
                    if len(replicates) > 1
                    else " " * 8
                )
                # pylint --py3k W1619
                print(
                    "%4d.%03d %s ms    %s.%s"
                    % (
                        subtest["value"] / 1000.0,
                        subtest["value"] % 1000,
                        deviation,
                        suite["name"],
                        subtest["name"],
                    )
                )
