---
name: documentation
description: Use this skill when working with Firefox documentation,
  including building documentation with `./mach doc`,
  fixing Sphinx build errors or warnings, modifying existing
  documentation, or adding new docs.
---

## Overview

Firefox documentation is built using **Sphinx**
through the `./mach doc` command. Documentation sources are distributed
throughout the repository and are written in **Markdown (`.md`)**.

The documentation system integrates:

-   Sphinx
-   MyST parser (for Markdown support, with colon fences, definition lists, field lists, and HTML admonitions enabled)
-   custom Mozilla tooling in `tools/moztreedocs/` and `docs/`

Documentation builds into static HTML that is published to **Firefox
Source Docs**.

## Core Principles

-   Always reproduce documentation issues **locally first** using
    `./mach doc --no-serve --no-open`.
-   Treat warnings seriously; they often indicate real navigation or
    reference problems.
-   Prefer **small targeted builds** while debugging.
-   Ensure new documentation is **reachable through a toctree**.
-   Keep documentation **close to the code it describes** when possible.

## Recommended Workflow

### 1. Reproduce the issue locally

Start by building the documentation locally. Redirect output to a file
rather than piping through `tail`/`grep`, since builds can be slow:

    ./mach doc --no-serve --no-open > /tmp/doc_build.txt 2>&1

Common commands:

-   `./mach doc --no-serve --no-open` -- build entire tree
-   `./mach doc <path> --no-serve --no-open` -- build a specific component (much faster)
-   `./mach doc <path>` -- build and serve with livereload for iterative writing

Useful flags:

-   `--no-autodoc` -- skip Python/JS API generation, for faster builds and to
    get past a JSDoc failure in a component you are not touching (see *API
    references from source comments*)
-   `--verbose` -- run Sphinx in verbose mode for debugging
-   `--disable-warnings-check` -- ignore unexpected warnings during local development
-   `--linkcheck` -- validate all links in the documentation
-   `-j JOBS` -- control parallel build jobs (defaults to CPU count)

Documentation output is generated under:

    obj-*/docs/html/

When debugging, prefer building only the relevant component instead of
rebuilding everything -- though `./mach doc <path>` still reads the whole tree,
so grep the log for the path rather than reading it through. `--no-autodoc` and
`--disable-warnings-check` cannot be combined; mach rejects the pair.

### 2. Identify the type of Sphinx problem

Most documentation build issues fall into these categories:

-   navigation problems (toctree)
-   broken references
-   duplicate labels
-   include directive errors
-   autodoc import failures
-   uncategorized documentation (missing from `docs/config.yml`)
-   configuration issues

The build output from `./mach doc` will normally indicate the failing
file and line. If the build crashes, Sphinx writes backtraces to
`/tmp/sphinx-err-*` files.

Always start by inspecting the referenced file and directive.

## Documentation Layout

Key locations:

Main documentation root:

    docs/

Component documentation often lives near the code, for example:

    devtools/docs/
    toolkit/docs/
    browser/docs/

Important configuration files:

-   `docs/config.yml` -- categories, allowed warnings, redirects, JS source paths
-   `docs/conf.py` -- Sphinx configuration (extensions, theme, MyST settings)

Custom Mozilla Sphinx integration:

    tools/moztreedocs/

### How documentation is discovered

The build system discovers documentation directories via `SPHINX_TREES`
variables in `moz.build` files. When adding documentation in a new
location, you must add a `SPHINX_TREES` entry in the relevant `moz.build`.

## Configuration: `docs/config.yml`

This file controls several critical aspects of the documentation build:

-   **`categories`**: Every documentation *tree* -- a `SPHINX_TREES` root, not
    a page -- must be assigned to a category, or a full build fails with an
    "Uncategorized documentation" error. A page added inside a tree that is
    already listed needs no entry, and the check runs only when the whole tree
    is built.
-   **`allowed_warnings`**: Regex patterns for known/acceptable Sphinx
    warnings. Warnings matching these patterns are logged as "KNOWN"
    instead of causing build failures. Scope a new entry to the path it is
    about: a class-wide entry silences that class tree-wide and for good, and
    the build still exits 0 with every match counted under `Known Failures`.
    One such line was hiding 216 broken links.
-   **`redirects`**: URL redirects for backward compatibility when
    documentation moves. Format: `old/path: new/path`.
-   **`js_source_paths`**: Directories where JSDoc generation is enabled
    (tree-wide JSDoc does not work).

## Adding New Documentation

Typical process:

1.  Create a `.md` file in the appropriate directory.
2.  Add the document to a parent `toctree`.
3.  Add the documentation path to the appropriate category in `docs/config.yml`.
4.  If adding docs in a new directory, ensure `SPHINX_TREES` is set in the
    relevant `moz.build` file.
5.  Follow the structure used by neighboring documentation.
6.  Build locally with:

        ./mach doc <path> --no-serve --no-open

