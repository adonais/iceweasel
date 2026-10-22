# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
{
  'includes': [
    '../../coreconf/config.gypi',
    '../common/gtest.gypi',
  ],
  'targets': [
    {
      'target_name': 'softoken_static_gtest',
      'type': 'executable',
      'sources': [
        'softoken_static_gtest.cc',
      ],
      'dependencies': [
        '<(DEPTH)/exports.gyp:nss_exports',
        '<(DEPTH)/lib/util/util.gyp:nssutil3',
        '<(DEPTH)/gtests/google_test/google_test.gyp:gtest',
        '<(DEPTH)/lib/softoken/softoken.gyp:softokn_static',
      ],
      'conditions': [
        [ 'OS=="win"', {
          'libraries': [
            'advapi32.lib',
          ],
        }],
      ],
    }
  ],
  'target_defaults': {
    'include_dirs': [
      '../../lib/util',
      '../../lib/softoken'
    ],
  },
  'variables': {
    'module': 'nss'
  }
}
