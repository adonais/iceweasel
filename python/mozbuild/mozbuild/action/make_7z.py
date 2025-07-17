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
    dist_source = source + suffix
    if os.path.exists(dist_source):
        shutil.rmtree(dist_source, onerror=handle_remove_read_only)
    if os.path.exists(package):
        os.remove(package)
    os.mkdir(dist_source)
    path = shutil.copytree(source, dist_source + '/App')
    user = os.environ.get('LIBPORTABLE_PATH')
    vc_crt = os.environ.get('VC_REDISTDIR')
    if vc_crt:
        if (suffix == '_x64'):
            if os.path.exists(vc_crt + 'x64/Microsoft.VC142.CRT/vcruntime140_1.dll'):
                path = shutil.copy(vc_crt + 'x64/Microsoft.VC142.CRT/vcruntime140_1.dll', dist_source + '/App')
    if user:
        if (suffix == '_x64'):
            if os.path.exists(user + '/bin/portable64.dll'):
                path = shutil.copy(user + '/bin/portable64.dll', dist_source + '/App')
            if os.path.exists(user + '/bin/upcheck64.exe'):
                path = shutil.copy(user + '/bin/upcheck64.exe', dist_source + '/App/upcheck.exe')
        else:
            if os.path.exists(user + '/bin/portable32.dll'):
                path = shutil.copy(user + '/bin/portable32.dll', dist_source + '/App')
            if os.path.exists(user + '/bin/upcheck32.exe'):
                path = shutil.copy(user + '/bin/upcheck32.exe', dist_source + '/App/upcheck.exe')
        if os.path.exists(user + '/bin/portable(example).ini'):
            path = shutil.copy(user + '/bin/portable(example).ini', dist_source + '/App')
    subprocess.check_call(['7z', 'a', '-t7z', package, dist_source, '-mx9', '-r', '-y', '-x!.mkdir.done'])

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