7.  Resolve warnings before landing the change.

If the page does not appear in the generated navigation, verify that it
is included in a toctree.

When moving documentation to a new URL, add an entry to the `redirects`
section of `docs/config.yml` so old links continue to work.

## Cross-references between documents

Link to the **source file**, not to the generated URL:

-   Good: `[mots](/mots/index.md)`, `[Coding style](/code-quality/coding-style/index.md)`
-   Bad: `[mots](/mots/index.html)` -- produces
    `WARNING: 'myst' cross-reference target not found: '/mots/index.html' [myst.xref_missing]`
-   Bad: a full `https://firefox-source-docs.mozilla.org/...` URL for in-tree
    documentation -- it bypasses link validation and breaks when pages move.

The path is rooted at the documentation tree (leading `/`), and the extension
must match the actual source file (always `.md`). To link to a section, append
the anchor: `/mots/index.md#desktop-theme`.

A `{doc}` role with no link text renders the target page's *title*, so a noun
after it reads twice: ``in the {doc}`api` reference`` comes out as "in the
SessionStore API reference reference". Give the role its own text where the
sentence already names the thing.

A `{doc}` or `{ref}` target is a doc path *without* the extension -- the
opposite of the markdown form -- and a directory needs its `/index` spelled out.

### Anchors

`myst_heading_anchors = 5` anchors every heading, and the slug deletes every
character outside `[a-z0-9_-]` rather than replacing it, so it is not guessable:
`## Consistent profiles.ini` gives `#consistent-profilesini`, ``### `Optional<T>` ``
gives `#optionalt`, and `#### 8-, 16-, and 32-bit Integer Types` gives
`#8--16--and-32-bit-integer-types`. Read the anchor out of the built HTML instead
of deriving it. Most of the broken anchors in the tree are someone writing the
one they expected.

-   **Where that slug is unreadable, define the anchor.** Put `(optional-t)=`
    above the heading, with a blank line after it (rumdl MD022 wants one before
    every heading; the target still attaches through it).
-   **Two checks disagree about which anchors exist.** `{ref}` reaches an
    explicit target from any page, but a cross-document `doc.md#target` is
    validated against the target page's *heading* slugs alone and warns
    `local id not found in doc` for a label defined right above the heading.
    A `path#anchor` link needs the heading slug; use `{ref}` when the readable
    name matters more.
-   **A generated id is invisible to that check too.** sphinx-js writes
    `id="BrowserTestUtils.withNewTab"`, so linking it works in a browser and
    warns anyway. Use ``{js:meth}`BrowserTestUtils.withNewTab` ``.

Pages converted from the MDN wiki (`docs/nspr/`, `devtools/docs/user/`,
`security/nss/`) carry link shapes MyST cannot resolve: bare wiki page names,
`/en-US/docs/` prefixes, percent-escaped names (`I%2FO_Types`), wiki anchors
(`#Directory_I.2FO_Functions`). Each maps to an in-tree `.md` plus a heading
slug, so match them in bulk by lowercasing both sides and dropping every
non-alphanumeric character. Where the target page was never converted, name the
thing rather than link to it, citing source with `{searchfox}`.

### `eval-rst`

An `eval-rst` block is a nested parse, so rST substitution definitions do not
survive it: `.. |icon| image::` and the `|icon|` using it can sit in the same
block and still fail with `Undefined substitution referenced`. The
`substitution` extension is off, so frontmatter `{{ name }}` is no way out
either. Write the block as a native MyST directive -- `{list-table}` and most
others work as a MyST fence with markdown content, images included.

### Generated pages

`testing/perfdocs/generated/` is committed and rewritten wholesale: edit the
owning component's `perfdocs/` source, then `./mach perfdocs --generate`, and
commit both. A page built by a `docs/_addons/` extension has to be fixed in the
extension.

## API references from source comments

A directory listed in `js_source_paths` has its JSDoc rendered as an API
reference (`js:autoclass`, `js:autofunction`), which sphinx-js generates by
running jsdoc over the source. The comment then has more than one reader, and
they do not agree:

-   **Descriptions render as reStructuredText.** The `[text](/path/index.md)`
    form used elsewhere comes out literally, with only the bare URL autolinked.
    Write the link as a role instead:

        :doc:`Places </browser/places/index>`

    A single backtick is the `title-reference` role, so `` `forceForeground` ``
    comes out as italic prose; code needs double backticks. `|name|` is a
    substitution reference, and an undefined one fails the build rather than
    warning.
-   **A `@param` description renders as one paragraph.** sphinx-js replaces every
    newline in one with a space, so a list or a heading written inside a
    parameter's description arrives glued to the parameter above it. Structure
    belongs in the function's own description, which keeps it.
-   **A JSDoc failure anywhere aborts every build.** `conf.py` hands sphinx-js
    the whole `js_source_paths` list whatever directory `./mach doc` was pointed
    at, so an aborting error names a file the change never touched and scoping
    the build does not avoid it. `--no-autodoc` builds the page anyway, with the
    generated API pages missing and `js:autoclass` warning as an unknown
    directive.
