# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import os
from unittest import mock

import mozunit
from mozpack.manifests import InstallManifest
from mozpack.test.test_files import TestWithTmpDir

from mozbuild.action import process_install_manifest


class TestGenerateManifest(TestWithTmpDir):
    """
    Unit tests for process_install_manifest.py.
    """

    def test_process_manifest(self):
        source = self.tmppath("source")
        os.mkdir(source)
        os.mkdir("%s/base" % source)
        os.mkdir("%s/base/foo" % source)
        os.mkdir("%s/base2" % source)

        with open("%s/base/foo/file1" % source, "a"):
            pass

        with open("%s/base/foo/file2" % source, "a"):
            pass

        with open("%s/base2/file3" % source, "a"):
            pass

        m = InstallManifest()
        m.add_pattern_link("%s/base" % source, "**", "")
        m.add_link("%s/base2/file3" % source, "foo/file3")

        p = self.tmppath("m")
        m.write(path=p)

        dest = self.tmppath("dest")
        track = self.tmppath("track")

        for i in range(2):
            process_install_manifest.process_manifest(dest, [p], track)

            self.assertTrue(os.path.exists(self.tmppath("dest/foo/file1")))
            self.assertTrue(os.path.exists(self.tmppath("dest/foo/file2")))
            self.assertTrue(os.path.exists(self.tmppath("dest/foo/file3")))

        m = InstallManifest()
        m.write(path=p)

        for i in range(2):
            process_install_manifest.process_manifest(dest, [p], track)

            self.assertFalse(os.path.exists(self.tmppath("dest/foo/file1")))
            self.assertFalse(os.path.exists(self.tmppath("dest/foo/file2")))
            self.assertFalse(os.path.exists(self.tmppath("dest/foo/file3")))

    def test_a_first_run_does_not_read_the_destination(self):
        """Without a track there is nothing to remove, so a destination such as
        the object directory is not walked to find out."""
        source = self.tmppath("source")
        os.mkdir(source)
        with open(f"{source}/file1", "a"):
            pass

        m = InstallManifest()
        m.add_link(f"{source}/file1", "foo/file1")
        p = self.tmppath("m")
        m.write(path=p)

        dest = self.tmppath("dest")
        os.makedirs(f"{dest}/elsewhere")
        with open(f"{dest}/elsewhere/file", "a"):
            pass

        with mock.patch("mozpack.copier._scandir_dest_info") as scan:
            process_install_manifest.process_manifest(dest, [p], self.tmppath("track"))

        scan.assert_not_called()
        self.assertTrue(os.path.exists(f"{dest}/foo/file1"))
        self.assertTrue(os.path.exists(f"{dest}/elsewhere/file"))
        self.assertTrue(os.path.exists(self.tmppath("track")))


if __name__ == "__main__":
    mozunit.main()
