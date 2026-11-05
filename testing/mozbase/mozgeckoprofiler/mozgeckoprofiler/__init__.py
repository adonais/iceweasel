# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

"""
mozgeckoprofiler has utilities to symbolicate and load gecko profiles.
"""

from .profiling import symbolicate_profile_json, symbolicate_profiles
from .symbolication import source_path_mapping_args, symbolicate_profile_file
from .viewgeckoprofile import view_gecko_profile

__all__ = [
    "source_path_mapping_args",
    "symbolicate_profile_file",
    "symbolicate_profile_json",
    "symbolicate_profiles",
    "view_gecko_profile",
]
