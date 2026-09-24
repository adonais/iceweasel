# This file contains dependencies for WebRTC.

gclient_gn_args_file = 'src/build/config/gclient_args.gni'
gclient_gn_args = [
  'android_ndk_version',
  'generate_location_tags',
]

vars = {
  # Keep the Chromium default for these gn args.
  'generate_location_tags': True,
  'android_ndk_version': Str('2@30.0.15729638'),

  # By default, we should check out everything needed to run on the main
  # chromium waterfalls. More info at: crbug.com/570091.
  'checkout_configuration': 'default',
  'checkout_instrumented_libraries': 'checkout_linux and checkout_configuration == "default"',
  'chromium_revision': '86ca5f98b6f3b4f9241de7c163c2bab0e412ce4b',

  # Fetch the prebuilt binaries for llvm-cov and llvm-profdata. Needed to
  # process the raw profiles produced by instrumented targets (built with
  # the gn arg 'use_clang_coverage').
  'checkout_clang_coverage_tools': False,

  # Fetch clangd into the same bin/ directory as our clang binary.
  'checkout_clangd': False,

  # Fetch clang-tidy into the same bin/ directory as our clang binary.
  'checkout_clang_tidy': False,

  'chromium_git': 'https://chromium.googlesource.com',

  # ResultDB version
  'result_adapter_revision': 'git_revision:5fb3ca203842fd691cab615453f8e5a14302a1d8',

  # By default, download the fuchsia sdk from the public sdk directory.
  'fuchsia_sdk_cipd_prefix': 'fuchsia/sdk/core/',
  'fuchsia_version': 'version:33.20260807.3.1',
  # By default, download the fuchsia images from the fuchsia GCS bucket.
  'fuchsia_images_bucket': 'fuchsia',
  'checkout_fuchsia': False,
  # Since the images are hundreds of MB, default to only downloading the image
  # most commonly useful for developers. Bots and developers that need to use
  # other images can override this with additional images.
  'checkout_fuchsia_boot_images': "terminal.x64",
  'checkout_fuchsia_product_bundles': '"{checkout_fuchsia_boot_images}" != ""',

  # Fetch configuration files required for the 'use_remoteexec' gn arg
  'download_remoteexec_cfg': False,
  # RBE instance to use for running remote builds
  'rbe_instance': 'projects/rbe-webrtc-developer/instances/default_instance',
  # reclient CIPD package version
  'reclient_version': 're_client_version:0.185.0.db415f21-gomaip',
  # siso CIPD package version.
  'siso_version': 'git_revision:1b1109fc6f5e177a439a195b87931224efc7a007',

  # CPython 3 CIPD package version for Siso hermetic toolchain.
  'cpython3_version': 'version:3@3.11.9.chromium.38',

  # ninja CIPD package.
  'ninja_package': 'infra/3pp/tools/ninja/',

  # ninja CIPD package version
  # https://chrome-infra-packages.appspot.com/p/infra/3pp/tools/ninja
  'ninja_version': 'version:3@1.12.1.chromium.4',

  # condition to allowlist deps for non-git-source processing.
  'non_git_source': 'True',

  # This can be overridden, e.g. with custom_vars, to build clang from HEAD
  # instead of downloading the prebuilt pinned revision.
  'llvm_force_head_revision': False,
}

