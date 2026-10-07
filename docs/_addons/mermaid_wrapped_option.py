# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Fail the build on a mermaid block that opens with a wrapped option value.

A mermaid diagram is drawn by the reader's browser, not by the build, so a
block mermaid cannot parse publishes its own source and nothing in the build
log says so. A block ends up that way when a directive option's value wraps:
MyST ends the option block at the first line without a leading colon, so the
continuation becomes the first line of the body and mermaid finds prose ahead
of the diagram type.

MyST keeps the continuation's indentation, and a diagram's opening line is not
indented deeper than the lines below it, so a first line indented past a later
one is the wrap. The diagram type itself is not checked: mermaid's keyword list
lives in the JavaScript the reader's browser loads, and several keywords are
ordinary words a caption can wrap onto ("graph", "info", "pie").
"""

import re
import textwrap

from sphinx.transforms.post_transforms import SphinxPostTransform
from sphinx.util import logging
from sphinxcontrib.mermaid import mermaid

logger = logging.getLogger(__name__)

# What mermaid discards before it reads the diagram type: a YAML front matter
# block, a %%{...}%% init directive, and a %% comment line. Any of them may sit
# indented ahead of the diagram, and the directive prepends a front matter
# block of its own for :title:, :config: and mermaid_config, ahead of whatever
# a wrapped option left at the top of the body.
FRONT_MATTER = re.compile(r"^-{3}\s*[\n\r].*?[\n\r]-{3}\s*[\n\r]+", re.DOTALL)
INIT_DIRECTIVE = re.compile(r"%%\{.*?\}%%\s*", re.DOTALL)
COMMENT = re.compile(r"^\s*%%(?!\{)[^\n]+\n?", re.MULTILINE)

WRAPPED_OPTION = (
    "mermaid block opens with %s, indented past the lines below it; that is a "
    "directive option's value wrapped onto a second line, and mermaid will not "
    "draw the block. Keep the value on one line or use the YAML options block "
    "(see tools/moztreedocs/docs/mermaid-integration.md)."
)


def indentation(line):
    return len(line) - len(line.lstrip(" "))


def opens_with_wrapped_option(code):
    """Whether the body's first line is indented past a line below it."""
    lines = [line for line in code.split("\n") if line.strip()]
    if not lines:
        return False
    first = indentation(lines[0])
    return any(first > indentation(line) for line in lines[1:])


class CheckWrappedOption(SphinxPostTransform):
    """Warn about a mermaid block whose body opens with a wrapped option value."""

    default_priority = 5

    def run(self, **kwargs):
        for node in self.document.findall(mermaid):
            # mermaid dedents the block before it reads it.
            code = FRONT_MATTER.sub("", textwrap.dedent(node["code"]))
            code = COMMENT.sub("", INIT_DIRECTIVE.sub("", code))
            if opens_with_wrapped_option(code):
                wrapped = next(line for line in code.split("\n") if line.strip())
                logger.warning(WRAPPED_OPTION, repr(wrapped.strip()), location=node)


def setup(app):
    app.add_post_transform(CheckWrappedOption)
    return {
        "version": "1.0",
        "parallel_read_safe": True,
        "parallel_write_safe": True,
    }
