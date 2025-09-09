# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

## Taskbar Tab urlbar button, will appear if
## browser.taskbarTabs.enabled = true and the user
## navigates to a website.

taskbar-tab-urlbar-button-open =
  .tooltiptext = Add tab to taskbar
taskbar-tab-urlbar-button-close =
  .tooltiptext = Remove tab from taskbar
taskbar-tab-urlbar-button-show = Show Web App page action
taskbar-tab-urlbar-button-hide = Hide Web App page action

# This string is used in the description of a Windows Start Menu
# shortcut for a Taskbar Tab.
# Variables:
#   $name (string) - A name associated to the website. This might be
#                    pulled from a Web Application Manifest, generated
#                    via a heuristic, or simply be the hostname of the
#                    site.
taskbar-tab-shortcut-description = { $name } Web App

# This string is used as the name of the folder that contains Taskbar
# Tabs. Don't use any characters that can't go in a folder name, or
# they will be replaced by underscores. (This generally means to not
# use: '<' '>' ':' '"' '/' '\' '|' '?' '*' . All other characters
# should be fine.)
taskbar-tab-shortcut-folder = { -brand-short-name } Web Apps

## These strings are used as the tooltip for the mute/unmute button.

taskbar-tab-audio-mute =
  .tooltiptext = Mute Tab
taskbar-tab-audio-unmute =
  .tooltiptext = Unmute Tab
