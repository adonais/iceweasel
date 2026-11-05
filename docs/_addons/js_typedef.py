# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Sphinx extension that adds a ``js:autotypedef`` directive, which shows the
properties of one or more JSDoc typedefs as a single table.
"""

import re
from os.path import join, relpath

from docutils import nodes
from docutils.parsers.rst import Directive
from sphinx_js.parsers import PathVisitor, path_and_formal_params
from sphinx_js.suffix_tree import SuffixAmbiguous, SuffixNotFound

HEADERS = ("Property", "Type", "Required", "Description")
COLUMN_WIDTHS = (2, 2, 1, 5)


def lookup_typedef(analyzer, name):
    """Returns the jsdoc doclet for the typedef with the given name."""
    path = PathVisitor().visit(path_and_formal_params["path"].parse(name))
    doclet = analyzer._doclets_by_path.get(path)
    if doclet.get("kind") != "typedef":
        raise SuffixNotFound(path)
    return doclet


def format_type(prop):
    """Returns the property's type as text, such as ``string[]``."""
    names = prop.get("type", {}).get("names", [])
    return " | ".join(
        re.sub(r"^Array\.<(.+)>$", r"\1[]", n).replace(".<", "<") for n in names
    )


def make_row(cells):
    """Returns a table row with one entry per list of inline nodes."""
    row = nodes.row()
    for cell in cells:
        row += nodes.entry("", nodes.paragraph("", "", *cell))
    return row


class AutoTypedefDirective(Directive):
    required_arguments = 1
    optional_arguments = 10

    def run(self):
        env = self.state.document.settings.env
        analyzer = env.app._sphinxjs_analyzer

        props = []
        for name in self.arguments:
            try:
                doclet = lookup_typedef(analyzer, name)
            except (SuffixNotFound, SuffixAmbiguous):
                raise self.error(f"No unique JSDoc typedef named {name!r} was found.")
            meta = doclet["meta"]
            env.note_dependency(
                relpath(join(meta["path"], meta["filename"]), env.app.srcdir)
            )
            props.extend(doclet.get("properties", []))

        tgroup = nodes.tgroup(cols=len(HEADERS))
        for width in COLUMN_WIDTHS:
            tgroup += nodes.colspec(colwidth=width)
        tgroup += nodes.thead("", make_row([[nodes.Text(h)] for h in HEADERS]))
        tbody = nodes.tbody()
        messages = []
        for prop in props:
            type_text = format_type(prop)
            description = " ".join(prop.get("description", "").split())
            description_nodes, description_messages = self.state.inline_text(
                description, self.lineno
            )
            messages.extend(description_messages)
            tbody += make_row([
                [nodes.literal(prop["name"], prop["name"])],
                [nodes.literal(type_text, type_text)],
                [nodes.Text("no" if prop.get("optional") else "yes")],
                description_nodes,
            ])
        tgroup += tbody
        return [nodes.table("", tgroup), *messages]


def setup(app):
    app.add_directive_to_domain("js", "autotypedef", AutoTypedefDirective)
    return {"parallel_read_safe": True}