deps = {
  'src/build':
    'https://chromium.googlesource.com/chromium/src/build@ebfc64fde3cf560be80ae9180b6784f7399db34e',
  'src/buildtools':
    'https://chromium.googlesource.com/chromium/src/buildtools@4277578aa9c45906e51ad33cac1a5a7ad5288010',
  # Gradle 6.6.1. Used for testing Android Studio project generation for WebRTC.
  'src/examples/androidtests/third_party/gradle': {
    'url': 'https://chromium.googlesource.com/external/github.com/gradle/gradle.git@f2d1fb54a951d8b11d25748e4711bec8d128d7e3',
    'condition': 'checkout_android',
  },
  'src/ios': {
    'url': 'https://chromium.googlesource.com/chromium/src/ios@3a8dca68590f06462802c7f49a7a1ffd29432cd3',
    'condition': 'checkout_ios',
  },
  'src/testing':
    'https://chromium.googlesource.com/chromium/src/testing@ea54baee6d6e445f69276db442427b13c7476e4b',
  'src/third_party':
    'https://chromium.googlesource.com/chromium/src/third_party@6f91a5f7827c7a38f3e2988a05490c751b3f1c16',

  'src/buildtools/third_party/mold/cipd': {
      'packages': [
          {
              'package': 'chromium/buildtools/third_party/mold/mold',
              'version': 'w9QqZ-oP3GovA-zjOawYzb5yca-t47GbT-ejPa0BQmYC',
          },
      ],
      'condition': 'host_os == "linux" and non_git_source',
      'dep_type': 'cipd',
  },
  'src/buildtools/linux64': {
    'packages': [
      {
        'package': 'gn/gn/linux-${{arch}}',
        'version': 'git_revision:0db00fc0fb75adf816104951b415769a087144c1',
      }
    ],
    'dep_type': 'cipd',
    'condition': 'checkout_linux',
  },
  'src/buildtools/mac': {
    'packages': [
      {
        'package': 'gn/gn/mac-${{arch}}',
        'version': 'git_revision:0db00fc0fb75adf816104951b415769a087144c1',
      }
    ],
    'dep_type': 'cipd',
    'condition': 'checkout_mac',
  },
  'src/buildtools/win': {
    'packages': [
      {
        'package': 'gn/gn/windows-amd64',
        'version': 'git_revision:0db00fc0fb75adf816104951b415769a087144c1',
      }
    ],
    'dep_type': 'cipd',
    'condition': 'checkout_win',
  },
  'src/buildtools/reclient': {
    'packages': [
      {
         # https://chrome-infra-packages.appspot.com/p/infra/rbe/client/
        'package': 'infra/rbe/client/${{platform}}',
        'version': Var('reclient_version'),
      }
    ],
    'dep_type': 'cipd',
    # Reclient doesn't have linux-arm64 package.
    'condition': 'not (host_os == "linux" and host_cpu == "arm64")',
  },

  'src/third_party/llvm-build/Release+Asserts': {
    'dep_type': 'gcs',
    'bucket': 'chromium-browser-clang',
    'condition': 'not llvm_force_head_revision',
    'objects': [
      {
        'object_name': 'Linux_x64/clang-android-runtime-library-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '1dc5bf865a3a48dd820fa8959b83c8662575d25465381803fae82427d176ba77',
        'size_bytes': 2794136,
        'generation': 1786633521996048,
        'condition': 'checkout_android and not host_os == "linux" and non_git_source',
      },
      {
        'object_name': 'Linux_x64/clang-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'a1f881d528ffd8f67a752cdcbad35595dafcf89c177b33931ec2c802280392e1',
        'size_bytes': 59089400,
        'generation': 1786390305354286,
        'condition': '(host_os == "linux" or checkout_android) and non_git_source',
      },
      {
        'object_name': 'Linux_x64/clang-tidy-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'c0e665f4d63b42291a20f5481a93b34c885933a690d0e7d747b4099074d12146',
        'size_bytes': 14797328,
        'generation': 1786390305263025,
        'condition': 'host_os == "linux" and checkout_clang_tidy and non_git_source',
      },
      {
        'object_name': 'Linux_x64/clangd-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '86447305dc8cfeb45f80bba480db291ca234d48d05b56136a53558336fed50d3',
        'size_bytes': 14993900,
        'generation': 1786390306070051,
        'condition': 'host_os == "linux" and checkout_clangd and non_git_source',
      },
      {
        'object_name': 'Linux_x64/llvm-code-coverage-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'a0e2f931acb3bd777af1e197ef907661a04f1e583529b11dd15ca59ba798e76d',
        'size_bytes': 2333820,
        'generation': 1786390305912404,
        'condition': 'host_os == "linux" and checkout_clang_coverage_tools and non_git_source',
      },
      {
        'object_name': 'Linux_x64/llvmobjdump-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '928bc85ad8fbfd4c3c1b93cd47d7ecc9e8d0faae175e49751c4b7240a4f75ec0',
        'size_bytes': 5866152,
        'generation': 1786390305401791,
        'condition': '((checkout_linux or checkout_mac or checkout_android) and host_os == "linux") and non_git_source',
      },
      {
        'object_name': 'Mac/clang-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '901eb99d9766dcf19fff0b64ea09a5086abdae9f90c514a76adfed13f4ea8777',
        'size_bytes': 56100256,
        'generation': 1786390354835895,
        'condition': 'host_os == "mac" and host_cpu == "x64"',
      },
      {
        'object_name': 'Mac/clang-mac-runtime-library-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '7aeadcc772941c30f1b12f8653caf287e76f5ebae861b1f69561617633a3f32e',
        'size_bytes': 1012476,
        'generation': 1786390363998086,
        'condition': 'checkout_mac and not host_os == "mac"',
      },
      {
        'object_name': 'Mac/clang-tidy-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '9654446671d4f506eea68db567bd5916385d543bcad26978ea6c1a55fb147589',
        'size_bytes': 14768472,
        'generation': 1786390354788041,
        'condition': 'host_os == "mac" and host_cpu == "x64" and checkout_clang_tidy',
      },
      {
        'object_name': 'Mac/clangd-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'e2dcd1041842953f8e602c8ff40e596a4294ec450377edf9744dc93b7a83e14e',
        'size_bytes': 16717172,
        'generation': 1786390354901016,
        'condition': 'host_os == "mac" and host_cpu == "x64" and checkout_clangd',
      },
      {
        'object_name': 'Mac/llvm-code-coverage-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'f5b78d9d5ec0114ab36728207b00cd1a391f8e9856c44272a3c2009f9b3be81a',
        'size_bytes': 2372120,
        'generation': 1786390355109895,
        'condition': 'host_os == "mac" and host_cpu == "x64" and checkout_clang_coverage_tools',
      },
      {
        'object_name': 'Mac/llvmobjdump-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '7f47505e1e68e70522693b48e64568bc6429760daaa6cdaa53deb6b96885d99a',
        'size_bytes': 5788736,
        'generation': 1786390354950388,
        'condition': 'host_os == "mac" and host_cpu == "x64"',
      },
      {
        'object_name': 'Mac_arm64/clang-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '37e223301868377fe5f3c7a579ea03ffdcea2f9e7b1a2a34eb83399f0ae2c512',
        'size_bytes': 47023376,
        'generation': 1786390365739255,
        'condition': 'host_os == "mac" and host_cpu == "arm64"',
      },
      {
        'object_name': 'Mac_arm64/clang-tidy-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '8a2f0e4287d496c25e83e808c172447d0e35019cf2941b4a7f12f88567cee190',
        'size_bytes': 12836140,
        'generation': 1786390366046581,
        'condition': 'host_os == "mac" and host_cpu == "arm64" and checkout_clang_tidy',
      },
      {
        'object_name': 'Mac_arm64/clangd-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '922b919f69f4c02f5604ee6a253f788c93a451cf2870d6e7f6b6df7e5d7284c2',
        'size_bytes': 13210924,
        'generation': 1786390365746094,
        'condition': 'host_os == "mac" and host_cpu == "arm64" and checkout_clangd',
      },
      {
        'object_name': 'Mac_arm64/llvm-code-coverage-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '2cef00a8f1c243733f1e245b11e5c4959e3b50698877cbca66aaad3f99ed8a67',
        'size_bytes': 1998688,
        'generation': 1786390366121342,
        'condition': 'host_os == "mac" and host_cpu == "arm64" and checkout_clang_coverage_tools',
      },
      {
        'object_name': 'Mac_arm64/llvmobjdump-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '6e8a6bb1cf03caa209c2886dfc125fc345dd2f37be62697cccf2520a7b7a40b3',
        'size_bytes': 5550844,
        'generation': 1786390365844453,
        'condition': 'host_os == "mac" and host_cpu == "arm64"',
      },
      {
        'object_name': 'Win/clang-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '8d05e0bf6cd31580e457ceddbbf249f73e1d0a784e96d3101495b28a4833904e',
        'size_bytes': 51331748,
        'generation': 1786390377451813,
        'condition': 'host_os == "win"',
      },
      {
        'object_name': 'Win/clang-tidy-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'd96ae3c51cca7e12d4ff69c4682005c61679089760cb81ce0221687263d4f33a',
        'size_bytes': 14872220,
        'generation': 1786390377426022,
        'condition': 'host_os == "win" and checkout_clang_tidy',
      },
      {
        'object_name': 'Win/clang-win-runtime-library-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'f566902e3aee25f1fee8453ed94346c083d945805c70fe08e260d59f85d1ca4c',
        'size_bytes': 2624040,
        'generation': 1786390387233853,
        'condition': 'checkout_win and not host_os == "win"',
      },
      {
        'object_name': 'Win/clangd-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '95f5ad8d78a5b7434e81a2c56b6713971bd4421653c5490b3f3b0e33cd35961a',
        'size_bytes': 15290124,
        'generation': 1786390377521098,
        'condition': 'host_os == "win" and checkout_clangd',
      },
      {
        'object_name': 'Win/llvm-code-coverage-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': '122bedbd458486dfeed26fe7105f55edc790f824e468c74020cc452288b9a850',
        'size_bytes': 2498620,
        'generation': 1786390377688945,
        'condition': 'host_os == "win" and checkout_clang_coverage_tools',
      },
      {
        'object_name': 'Win/llvmobjdump-llvmorg-23-init-19482-g53d18800-22.tar.xz',
        'sha256sum': 'b17c653377bf9134c3bf6ad37aab55b19a196957e8faa5a233c56d8c3879b67e',
        'size_bytes': 5940572,
        'generation': 1786390377464835,
        'condition': '(checkout_linux or checkout_mac or checkout_android) and host_os == "win"',
      },
    ]
  },

  # Update prebuilt Rust toolchain.
  'src/third_party/rust-toolchain': {
    'dep_type': 'gcs',
    'bucket': 'chromium-browser-clang',
    'objects': [
      {
        'object_name': 'Linux_x64/rust-toolchain-b998449636a48e2c4a362809085b600a0174e1f2-6-llvmorg-23-init-19482-g53d18800.tar.xz',
        'sha256sum': 'fa341a74b1567fe57af21aa7bccbdf3c0ec3b704fbb01829763faa5292eb4ddd',
        'size_bytes': 274829308,
        'generation': 1785459300476581,
        'condition': 'host_os == "linux" and non_git_source',
      },
      {
        'object_name': 'Mac/rust-toolchain-b998449636a48e2c4a362809085b600a0174e1f2-6-llvmorg-23-init-19482-g53d18800.tar.xz',
        'sha256sum': 'd256ca6d43eb8131d78cd908dbc8b07e59acb67902497de324c60b85a6d94635',
        'size_bytes': 262354296,
        'generation': 1785459303542909,
        'condition': 'host_os == "mac" and host_cpu == "x64"',
      },
      {
        'object_name': 'Mac_arm64/rust-toolchain-b998449636a48e2c4a362809085b600a0174e1f2-6-llvmorg-23-init-19482-g53d18800.tar.xz',
        'sha256sum': 'a23256540cd7c7c8668abdf4044f2ecc905881089a6b0ca6346a94a97887cc77',
        'size_bytes': 246808776,
        'generation': 1785459306444750,
        'condition': 'host_os == "mac" and host_cpu == "arm64"',
      },
      {
        'object_name': 'Win/rust-toolchain-b998449636a48e2c4a362809085b600a0174e1f2-6-llvmorg-23-init-19482-g53d18800.tar.xz',
        'sha256sum': '57272886008b441fa229d2e9997b185fa5670bca7cf1f338a77a07d9bcc8eb49',
        'size_bytes': 416157244,
        'generation': 1785459309430367,
        'condition': 'host_os == "win"',
      },
    ],
  },

  'src/third_party/clang-format/script':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/clang/tools/clang-format.git@70510081984cfcdb14a15b3e08dfe9776dc7ed37',
  'src/third_party/compiler-rt/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/compiler-rt.git@6c2fdc89a3580fc75aed2b7d12c9534e00b7a707',
  'src/third_party/libc++/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libcxx.git@97b436da4c33663581d394f4ee0a5977fc38c2f4',
  'src/third_party/libc++abi/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libcxxabi.git@4052ed6c715d30ffc0c192eb87021127f757f420',
  'src/third_party/llvm-libc/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libc.git@3df364065fd924271c84b4c57b08580641fc2a3c',
  'src/third_party/libunwind/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libunwind.git@0790de42df7835816d95ce62c598f9fef5ef4e6c',

  'src/third_party/test_fonts/test_fonts': {
      'dep_type': 'gcs',
      'condition': 'non_git_source',
      'bucket': 'chromium-fonts',
      'objects': [
          {
              'object_name': '9c07d19d9c5ee1ff94f717e6fb17e0c8c354e6f9',
              'sha256sum': 'f0e9628f9e43e3f3476cde06a1849058de460e0e037b7449ce0d42b9a73c37d5',
              'size_bytes': 33413117,
              'generation': 1775663926405386,
          },
      ],
  },

  'src/third_party/ninja': {
    'packages': [
      {
        'package': Var('ninja_package') + '${{platform}}',
        'version': Var('ninja_version'),
      }
    ],
    'condition': 'non_git_source',
    'dep_type': 'cipd',
  },

  'src/third_party/siso/cipd': {
    'packages': [
      {
        'package': 'build/siso/${{platform}}',
        'version': Var('siso_version'),
      }
    ],
    'condition': 'non_git_source',
    'dep_type': 'cipd',
  },

  'src/third_party/android_system_sdk/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/android_system_sdk/public',
              'version': 'EpgkrtsLblLuw0BrsWCF0h_njBzIZsBNDxQ5VtA4s2UC',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/tools/resultdb': {
    'packages': [
      {
        'package': 'infra/tools/result_adapter/${{platform}}',
        'version': Var('result_adapter_revision'),
      },
    ],
    'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/aapt2/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/android_build_tools/aapt2',
              'version': '7tEuuB92wV8xh54fCO0bRk_6FS_7XtsBl9LB5Tf5d0AC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/bundletool/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/bundletool',
               'version': '7Vo6ZzIxIaC51ATTBlo_KUkgxJCmmGmXAijlVkXUTpAC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/dagger_compiler/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/dagger_compiler',
               'version': 'AC0DoTEXQf40KFt7hyCNSEJPrT9Rprw9zsZxNKdw7BQC',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/error_prone/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/error_prone',
               'version': 'dhc5vwmioo6wmCV30TTdDSRPWJKiCOSQNQtjDGJN4VwC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/error_prone_javac/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/error_prone_javac',
               'version': '7EcHxlEXEaLRWEyHIAxf0ouPjkmN1Od6jkutuo0sfBIC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/lint/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/lint',
               'version': 'QVVIKC8wQbdvy2ZiDFLBepER-Axq-_rc_Qd9u6jaRVcC',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },


  'src/third_party/android_build_tools/nullaway/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/nullaway',
               'version': 'ds9Vm6LkQNc9O9nuG0_FbrsNQ5VoGPpFIWKur53l3wUC',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/aosp_dalvik/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/aosp_dalvik/linux-amd64',
              'version': 'version:2@13.0.0_r24.cr1',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/boringssl/src':
    'https://boringssl.googlesource.com/boringssl.git@3c31f33f61cdb22e48437c4347d17c6cebab1506',
  'src/third_party/breakpad/breakpad':
    'https://chromium.googlesource.com/breakpad/breakpad.git@418aacd617897c19d960ec3e649f42ea95a6363a',
  'src/third_party/catapult':
    'https://chromium.googlesource.com/catapult.git@1d18f6e11082de030c45fd55b556d15e3aa628a8',
  'src/third_party/ced/src': {
    'url': 'https://chromium.googlesource.com/external/github.com/google/compact_enc_det.git@d127078cedef9c6642cbe592dacdd2292b50bb19',
  },
  'src/third_party/colorama/src':
    'https://chromium.googlesource.com/external/colorama.git@3de9f013df4b470069d03d250224062e8cf15c49',
  'src/third_party/cpu_features/src': {
    'url': 'https://chromium.googlesource.com/external/github.com/google/cpu_features.git@81d13c49649f0714dd41fb56bb246398b6584085',
    'condition': 'checkout_android',
  },
  'src/third_party/crc32c/src':
    'https://chromium.googlesource.com/external/github.com/google/crc32c.git@2bbb3be42e20a0e6c0f7b39dc07dc863d9ffbc07',
  'src/third_party/depot_tools':
    'https://chromium.googlesource.com/chromium/tools/depot_tools.git@8906f98462ad0a0d8250236059e23fe6d27c7318',
  'src/third_party/ffmpeg':
    'https://chromium.googlesource.com/chromium/third_party/ffmpeg.git@53fa34a23be9054d25ac2500dbdae9a0e570bb5c',
  'src/third_party/flatbuffers/src':
    'https://chromium.googlesource.com/external/github.com/google/flatbuffers.git@a86afae9399bbe631d1ea0783f8816e780e236cc',
  'src/third_party/grpc/src': {
    'url': 'https://chromium.googlesource.com/external/github.com/grpc/grpc.git@ecd5429314f4639651216548b9c6fa1bca3d98ca',
  },
  # Used for embedded builds. CrOS & Linux use the system version.
  'src/third_party/fontconfig/src': {
      'url': 'https://chromium.googlesource.com/external/fontconfig.git@b707078e6e8bb6fd115e2080e69b3194c05e4f1c',
      'condition': 'checkout_linux',
  },
  'src/third_party/freetype/src':
    'https://chromium.googlesource.com/chromium/src/third_party/freetype2.git@9e9d3b73f31367dbb4261f93c727a277f6632c77',
  'src/third_party/harfbuzz/src':
    'https://chromium.googlesource.com/external/github.com/harfbuzz/harfbuzz.git@7a2a501c2e3a5c23419bb797f2c5c34d0dedb0c4',
  'src/third_party/google_benchmark/src': {
    'url': 'https://chromium.googlesource.com/external/github.com/google/benchmark.git@8abf1e701fbd88c8170f48fe0558247e2e5f8e7d',
  },
  'src/third_party/libpfm4/src':
    Var('chromium_git') + '/external/git.code.sf.net/p/perfmon2/libpfm4.git' + '@' + '6870a9f00412830ceaa7e4384bb92ee323e2a28f',
  # WebRTC-only dependency (not present in Chromium).
  'src/third_party/gtest-parallel':
    'https://chromium.googlesource.com/external/github.com/google/gtest-parallel@cd488bdedc1d2cffb98201a17afc1b298b0b90f1',
  'src/third_party/google-truth/src': {
      'url': 'https://chromium.googlesource.com/external/github.com/google/truth.git@2b95613636f4d612006f4b5811f7971d5c13b489',
      'condition': 'checkout_android',
  },
  'src/third_party/googletest/src':
    'https://chromium.googlesource.com/external/github.com/google/googletest.git@4fe3307fb2d9f86d19777c7eb0e4809e9694dde7',

  # Always download Linux x64 package regardless of host OS for RBE workers.
  'src/third_party/cpython3/linux-amd64': {
      'packages': [
        {
          'package': 'infra/3pp/tools/cpython3/linux-amd64',
          'version': Var('cpython3_version'),
        },
      ],
      'condition': 'non_git_source',
      'dep_type': 'cipd',
  },

  # Host platform package. ${platform} folder is not used as in .gn the variable
  # is not initialized yet by the time Python is required.
  'src/third_party/cpython3/host': {
      'packages': [
        {
          'package': 'infra/3pp/tools/cpython3/${{platform}}',
          'version': Var('cpython3_version'),
        },
      ],
      'condition': 'non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/icu': {
    'url': 'https://chromium.googlesource.com/chromium/deps/icu.git@8cc91d9b6ab9991802fd208ee03a69714fd0251c',
  },
  'src/third_party/jdk/current': {
      'packages': [
          {
              'package': 'chromium/third_party/jdk/linux-amd64',
              'version': 'Ac1SdNGLeE0dSBE6mDm4oq8NvcHCLDgYMWYZki0QkVAC',
          },
      ],
      # Needed on Linux for use on chromium_presubmit (for checkstyle).
      'condition': '(checkout_android or checkout_linux) and non_git_source',
      'dep_type': 'cipd',
  },
  # Deprecated - only use for tools which are broken real JDK.
  # Not used by WebRTC. Added for compatibility with Chromium.
  'src/third_party/jdk11': {
      'packages': [
          {
              'package': 'chromium/third_party/jdk',
              # Do not update this hash - any newer hash will point to JDK17+.
              'version': 'egbcSHbmF1XZQbKxp_PQiGLFWlQK65krTGqQE-Bj4j8C',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },
 'src/third_party/jsoncpp/source':
    'https://chromium.googlesource.com/external/github.com/open-source-parsers/jsoncpp.git@60de77f915ab08499032d6e5a63e05e974f85d01', # from svn 248
  'src/third_party/junit/src': {
    'url': 'https://chromium.googlesource.com/external/junit.git@300468b1efd48d76fac2f7bd6d576846dcbbf5ed',
    'condition': 'checkout_android',
  },
  'src/third_party/kotlin_stdlib/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/kotlin_stdlib',
              'version': 'FR30rokCeQiCwA-wtaK9ZbTufTiZ4XssM6wwVHoW1xEC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/kotlinc/current': {
      'packages': [
          {
              'package': 'chromium/third_party/kotlinc',
              'version': '_TbalRHqOOWTHttZVLFGKk2_NmCRdmU-RPOVA4cizScC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },
  'src/third_party/libFuzzer/src':
    'https://chromium.googlesource.com/external/github.com/llvm/llvm-project/compiler-rt/lib/fuzzer.git@5811dc57603eac1fa0e76addedb77f72f62bfa2d',
  'src/third_party/fuzztest/src':
    'https://chromium.googlesource.com/external/github.com/google/fuzztest.git@6b4fbe565e958ab241b810bf607a2eaa6c9d7ff0',
  'src/third_party/libprotobuf-mutator/src':
    Var('chromium_git') + '/external/github.com/google/libprotobuf-mutator.git@c1c950eae0440c3808f2b8bd7c57d0c6a42c1a90',
  'src/third_party/libjpeg_turbo':
    'https://chromium.googlesource.com/chromium/deps/libjpeg_turbo.git@640f254ad0fa03f6b1f29f89b7dd9366f2f6e533',
  'src/third_party/libsrtp':
    'https://chromium.googlesource.com/chromium/deps/libsrtp.git@cd5d177bf1fde755ddb4c7f0d9ff7693f8b49e5e',
  'src/third_party/dav1d/libdav1d':
    'https://chromium.googlesource.com/external/github.com/videolan/dav1d.git@54706fc6bc0cdecab7e9593974a4039cc038fca7',
  'src/third_party/libaom/source/libaom':
    'https://aomedia.googlesource.com/aom.git@0006e96cdb595ff88950a2c664115335ca5517bf',
  'src/third_party/libgav1/src':
    Var('chromium_git') + '/codecs/libgav1.git' + '@' + 'c1deec657b32b911920c78e078cfd089faa77200',
  'src/third_party/libunwindstack': {
      'url': 'https://chromium.googlesource.com/chromium/src/third_party/libunwindstack.git@333fcafb91bd3830c5ef814c071ff73df9cdc976',
      'condition': 'checkout_android',
  },
  'src/third_party/perfetto':
    Var('chromium_git') + '/external/github.com/google/perfetto.git' + '@' + 'edf3aa3ab6eceea69d5fb102e30b06bab7600e35',
  'src/third_party/protobuf-javascript/src':
    Var('chromium_git') + '/external/github.com/protocolbuffers/protobuf-javascript' + '@' + 'e6d763860001ba1a76a63adcff5efb12b1c96024',
  'src/third_party/libvpx/source/libvpx':
    'https://chromium.googlesource.com/webm/libvpx.git@01a78fbc3b25c6a9eb227973bd591e9092d6daa1',
  'src/third_party/libyuv':
    'https://chromium.googlesource.com/libyuv/libyuv.git@240ac24a88822e9a2fe54e31a13fcf197ff82d71',
  'src/third_party/lss': {
    'url': 'https://chromium.googlesource.com/linux-syscall-support.git@29164a80da4d41134950d76d55199ea33fbb9613',
    'condition': 'checkout_android or checkout_linux',
  },
  'src/third_party/mockito/src': {
    'url': 'https://chromium.googlesource.com/external/mockito/mockito.git@04a2a289a4222f80ad20717c25144981210d2eac',
    'condition': 'checkout_android',
  },
  'src/third_party/instrumented_libs': {
    'url': Var('chromium_git') + '/chromium/third_party/instrumented_libraries.git' + '@' + 'd15c278eed5d38d9acf2d8054cf37baba93cef8e',
    'condition': 'checkout_instrumented_libraries',
  },

  # Used by boringssl.
  'src/third_party/nasm': {
      'url': 'https://chromium.googlesource.com/chromium/deps/nasm.git@525a09a813be0f75b646ee93fc2a31c27b87d722'
  },

  'src/third_party/openh264/src':
    'https://chromium.googlesource.com/external/github.com/cisco/openh264@fca40fc19f5fb854609d297ae4bde71df72787c9',

  'src/third_party/re2/src':
    'https://chromium.googlesource.com/external/github.com/google/re2.git@972a15cedd008d846f1a39b2e88ce48d7f166cbd',

  'src/third_party/sframe/src':
    Var('chromium_git') + '/external/github.com/cisco/sframe' + '@' + 'b14090904433bed0d4ec3f875b9b39f3e0555930',

  'src/third_party/r8/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/r8',
              'version': 'MSBeS467DZB4gyXqfb3ZZBmKRmqrcfM5UOsNLO9Fm9wC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },
  # This duplication is intentional, so we avoid updating the r8.jar used by
  # dexing unless necessary, since each update invalidates all incremental
  # dexing and unnecessarily slows down all bots.
  'src/third_party/r8/d8/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/r8',
              'version': 'mgvcxRdCK77IxF9-PPyFpRK2J0UCfEHWKbNInpzj4CkC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },
  'src/third_party/requests/src': {
    'url': 'https://chromium.googlesource.com/external/github.com/kennethreitz/requests.git@c7e0fc087ceeadb8b4c84a0953a422c474093d6d',
    'condition': 'checkout_android',
  },
  'src/tools':
    'https://chromium.googlesource.com/chromium/src/tools@19842ca7847a979e2209809a7a2470cce2fb6043',

  'src/third_party/espresso': {
      'packages': [
          {
              'package': 'chromium/third_party/espresso',
              'version': '5LoBT0j383h_4dXbnap7gnNQMtMjpbMJD1JaGIYNj-IC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/hamcrest/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/hamcrest',
              'version': 'dBioOAmFJjqAr_DY7dipbXdVfAxUQwjOBNibMPtX8lQC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_toolchain/ndk': {
    'packages': [
      {
        'package': 'chromium/third_party/android_toolchain/android_toolchain/${{platform}}',
        'version': 'version:2@30.0.15729638',
      },
    ],
    'condition': 'checkout_android',
    'dep_type': 'cipd',
  },

  'src/third_party/androidx/cipd': {
    'packages': [
      {
          'package': 'chromium/third_party/androidx',
          'version': 'D5860Frli6rAdpFo91LOFbb8VawqbBlesbZH51OrfkoC',
      },
    ],
    'condition': 'checkout_android and non_git_source',
    'dep_type': 'cipd',
  },

  'src/third_party/android_build_tools/manifest_merger/cipd': {
      'packages': [
          {
               'package': 'chromium/third_party/android_build_tools/manifest_merger',
               'version': 'HE-SYxF_8NqcIdCmzWmO0e8Q9al40EnebN1z2gs-LYYC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/android_sdk/public': {
      'packages': [
          {
              'package': 'chromium/third_party/android_sdk/public/build-tools/37.0.0',
              'version': 'febJrTgiK9s1ANoUlc4Orn3--zs9GjGCj2vQc8g7OaMC',
          },
          {
              'package': 'chromium/third_party/android_sdk/public/emulator',
              'version': '9lGp8nTUCRRWGMnI_96HcKfzjnxEJKUcfvfwmA3wXNkC',
          },
          {
              'package': 'chromium/third_party/android_sdk/public/platform-tools',
              'version': 'qTD9QdBlBf3dyHsN1lJ0RH6AhHxR42Hmg2Ih-Vj4zIEC'
          },
          {
              'package': 'chromium/third_party/android_sdk/public/platforms/android-37.0',
              'version': 'WhtP32Q46ZHdTmgCgdauM3ws_H9iPoGKEZ_cPggcQ6wC',
          },
          {
              'package': 'chromium/third_party/android_sdk/public/cmdline-tools/linux',
              'version': 'zpvajSBSzdpfFqTOmyRC3nQ2h6OxCa1N5P_2qPaz-pAC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/icu4j/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/icu4j',
              'version': '8dV7WRVX0tTaNNqkLEnCA_dMofr2MJXFK400E7gOFygC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/robolectric/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/robolectric',
              'version': '2VsyOy5QqREpP3T_yBOVM23M7Te5o0vz6oHubhKzYbsC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/sqlite4java/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/sqlite4java',
              'version': 'LofjKH9dgXIAJhRYCPQlMFywSwxYimrfDeBmaHc-Z5EC',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/tflite/src':
    Var('chromium_git') + '/external/github.com/tensorflow/tensorflow.git' + '@' + 'a387c0a471a69c0c9068334e73d184e1e0ce579f',

  'src/third_party/turbine/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/turbine',
              'version': 'iGvH-EemiZZWQXTgQ2YZQVRVkuH7tXiG5WjOXuHpXx0C',
          },
      ],
      'condition': 'checkout_android',
      'dep_type': 'cipd',
  },

  'src/third_party/zstd/src': {
    'url': Var('chromium_git') + '/external/github.com/facebook/zstd.git' + '@' + '5c7b7bad26808e6b40ac3b3d0075466e27738a9d',
  },

  'src/tools/luci-go': {
      'packages': [
        {
          'package': 'infra/tools/luci/cas/${{platform}}',
          'version': 'git_revision:2de3d5d5b1e9c5e75f930c363904413000823425',
        },
        {
          'package': 'infra/tools/luci/isolate/${{platform}}',
          'version': 'git_revision:2de3d5d5b1e9c5e75f930c363904413000823425',
        },
        {
          'package': 'infra/tools/luci/swarming/${{platform}}',
          'version': 'git_revision:2de3d5d5b1e9c5e75f930c363904413000823425',
        }
      ],
      'dep_type': 'cipd',
  },

  'src/third_party/pipewire/src': {
    'url': Var('chromium_git') + '/external/gitlab.freedesktop.org/pipewire/pipewire.git'
           + '@' + 'b741e0c74f5436f0c925f7741140db0efd32cf4e',
    'condition': 'checkout_linux',
  },

  'src/third_party/wireplumber/linux-amd64': {
    'packages': [
      {
        'package': 'chromium/third_party/wireplumber/linux-amd64',
        'version': 'yfe349C2e6pWCcu7DaSPJHNWdwDbNP9FfSQoV9j6A5UC',
      },
    ],

    'condition': 'checkout_linux',
    'dep_type': 'cipd',
  },

  'src/third_party/android_deps/autorolled/cipd': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/autorolled',
              'version': 'qgGIpnHQaa3kQar4rzYZyCGh0H-pKChjxujM3uzK9SwC',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },
  'src/third_party/pthreadpool/src':
    Var('chromium_git') + '/external/github.com/google/pthreadpool.git' + '@' + '02460584c6092e527c8b89f7df4de143d70e801f',

  'src/third_party/xnnpack/src':
    Var('chromium_git') + '/external/github.com/google/XNNPACK.git' + '@' + 'eccfcfe85b347d8f48015ecdf9fa7db1a9ef61cb',

  'src/third_party/farmhash/src':
    Var('chromium_git') + '/external/github.com/google/farmhash.git' + '@' + '816a4ae622e964763ca0862d9dbd19324a1eaf45',

  'src/third_party/ruy/src':
    Var('chromium_git') + '/external/github.com/google/ruy.git' + '@' + '2264753777198e4393fb83c44c693462d57a2be1',

  'src/third_party/cpuinfo/src':
    Var('chromium_git') + '/external/github.com/pytorch/cpuinfo.git' + '@' + '66ee79c038d70dad9f08705b2c9b3e58f6d8f512',

  'src/third_party/eigen3/src':
    Var('chromium_git') + '/external/gitlab.com/libeigen/eigen.git' + '@' + '6d035ce6b1ea030ea03bf92ee3aa1fd03145ad2b',

  'src/third_party/fp16/src':
    Var('chromium_git') + '/external/github.com/Maratyszcza/FP16.git' + '@' + '782eea126dc5c755827be751a099eb01826175cf',

  'src/third_party/gemmlowp/src':
    Var('chromium_git') + '/external/github.com/google/gemmlowp.git' + '@' + '16e8662c34917be0065110bfcd9cc27d30f52fdf',

  'src/third_party/fxdiv/src':
    Var('chromium_git') + '/external/github.com/Maratyszcza/FXdiv.git' + '@' + '63058eff77e11aa15bf531df5dd34395ec3017c8',

  'src/third_party/neon_2_sse/src':
    Var('chromium_git') + '/external/github.com/intel/ARM_NEON_2_x86_SSE.git' + '@' + '183fc88bcb90dbfaefba33a292eae8a5ce94bd67',


  # Everything coming after this is automatically updated by the auto-roller.
  # === ANDROID_DEPS Generated Code Start ===
  # Generated by //third_party/android_deps/fetch_all.py
  'src/third_party/android_deps/cipd/libs/com_android_tools_common': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_android_tools_common',
              'version': 'version:2@30.2.0-beta01.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/com_android_tools_layoutlib_layoutlib_api': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_android_tools_layoutlib_layoutlib_api',
              'version': 'version:2@30.2.0-beta01.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/com_android_tools_sdk_common': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_android_tools_sdk_common',
              'version': 'version:2@30.2.0-beta01.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/com_google_android_apps_common_testing_accessibility_framework_accessibility_test_framework': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_google_android_apps_common_testing_accessibility_framework_accessibility_test_framework',
              'version': 'version:2@4.0.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/com_googlecode_java_diff_utils_diffutils': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_googlecode_java_diff_utils_diffutils',
              'version': 'version:2@1.3.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/com_squareup_javapoet': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/com_squareup_javapoet',
              'version': 'version:2@1.13.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/net_bytebuddy_byte_buddy': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/net_bytebuddy_byte_buddy',
              'version': 'version:2@1.17.6.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/net_bytebuddy_byte_buddy_agent': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/net_bytebuddy_byte_buddy_agent',
              'version': 'version:2@1.17.6.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_ccil_cowan_tagsoup_tagsoup': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_ccil_cowan_tagsoup_tagsoup',
              'version': 'version:2@1.2.1.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_checkerframework_checker_compat_qual': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_checkerframework_checker_compat_qual',
              'version': 'version:2@2.5.5.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_jetbrains_kotlin_kotlin_android_extensions_runtime': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_jetbrains_kotlin_kotlin_android_extensions_runtime',
              'version': 'version:2@1.9.22.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_jetbrains_kotlin_kotlin_parcelize_runtime': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_jetbrains_kotlin_kotlin_parcelize_runtime',
              'version': 'version:2@1.9.22.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_jsoup_jsoup': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_jsoup_jsoup',
              'version': 'version:2@1.15.1.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_mockito_mockito_android': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_mockito_mockito_android',
              'version': 'version:2@5.19.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_mockito_mockito_core': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_mockito_mockito_core',
              'version': 'version:2@5.19.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_mockito_mockito_subclass': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_mockito_mockito_subclass',
              'version': 'version:2@5.19.0.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  'src/third_party/android_deps/cipd/libs/org_objenesis_objenesis': {
      'packages': [
          {
              'package': 'chromium/third_party/android_deps/libs/org_objenesis_objenesis',
              'version': 'version:2@3.3.cr2',
          },
      ],
      'condition': 'checkout_android and non_git_source',
      'dep_type': 'cipd',
  },

  # === ANDROID_DEPS Generated Code End ===
}

hooks = [
  {
    # This clobbers when necessary (based on get_landmines.py). It should be
    # an early hook but it will need to be run after syncing Chromium and
    # setting up the links, so the script actually exists.
    'name': 'landmines',
    'pattern': '.',
    'action': [
        'python3',
        'src/build/landmines.py',
        '--landmine-scripts',
        'src/tools_webrtc/get_landmines.py',
        '--src-dir',
        'src',
    ],
  },
  {
    # Ensure that the DEPS'd "depot_tools" has its self-update capability
    # disabled.
    'name': 'disable_depot_tools_selfupdate',
    'pattern': '.',
    'action': [
        'python3',
        'src/third_party/depot_tools/update_depot_tools_toggle.py',
        '--disable',
    ],
  },
  {
    'name': 'sysroot_arm',
    'pattern': '.',
    'condition': 'checkout_linux and checkout_arm',
    'action': ['python3', 'src/build/linux/sysroot_scripts/install-sysroot.py',
               '--arch=arm'],
  },
  {
    'name': 'sysroot_arm64',
    'pattern': '.',
    'condition': 'checkout_linux and checkout_arm64',
    'action': ['python3', 'src/build/linux/sysroot_scripts/install-sysroot.py',
               '--arch=arm64'],
  },
  {
    'name': 'sysroot_x86',
    'pattern': '.',
    'condition': 'checkout_linux and (checkout_x86 or checkout_x64)',
    # TODO(mbonadei): change to --arch=x86.
    'action': ['python3', 'src/build/linux/sysroot_scripts/install-sysroot.py',
               '--arch=i386'],
  },
  {
    'name': 'sysroot_mips',
    'pattern': '.',
    'condition': 'checkout_linux and checkout_mips',
    # TODO(mbonadei): change to --arch=mips.
    'action': ['python3', 'src/build/linux/sysroot_scripts/install-sysroot.py',
               '--arch=mipsel'],
  },
  {
    'name': 'sysroot_x64',
    'pattern': '.',
    'condition': 'checkout_linux and checkout_x64',
    # TODO(mbonadei): change to --arch=x64.
    'action': ['python3', 'src/build/linux/sysroot_scripts/install-sysroot.py',
               '--arch=amd64'],
  },
  {
    # Case-insensitivity for the Win SDK. Must run before win_toolchain below.
    'name': 'ciopfs_linux',
    'pattern': '.',
    'condition': 'checkout_win and host_os == "linux"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang/ciopfs',
                '-s', 'src/build/ciopfs.sha1',
    ]
  },
  {
    # Update the Windows toolchain if necessary. Must run before 'clang' below.
    'name': 'win_toolchain',
    'pattern': '.',
    'condition': 'checkout_win',
    'action': ['python3', 'src/build/vs_toolchain.py', 'update', '--force'],
  },
  {
    # Update the Mac toolchain if necessary.
    'name': 'mac_toolchain',
    'pattern': '.',
    'condition': 'checkout_mac',
    'action': ['python3', 'src/build/mac_toolchain.py'],
  },

  {
    'name': 'Download Fuchsia SDK from GCS',
    'pattern': '.',
    'condition': 'checkout_fuchsia',
    'action': [
      'python3',
      'src/build/fuchsia/update_sdk.py',
      '--cipd-prefix={fuchsia_sdk_cipd_prefix}',
      '--version={fuchsia_version}',
    ],
  },
  {
    'name': 'Download Fuchsia system images',
    'pattern': '.',
    'condition': 'checkout_fuchsia and checkout_fuchsia_product_bundles',
    'action': [
      'python3',
      'src/build/fuchsia/update_product_bundles.py',
      '{checkout_fuchsia_boot_images}',
    ],
  },
  {
    # Update LASTCHANGE.
    'name': 'lastchange',
    'pattern': '.',
    'action': ['python3', 'src/build/util/lastchange.py',
               '-o', 'src/build/util/LASTCHANGE'],
  },
  # Pull dsymutil binaries using checked-in hashes.
  {
    'name': 'dsymutil_mac_arm64',
    'pattern': '.',
    'condition': 'host_os == "mac" and host_cpu == "arm64"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang',
                '-s', 'src/tools/clang/dsymutil/bin/dsymutil.arm64.sha1',
                '-o', 'src/tools/clang/dsymutil/bin/dsymutil',
    ],
  },
  {
    'name': 'dsymutil_mac_x64',
    'pattern': '.',
    'condition': 'host_os == "mac" and host_cpu == "x64"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang',
                '-s', 'src/tools/clang/dsymutil/bin/dsymutil.x64.sha1',
                '-o', 'src/tools/clang/dsymutil/bin/dsymutil',
    ],
  },
  # Pull rc binaries using checked-in hashes.
  {
    'name': 'rc_win',
    'pattern': '.',
    'condition': 'checkout_win and host_os == "win"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang/rc',
                '-s', 'src/build/toolchain/win/rc/win/rc.exe.sha1',
    ],
  },
  {
    'name': 'rc_mac',
    'pattern': '.',
    'condition': 'checkout_win and host_os == "mac"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang/rc',
                '-s', 'src/build/toolchain/win/rc/mac/rc.sha1',
    ],
  },
  {
    'name': 'rc_linux',
    'pattern': '.',
    'condition': 'checkout_win and host_os == "linux"',
    'action': [ 'python3',
                'src/third_party/depot_tools/download_from_google_storage.py',
                '--no_resume',
                '--bucket', 'chromium-browser-clang/rc',
                '-s', 'src/build/toolchain/win/rc/linux64/rc.sha1',
    ],
  },
  {
    # Download test resources, i.e. video and audio files from Google Storage.
    'pattern': '.',
    'action': ['download_from_google_storage',
               '--directory',
               '--recursive',
               '--num_threads=10',
               '--quiet',
               '--bucket', 'chromium-webrtc-resources',
               'src/resources'],
  },
  {
    'name': 'Generate component metadata for tests',
    'pattern': '.',
    'action': [
      'vpython3',
      'src/testing/generate_location_tags.py',
      '--out',
      'src/testing/location_tags.json',
    ],
  },
  # Download and initialize "vpython" VirtualEnv environment packages.
  {
    'name': 'vpython_common',
    'pattern': '.',
    'action': [ 'vpython3',
                '-vpython-spec', 'src/.vpython3',
                '-vpython-tool', 'install',
    ],
  },
  # Download remote exec cfg files
  {
    'name': 'configure_reclient_cfgs',
    'pattern': '.',
    'condition': 'download_remoteexec_cfg',
    'action': ['python3',
               'src/buildtools/reclient_cfgs/configure_reclient_cfgs.py',
               '--rbe_instance',
               Var('rbe_instance'),
               '--reproxy_cfg_template',
               'reproxy.cfg.template',
               '--quiet',
               ],
  },
  # Configure Siso for developer builds.
  {
    'name': 'configure_siso',
    'pattern': '.',
    'action': ['python3',
               'src/build/config/siso/configure_siso.py',
               '--rbe_instance',
               Var('rbe_instance'),
               ],
  },
  {
    # Ensure we remove any file from disk that is no longer needed (e.g. after
    # hooks to native GCS deps migration).
    'name': 'remove_stale_files',
    'pattern': '.',
    'action': [
        'python3',
        'src/tools/remove_stale_files.py',
        'src/third_party/test_fonts/test_fonts.tar.gz', # Remove after 20240901
    ],
  },
]

recursedeps = [
  'src/buildtools',
  'src/third_party/instrumented_libs',
]

# Define rules for which include paths are allowed in our source.
include_rules = [
  # Base is only used to build Android APK tests and may not be referenced by
  # WebRTC production code.
  "-base",
  "-chromium",
  "+external/webrtc/webrtc",  # Android platform build.
  "+libyuv",

  # These should eventually move out of here.
  "+common_types.h",

  "+WebRTC",
  "+api",
  "+modules/include",
  "+rtc_base",
  "+test",
  "+rtc_tools",

  # Abseil allowlist. Keep this in sync with abseil-in-webrtc.md.
  "+absl/algorithm/algorithm.h",
  "+absl/algorithm/container.h",
  "+absl/base/attributes.h",
  "+absl/base/config.h",
  "+absl/base/nullability.h",
  "+absl/base/macros.h",
  "+absl/base/no_destructor.h",
  "+absl/cleanup/cleanup.h",
  "+absl/container",
  "-absl/container/fixed_array.h",
  "+absl/crc",
  "+absl/functional/any_invocable.h",
  "+absl/functional/bind_front.h",
  "+absl/memory/memory.h",
  "+absl/numeric/bits.h",
  "+absl/strings/ascii.h",
  "+absl/strings/escaping.h",
  "+absl/strings/match.h",
  "+absl/strings/str_cat.h",  # note - allowed for single argument version only
  "+absl/strings/str_replace.h",
  "+absl/strings/string_view.h",

  # Abseil flags are allowed in tests and tools.
  "+absl/flags",

  # Perfetto should be used through rtc_base/trace_event.h
  '-third_party/perfetto',
  '-perfetto',
  '-protos/perfetto',
]

specific_include_rules = {
  "webrtc_lib_link_test\\.cc": [
    "+media/engine",
    "+modules/audio_device",
    "+modules/audio_processing",
  ]
}
