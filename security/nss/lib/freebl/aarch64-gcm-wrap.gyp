# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
{
  'includes': [
    '../../coreconf/config.gypi'
  ],
  'target_defaults': {
    'type': 'static_library',
    'sources': [
      'aarch64-gcm-wrap.c',
      'aarch64-gcm-slothy/gcm-128-enc.S',
      'aarch64-gcm-slothy/gcm-192-enc.S',
      'aarch64-gcm-slothy/gcm-256-enc.S',
      'aarch64-gcm-slothy/gcm-128-dec.S',
      'aarch64-gcm-slothy/gcm-192-dec.S',
      'aarch64-gcm-slothy/gcm-256-dec.S',
    ],
    'dependencies': [
      '<(DEPTH)/exports.gyp:nss_exports'
    ],
    'cflags': [
      '-march=armv8-a+crypto',
    ],
    'cflags_mozilla': [
      '-march=armv8-a+crypto',
    ],
    'conditions': [
      [ 'OS=="linux"', {
        'defines': [
          'FREEBL_NO_DEPEND',
        ],
      }],
    ],
  },
  'targets': [
    {
      'target_name': 'aarch64-gcm-wrap-nodepend_c_lib',
    },
    {
      'target_name': 'aarch64-gcm-wrap_c_lib',
      'defines!': [
        'FREEBL_NO_DEPEND',
      ],
    },
  ],
  'variables': {
    'module': 'nss',
  }
}
