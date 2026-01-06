Test Manifest TOML
==================

This linter verifies syntax for ManifestParser TOML files.

Run Locally
-----------

This mozlint linter can be run using mach:

.. parsed-literal::

    $ mach lint --linter test-manifest-toml <file paths>


Configuration
-------------

The configuration excludes all non-ManifestParser TOML files (as well as
generated TOML manifests).

Sources
-------

* `Configuration (YAML) <https://searchfox.org/mozilla-central/source/tools/lint/test-manifest-toml.yml>`_
* `Source <https://searchfox.org/mozilla-central/source/tools/lint/test-manifest-toml/__init__.py>`_

Errors Detected
---------------
* Invalid TOML
* Missing DEFAULT section (fixable)
* Sections not in alphabetical order (fixable)
* Section name not double quoted (fixable)
* Disabling a path by commenting out the section
* Conditional contains explicit ||
* Conditional is NOT an array
* Missing include file

Non idiomatic manifest warnings
-------------------------------
* Using ``processor`` instead of ``arch``
* Using ``bits`` instead of ``arch``
* Using ``android_version`` instead of ``os_version``
* Using platform combination variables: ``apple_catalina``, ``apple_silicon``, ``win10_2009``, ``win11_2009`` (unused)
* Platforms no longer used by CI: ``Linux 18.04``, ``MacOS 11.20``, ``Windows 11.2009``
* Specifying display ``x11`` on Linux 22.04 where only ``wayland`` is supported
* Specifying display ``wayland`` on Linux 24.04 where only ``x11`` is supported
* Using ``!debug`` instead of ``asan``, ``opt``, or ``tsan``
* Using literal boolean values for single variables like ``debug == false``
