# Submitting Marionette patches

See the {ref}`Firefox Contributors' Quick Reference
<firefox-contributors-quick-reference>` for how to write a patch and submit it
for review. Don't worry about which person to select for reviewing your code;
for Marionette it will be done automatically.

Once you have contributed a couple of patches, we are happy to sponsor you in
{ref}`levelling up <Levelling up>`. With commit access level 1 you will have
permission to use the [Firefox CI] to trigger your own “try runs” to test your
changes.

You can use the `remote-protocol` [try preset]:

```shell
% ./mach try --preset remote-protocol
```

This preset will schedule tests related to the Remote Protocol component on
various platforms. You can reduce the number of tasks by filtering on platforms
(e.g. linux) or build type (e.g. opt):

```shell
% ./mach try --preset remote-protocol -xq "'linux 'opt"
```

But you can also schedule tests by selecting relevant jobs yourself:

```shell
% ./mach try fuzzy
```

[Firefox CI]: https://treeherder.mozilla.org/
[try preset]: /tools/try/presets
