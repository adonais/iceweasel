# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""`mach sbom` and `mach licenses`, the two readers of the LICENSES declarations.

Both run in the `build` site, which is where the SBOM's cyclonedx and the
page's mako live, because the build generates both artifacts too: `mach sbom`
shares its implementation with the `generate_sbom` py_action, and `mach
licenses` shares gen_license_html.py with the GENERATED_FILES entry that writes
about:license.
"""

import os
import sys

from mach.decorators import Command, CommandArgument


@Command(
    "sbom",
    category="build",
    virtualenv_name="build",
    description="Generate a CycloneDX software bill of materials for the tree.",
)
@CommandArgument(
    "-o",
    "--output",
    default=None,
    help="Write the SBOM here instead of stdout.",
)
@CommandArgument(
    "--version",
    default=None,
    help="Version to record for the product itself. Defaults to the "
    "configuration's MOZ_APP_VERSION_DISPLAY, or to "
    "browser/config/version_display.txt in an unconfigured tree.",
)
@CommandArgument(
    "--product-name",
    default=None,
    help="Name to record for the product itself. Defaults to the "
    "configuration's MOZ_APP_BASENAME, or to Firefox in an unconfigured tree.",
)
@CommandArgument(
    "--strict",
    action="store_true",
    default=False,
    help="Exit non-zero if any moz.yaml fails to load.",
)
def sbom(command_context, output, version, product_name, strict):
    from mozbuild.action.generate_sbom import generate
    from mozbuild.base import BuildEnvironmentNotFoundException

    command_context.populate_logger()
    command_context.log_manager.enable_unstructured()

    # The shippable builds that generate an SBOM include GeckoView and
    # comm-central, so the root component describes whatever this configuration
    # actually builds. An unconfigured tree has no answer and assumes desktop.
    try:
        substs = command_context.substs
    except BuildEnvironmentNotFoundException:
        substs = {}

    return generate(
        command_context.topsrcdir,
        command_context.topobjdir,
        command_context.repository,
        substs=substs,
        output=output,
        version=version,
        product_name=product_name,
        strict=strict,
    )


@Command(
    "licenses",
    category="build",
    virtualenv_name="build",
    description="Render about:license from the tree's LICENSES declarations, "
    "without a full build. Requires a configured tree.",
)
@CommandArgument(
    "-o",
    "--output",
    default=None,
    help="Write the page here instead of stdout.",
)
def licenses(command_context, output):
    import mozpack.path as mozpath

    from mozbuild.base import BuildEnvironmentNotFoundException
    from mozbuild.licenses import LicenseCollection, LicenseError, app_license_blocks
    from mozbuild.licenses import from_context as licenses_from_context

    command_context.populate_logger()
    command_context.log_manager.enable_unstructured()

    # The page depends on the configuration: which directories are traversed
    # decides which notices exist, and the template reads substs. An
    # unconfigured tree can only produce a subset, so ask for a configured one
    # rather than render a page that is quietly incomplete. Only ./mach
    # configure is needed, not a build.
    try:
        config = command_context.config_environment
        reader = command_context.mozbuild_reader(config_mode="build")
    except BuildEnvironmentNotFoundException:
        print(
            "This tree is not configured. Run ./mach configure first; "
            "no build is needed beyond that.",
            file=sys.stderr,
        )
        return 1
    substs = config.substs

    # The page Firefox ships is the application's copy, not the shared one:
    # browser/base splices the Mozilla binaries notice in and overrides
    # chrome://global/content/license.html with the result. Render that copy,
    # taking the blocks from the application's own GENERATED_FILES entry.
    app_dir = substs.get("MOZ_BUILD_APP")

    collection = LicenseCollection()
    blocks = []
    try:
        for context in reader.read_topsrcdir():
            for obj in licenses_from_context(context):
                collection.add(obj)
            if app_dir and mozpath.basedir(context.relsrcdir, [app_dir]):
                blocks.extend(app_license_blocks(context))
        records = collection.records()
    except LicenseError as error:
        print(str(error), file=sys.stderr)
        return 1

    sys.path.append(os.path.join(command_context.topsrcdir, "toolkit", "content"))
    from gen_license_html import read_blocks, render

    document = render(
        os.path.join(
            command_context.topsrcdir, "toolkit", "content", "license.html.mako"
        ),
        records,
        substs,
        read_blocks(blocks),
    )

    if output:
        with open(output, "w", encoding="utf-8", newline="\n") as output_file:
            output_file.write(document)
        print(f"Wrote {len(records)} licenses to {output}.", file=sys.stderr)
    else:
        sys.stdout.write(document)

    return 0
