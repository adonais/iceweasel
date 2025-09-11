# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function

import os
import sys
import shutil
import subprocess

def handle_remove_read_only(func, path, exc):
    excvalue = exc[1]
    if func in (os.rmdir, os.remove, os.unlink) and excvalue.errno == errno.EACCES:
      os.chmod(path, stat.S_IRWXU| stat.S_IRWXG| stat.S_IRWXO) # 0777
      func(path)
    else:
        sys.exit(1)

def make_7z(source, suffix, package):
    dist_app_source = ""
    topobjdir = os.environ.get('MOZ_TOPOBJDIR')
    ice_source = topobjdir+ '/dist/' + source
    ice_package = topobjdir + '/dist/' + package
    stage1 = os.environ.get('ACTIONS_PGO_GENERATE')
    if stage1:
        dist_source = ice_source
        dist_app_source = dist_source
    else:
        dist_source = ice_source + suffix
        dist_app_source = dist_source + '/App'
        if os.path.exists(dist_source):
            shutil.rmtree(dist_source, onerror=handle_remove_read_only)
        if os.path.exists(ice_package):
            os.remove(ice_package)
        os.mkdir(dist_source)
        shutil.copytree(ice_source, dist_app_source)
    user = os.environ.get('LIBPORTABLE_PATH')
    if user:
        if (suffix == '_x64'):
            if os.path.exists(user + '/bin/portable64.dll'):
                shutil.copy(user + '/bin/portable64.dll', dist_app_source)
            if os.path.exists(user + '/bin/upcheck64.exe'):
                shutil.copy(user + '/bin/upcheck64.exe', dist_app_source + '/upcheck.exe')
        else:
            if os.path.exists(user + '/bin/portable32.dll'):
                shutil.copy(user + '/bin/portable32.dll', dist_app_source)
            if os.path.exists(user + '/bin/upcheck32.exe'):
                shutil.copy(user + '/bin/upcheck32.exe', dist_app_source + '/upcheck.exe')
        if os.path.exists(user + '/bin/portable(example).ini'):
            shutil.copy(user + '/bin/portable(example).ini', dist_app_source)
        if os.path.exists(user + '/readme.txt'):
            shutil.copy(user + '/readme.txt', dist_source)
    subprocess.check_call(['7z', 'a', '-t7z', ice_package, dist_source, '-mx9', '-r', '-y', '-x!.mkdir.done'])

def main(args):
    if len(args) != 3:
        print('Usage: make_7z.py <source> <suffix> <package>',
              file=sys.stderr)
        return 1
    else:
        make_7z(args[0], args[1], args[2])
        return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
