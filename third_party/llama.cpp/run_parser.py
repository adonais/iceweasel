# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import cmakeparser as cp

import copy
import datetime
import os
import re
import subprocess

LLAMA_DIR = '.'

# This program runs after pulling a new version of the llama.cpp library,
# including all its CMakeLists.txt files, and runs the a cmake file parser, to
# generate a source file list.

def deduplicate_into(input_dict, common_key):
    sets = [set(input_dict[key]) for key in input_dict]
    common_values = set.intersection(*sets)
    input_dict[common_key] = list(common_values)
    for key in input_dict:
        if key != common_key:
            input_dict[key] = [item for item in input_dict[key] if item not in common_values]

    return input_dict

if __name__ == '__main__':
    shared_variables = {
        'CMAKE_CURRENT_SOURCE_DIR': LLAMA_DIR,
        'CMAKE_CURRENT_BINARY_DIR': 'OBJDIR',
        'CMAKE_INSTALL_PREFIX': 'INSTALLDIR',
        'CMAKE_SYSTEM_NAME': 'Linux',
        'CMAKE_SYSTEM_PROCESSOR': 'x86_64',
        'LLAMA_USE_SYSTEM_GGML': 0,
        'TARGET': 'llama',
        'ENABLE_EXAMPLES': 0,
        'ENABLE_TESTS': 0,
        'ENABLE_TOOLS': 0,
        'ENABLE_DOCS': 0,
        'ENABLE_NEON': 1,
        # Backends whose CMakeLists.txt the parser descends into, to pick up
        # their sources. This does not disable a backend: the Metal one is
        # absent because we vendor its sources without their CMakeLists.txt and
        # list them by hand in moz.build, so there is nothing here to parse.
        'MOZ_GGML_BACKENDS': "cpu"
    }

    platforms = [
        ('armv7', 'linux', 'arm', True),
        ('arm64', 'mac', 'arm64', True),
        ('generic', '', 'generic', True),
        ('x86', 'linux', 'ia32', True),
        ('x86', 'win', 'ia32', False),
        ('x86_64', 'linux', 'x64', True),
        ('x86_64', 'mac', 'x64', False),
        ('x86_64', 'win', 'x64', False),
    ]
    all_sources = dict()
    # exports aren't platform specific
    all_exports = []
    for cpu, system, arch, generate_sources in platforms:
        print('Running CMake for %s (%s)' % (cpu, system))
        variables = shared_variables.copy()

        # llama.cpp only cares about x86 and arm
        if "arm" in cpu:
          variables["GGML_SYSTEM_ARCH"] = "ARM"
        elif "x86" in cpu:
          variables["GGML_SYSTEM_ARCH"] = "x86"
        else:
          print("CPU not x86 or arm, falling back on C paths")

        if system == "mac":
          variables["APPLE"] = 1
          variables["GGML_ACCELERATE"] = 1

        cache_variables = []
        pwd = [LLAMA_DIR]
        sources = cp.parse(variables, cache_variables, pwd,
                           os.path.join(LLAMA_DIR, 'CMakeLists.txt'))

        if generate_sources:
            sources = list(set(sources))
            sources = list(filter(lambda x: x.startswith(LLAMA_DIR), sources))
            sources = list(filter(lambda x: not x.endswith('/'), sources))

            headers = list(filter(lambda x: x.endswith(".h"), sources))
            headers = list(filter(lambda x: "include" in x , headers))
            sources = list(filter(lambda x: not x.endswith(".h"), sources))
            sources = list(filter(lambda x: "//" not in x, sources))

            all_exports.extend(headers)
            all_sources["{}".format(arch.upper())] = sources

    # The Metal backend is not parsed (see MOZ_GGML_BACKENDS) but has the same
    # problem as the rename rules below: ggml-metal-device.m and
    # ggml-metal-device.cpp would compile to the same object name.
    metal_dir = os.path.join(LLAMA_DIR, 'ggml/src/ggml-metal')
    if os.path.exists(os.path.join(metal_dir, 'ggml-metal-device.m')):
        os.rename(os.path.join(metal_dir, 'ggml-metal-device.m'),
                  os.path.join(metal_dir, 'ggml-metal-device-m.m'))

    all_sources = deduplicate_into(all_sources, "COMMON")
    rename_rules = [
        ("ggml.c", "ggml-c.c"),
        ("ggml-cpu.c", "ggml-cpu-c.c"),
        ("x86/quants.c", "x86/quants-x86.c"),
        ("arm/quants.c", "arm/quants-arm.c"),
        ("x86/repack.cpp", "x86/repack-x86.cpp"),
        ("arm/repack.cpp", "arm/repack-arm.cpp"),
        ("x86/cpu-feats.c", "x86/cpu-feats-x86.c"),
        ("arm/cpu-feats.c", "arm/cpu-feats-x86.c"),
        ("models/llama.cpp", "models/model-llama.cpp"),
    ]
    for old, new in rename_rules:
      for source_class in all_sources:
        for file in all_sources[source_class]:
          if file.endswith(old):
              # rename the file in the dict, and move on disk if not already done
              renamed_path = file[:-len(old)] + new
              all_sources[source_class].remove(file)
              all_sources[source_class].append(renamed_path)
              if not os.path.exists(renamed_path):
                  os.rename(file, renamed_path)

    # Drop sources that aren't present on disk. This covers files that are
    # excluded from vendoring (e.g. src/llama-quant.cpp) but still referenced by
    # the upstream CMakeLists.txt, so they don't leak into the build. Done after
    # the rename step so renamed targets (e.g. ggml-c.c) are correctly kept.
    for source_class in all_sources:
        all_sources[source_class] = [
            f for f in all_sources[source_class] if os.path.exists(f)
        ]

    # dedup
    all_exports = list(set(all_exports))
    # normalize paths, removing `/../`
    all_exports = list(map(os.path.normpath, all_exports))

    f = open('sources.mozbuild', 'w')
    f.write('# This file is generated. Do not edit.\n\n')
    f.write('files = {\n')

    f.write('  \'EXPORTS\': [\n')
    for header in sorted(all_exports):
      f.write('    \'{}\',\n'.format(header))
    f.write('  ],\n')
    for (arch, sources) in all_sources.items():
      if len(sources) == 0:
        continue
      f.write('  \'%s_SOURCES\': [\n' % arch.upper())
      for source in sorted(sources):
          f.write('    \'%s\',\n' % source)
      f.write('  ],\n')

    print('\n')
    f.write('}\n')
    f.close()
