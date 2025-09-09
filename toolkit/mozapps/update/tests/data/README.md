README
======

I needed to make changes to some of the test MARs in this directory and it was a bit difficult to figure out how, so I want to document what I did so that this is easier next time. In my specific case, I wanted to rename some files in several MARs. These are approximately the steps I used to make changes to `partial_mac.mar`:

 - `./mach build` so that `<obj>/dist/bin/signmar` is available.
 - We want use the [Python MAR tool](https://github.com/mozilla-releng/build-mar) to build the replacement MAR, but it currently has a problem that we need to fix before we can build a MAR that will allow tests to pass on Apple silicon. Once [this issue](https://github.com/mozilla-releng/build-mar/issues/63) is addressed, we can just use `pip install mar`. Until then, we need to checkout the project and tweak it before we use it. First clone the repository: `cd ~ && git clone https://github.com/mozilla-releng/build-mar`. Next, we want to remove [this line](https://github.com/mozilla-releng/build-mar/blob/2d37c446015b97d6f700fef5766a49609bdc22ea/src/mardor/utils.py#L158). Then make the tweaked version available with `cd ~/build-mar && virtualenv mardor && source mardor/bin/activate && pip install .`.
 - Made a temporary working directory: `cd /path/to/mozilla/repo && mkdir temp && cd temp`
 - Extracted the MAR that I wanted to change: `mar -J -x ../toolkit/mozapps/update/tests/data/partial_mac.mar`. The `-J` specifies a compression type of `xz`. You can also specify `--auto` to automatically detect the compression type (though you may want to know the original compression later for recompression) or you can check the compression type by running `mar -T ../toolkit/mozapps/update/tests/data/partial_mac.mar` and looking for the `Compression type:` line.
 - Made the changes that I wanted to make to the extracted files. This included moving the old files to their new locations and updating those paths in `updatev2.manifest` and `updatev3.manifest`.
 - Run `mar -T ../toolkit/mozapps/update/tests/data/partial_mac.mar` to get a complete list of the files originally in that MAR as well as the product/version and channel strings (in this case `xpcshell-test` and `*` respectively).
 - Create the new MAR: `mar -J -c partial_mac_unsigned.mar -V '*' -H xpcshell-test <file1> <file2> ...`, individually specifying each file path listed in by `mar -T`, substituting with renamed paths as necessary.
 - I had a bit of trouble figuring out the signing. Eventually I discovered the following things: (a) The test MAR signatures successfully verify against `toolkit/mozapps/update/updater/xpcshellCertificate.der` and (b) according to [this comment](https://searchfox.org/mozilla-central/rev/fc00627e34639ef1014e87d9fa24091905e9dc5d/toolkit/mozapps/update/updater/moz.build#41-43), that certificate was generated from `mycert` in `modules/libmar/tests/unit/data`. Thus, I signed the MAR like this: `../<obj>/dist/bin/signmar -d ../modules/libmar/tests/unit/data -n mycert -s partial_mac_unsigned.mar partial_mac.mar`.
 - I wanted to do some verification to make sure that the new MAR looked right. First I verified the signature: `../<obj>/dist/bin/signmar -D ../toolkit/mozapps/update/updater/xpcshellCertificate.der -v partial_mac.mar`. This appears to output nothing on success, but it's probably good to check to make sure `echo $?` is `0`. I also compared the output of `mar -T partial_mac.mar` to that of the original. I saw a few unexpected size changes which I believe are likely due to slight differences in the compression used (maybe the algorithm changed slightly since this was last generated?). To make sure that these did not correspond to effective changes, I extracted the new MAR with `mkdir cmp && cd cmp && mar -J -x ../partial_mac.mar && cd ..` and compared the resulting files to make sure they had the expected contents.
 - Overwrite the original MAR with the new one and remove the `temp` directory: `cd .. && mv -f temp/partial_mac.mar toolkit/mozapps/update/tests/data/partial_mac.mar && rm -rf temp`

In bug 1950055, we wanted to support Zucchini as an alternative to bspatch. Below are the steps we went through to generate partial_zucchini.mar from partial.mar, with inspiration from the text above.

- Realize that in partial.mar, all exe patches are the same patch (turning `complete.exe` into `partial.exe`), and all png patches are the same patch (turning `complete.png` into `partial.png`):

```
$ mar -J -x ../partial.mar

$ grep -r MBDIFF10 .
Binary file ./0/00/00png0.png.patch matches
Binary file ./0/0exe0.exe.patch matches
Binary file ./distribution/extensions/extensions0/extensions0png0.png.patch matches
Binary file ./distribution/extensions/extensions0/extensions0png1.png.patch matches
Binary file ./distribution/extensions/extensions1/extensions1png0.png.patch matches
Binary file ./distribution/extensions/extensions1/extensions1png1.png.patch matches
Binary file ./exe0.exe.patch matches
Binary file ./searchplugins/searchpluginspng0.png.patch matches
Binary file ./searchplugins/searchpluginspng1.png.patch matches

$ md5sum ./0/00/00png0.png.patch ./distribution/extensions/extensions0/extensions0png0.png.patch ./distribution/extensions/extensions0/extensions0png1.png.patch ./distribution/extensions/extensions1/extensions1png0.png.patch ./distribution/extensions/extensions1/extensions1png1.png.patch ./searchplugins/searchpluginspng0.png.patch ./searchplugins/searchpluginspng1.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./0/00/00png0.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./distribution/extensions/extensions0/extensions0png0.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./distribution/extensions/extensions0/extensions0png1.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./distribution/extensions/extensions1/extensions1png0.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./distribution/extensions/extensions1/extensions1png1.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./searchplugins/searchpluginspng0.png.patch
69ab8dc8614e6bb154c029b12ca8e3e9 *./searchplugins/searchpluginspng1.png.patch

$ md5sum ./0/0exe0.exe.patch ./exe0.exe.patch
bd6e413d3248cfbeff65e104b6c4cd39 *./0/0exe0.exe.patch
bd6e413d3248cfbeff65e104b6c4cd39 *./exe0.exe.patch
```

- Generate the equivalent zucchini patches:

```
$ ./obj-x86_64-pc-windows-msvc/dist/bin/zucchini.exe -gen toolkit/mozapps/update/tests/data/complete.exe toolkit/mozapps/update/tests/data/partial.exe exe0.exe.patch -keep
$ ./obj-x86_64-pc-windows-msvc/dist/bin/zucchini.exe -gen toolkit/mozapps/update/tests/data/complete.png toolkit/mozapps/update/tests/data/partial.png 00png0.png.patch -keep
```

- Replace all patch files on disk by their Zucchini equivalent, then double check by rerunning the `md5sum` commands:

```
$ grep -r Zucc .
Binary file ./0/00/00png0.png.patch matches
Binary file ./0/0exe0.exe.patch matches
Binary file ./distribution/extensions/extensions0/extensions0png0.png.patch matches
Binary file ./distribution/extensions/extensions0/extensions0png1.png.patch matches
Binary file ./distribution/extensions/extensions1/extensions1png0.png.patch matches
Binary file ./distribution/extensions/extensions1/extensions1png1.png.patch matches
Binary file ./exe0.exe.patch matches
Binary file ./searchplugins/searchpluginspng0.png.patch matches
Binary file ./searchplugins/searchpluginspng1.png.patch matches

$ md5sum ./0/00/00png0.png.patch ./distribution/extensions/extensions0/extensions0png0.png.patch ./distribution/extensions/extensions0/extensions0png1.png.patch ./distribution/extensions/extensions1/extensions1png0.png.patch ./distribution/extensions/extensions1/extensions1png1.png.patch ./searchplugins/searchpluginspng0.png.patch ./searchplugins/searchpluginspng1.png.patch
958bae1b40904145959ba45f988a7156 *./0/00/00png0.png.patch
958bae1b40904145959ba45f988a7156 *./distribution/extensions/extensions0/extensions0png0.png.patch
958bae1b40904145959ba45f988a7156 *./distribution/extensions/extensions0/extensions0png1.png.patch
958bae1b40904145959ba45f988a7156 *./distribution/extensions/extensions1/extensions1png0.png.patch
958bae1b40904145959ba45f988a7156 *./distribution/extensions/extensions1/extensions1png1.png.patch
958bae1b40904145959ba45f988a7156 *./searchplugins/searchpluginspng0.png.patch
958bae1b40904145959ba45f988a7156 *./searchplugins/searchpluginspng1.png.patch

$ md5sum ./0/0exe0.exe.patch ./exe0.exe.patch
7750e88e0c1d006710abbd625710748b *./0/0exe0.exe.patch
7750e88e0c1d006710abbd625710748b *./exe0.exe.patch
```

- Generate an unsigned mar file. Unfortunately on Windows this doesn't preserve the permissions from the original mar. The simplest solution is to do this part on a UNIX (file)system.

```
$ mar -J -c ../partial_zucchini_unsigned.mar -H xpcshell-test -V '*' 2/20/20png0.png 0/0exe0.exe.patch 0/00/00text2 distribution/extensions/extensions0/extensions0text0 distribution/extensions/extensions0/extensions0png1.png.patch 0/00/00text0 distribution/extensions/extensions0/extensions0png0.png.patch searchplugins/searchpluginspng1.png.patch distribution/extensions/extensions1/extensions1png0.png.patch distribution/extensions/extensions1/extensions1text0 searchplugins/searchpluginstext0 distribution/extensions/extensions1/extensions1png1.png.patch defaults/pref/channel-prefs.js update-settings.ini updatev2.manifest searchplugins/searchpluginspng0.png.patch precomplete 0/00/00png0.png.patch updatev3.manifest exe0.exe.patch 2/20/20text0
```

- Generate a signed mar from the unsigned mar:

```
$ /d/mozilla-source/firefox/obj-x86_64-pc-windows-msvc/dist/bin/signmar.exe -d /d/mozilla-source/firefox/modules/libmar/tests/unit/data/ -n mycert -s ../partial_zucchini_unsigned.mar ../partial_zucchini.mar
```