-   **jsdoc rejects type expressions that TypeScript accepts, and does it
    quietly.** A type predicate (`{element is MozTabbrowserTab}`), a tuple,
    indexed access, and a postfix `[]` on a parenthesised union (`{(A|B)[]}`)
    each log a build ERROR while the member still renders -- without the row for
    the parameter or return value being documented. Write `{Array<A|B>}` for the
    last of those, and put a predicate's meaning in the summary line.
    Indexed access (`{Foo['id']}`) has no spelling jsdoc accepts, whatever the
    quoting, so a derived type needs a named `@typedef` alias beside the one it
    derives from.
-   **A documented default value renders**, so `[options.animate=true]` is a
    claim about the code. Write one only where the signature supplies that
    default, and describe a computed default in the prose instead, where it can
    be kept accurate.
-   **A destructured parameter's documented name is printed in front of every
    property under it**, so the name a comment invents for an options bag is
    part of the rendered API rather than a local choice.
-   **`@throws` renders** as a `throws` field carrying its type. On a class,
    though, `js:autoclass` takes parameters, return values and exceptions from
    the constructor only, so those tags render nowhere from the class's own
    comment.

## Mermaid diagrams

`sphinxcontrib.mermaid` is enabled, so a fenced `mermaid` block becomes a
diagram. Sphinx only writes the diagram source into the page and mermaid renders
it in the browser from a CDN. `tools/moztreedocs/docs/mermaid-integration.md`
describes the directive and how a diagram renders.

Besides mermaid's own diagram types, a block that starts with `zenuml` draws a
ZenUML sequence diagram. It suits a call flow whose calls nest, such as a method
that calls into other objects before it returns: the source is written like
code, `A->B.method(arg) { B->C.other() return value }`, and a nested call is
drawn inside the activation of the call that made it, where `sequenceDiagram`
lists messages one after another and leaves the nesting to the reader. That page
has a rendered example.

Worth knowing:

-   **A mermaid block always builds.** `./mach doc` succeeding says nothing about
    the diagram, since nothing has drawn it yet -- every failure below is
    invisible until the built page is open in a browser.
-   **A diagram renders at its intrinsic size.** One narrower than the column is
    centered in it, caption included, so the `:align:` option is redundant. One
    wider than the column scrolls inside its own box, where an edge fade shows
    that it continues. Its labels keep the size every other diagram's have, so
    pick the direction the content reads in rather than the one that fits:
    `flowchart LR` and `sequenceDiagram` cost no legibility at a width the
    column cannot hold. A reader still has to scroll for whatever sits past the
    column.
-   **A label holding a long unbroken word renders as an empty box in Firefox**
    (mermaid#5785), which a `wrappingWidth` config block in the diagram's
    frontmatter works around.
-   **A label starting with `1. ` renders as `Unsupported markdown: list`**,
    because mermaid parses labels as markdown. A colon in place of the period
    avoids it.
-   **A diagram follows the page's color scheme.** A `classDef` or `style` that
    hardcodes a `fill` keeps that color in both schemes, so it needs an explicit
    `color:` as well, or the theme's label color lands on it and comes out grey on
    a light fill in dark mode. That page has the color rules, including what the
    unstyled default fill means for prose that points at a node by color.
-   **A ZenUML diagram is inverted in the dark scheme**, because its plugin
    ignores the theme and draws black on transparent. Avoid colors a
    light-to-dark inversion would misrepresent.
-   **Do not distinguish two kinds of node by fill color alone**: it fails for
    readers with a color vision deficiency and on poor displays. Vary the shape as
    well -- a stadium `(["text"])` reads clearly against a plain `["text"]`,
    while a rounded rectangle `("text")` is too close to it. `classDef` accepts
    `rx` and `ry` for a radius in between, but only with a unit: `rx:14` is
    silently ignored, `rx:14px` applies.
-   **Directive options have to be contiguous**, immediately under the opening
    fence. A blank line between two of them ends the option block, and the rest
    then render as diagram source.

## Best Practices

-   Always build documentation locally before pushing.
-   For a docs-only change, name the linters that apply:
    `./mach lint -l codespell -l file-whitespace -l trojan-source <path>`.
    A bare `./mach lint <path>` exits non-zero with failures from linters that
    have nothing to check in a `.md` file, which reads as though the change
    broke something.
-   Resolve warnings before landing documentation changes.
-   Keep documentation near the code it describes when appropriate.
-   Prefer `literalinclude` for code examples instead of copying code.
-   When debugging large documentation changes, build only the affected
    component.
-   Use `--no-autodoc` for faster iteration when not working on API docs.
-   If a new warning appears that is expected/acceptable, add a pattern
    to `allowed_warnings` in `docs/config.yml`.
