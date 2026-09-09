# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Monitor Toolbar Button

# Toolbar button that opens the panel where the user creates a monitor
smartwindow-monitor-button =
    .label = Monitors
    .tooltiptext = Monitors

## AI Tasks

# Desktop notification shown when a AI Tasks fires. A "monitor" is
# a user-created task in Smart Window that watches a web page and alerts the
# user when a condition they described is met.
# The user-facing name is not final.
ai-tasks-monitor-notification-title = { -smart-window-brand-name } monitor agent
ai-tasks-monitor-notification-body = Found what you’re watching for.
ai-tasks-monitor-notification-snooze = Snooze
ai-tasks-monitor-notification-dismiss = Dismiss

# Smart Window Alerts
# This file contains localized strings for the Smart Window alerts feature,
# which allows users to create alerts to monitor webpages for changes.

## Alert Creation Form - Strings used in the alert creation dialog and form fields

ai-tasks-alert-name =
  .label = Task name
ai-tasks-alert-alert =
  .label = Notify me when
  .placeholder = Examples: New JBL Tune 670NC headphones under $50 (not refurbished). Lasagna recipe appears on blog home.
  .description = Describe in detail what you want to watch for.
# Variables:
#   $maxPages (number) - The maximum number of webpages that can be monitored
ai-tasks-alert-pages =
  .label = Pages to watch ({ $maxPages } max)
  .placeholder = Type or paste a webpage address
ai-tasks-alert-check-label = How often to check
ai-tasks-alert-time-label = Time
ai-tasks-alert-day-label = Day

## Schedule Options - Strings for scheduling alert frequency

ai-tasks-alert-schedule-daily =
  .label = Daily
ai-tasks-alert-schedule-weekly =
  .label = Weekly

## Day labels for dropdown list for weekly scheduling

ai-tasks-alert-weekday-sunday =
  .label = Sunday
ai-tasks-alert-weekday-monday =
  .label = Monday
ai-tasks-alert-weekday-tuesday =
  .label = Tuesday
ai-tasks-alert-weekday-wednesday =
  .label = Wednesday
ai-tasks-alert-weekday-thursday =
  .label = Thursday
ai-tasks-alert-weekday-friday =
  .label = Friday
ai-tasks-alert-weekday-saturday =
  .label = Saturday

## Alert Actions - Button labels for alert management

ai-tasks-alert-create-button = Create task
ai-tasks-alert-cancel-button = Cancel
ai-tasks-alert-save-button = Save changes
ai-tasks-alert-delete-button =
  .aria-label = Delete alert
ai-tasks-alert-edit-button = Edit
ai-tasks-alert-pause-button = Pause
ai-tasks-alert-resume-button = Resume
ai-tasks-alert-check-now-button = Check now

## Dialog Headers - Titles for alert dialogs

ai-tasks-alert-modal-title = Create task

## Page Content - Strings displayed on the alerts page

ai-tasks-page-title = Tasks
ai-tasks-add-alert-button = Create task
ai-task-page-description = { -smart-window-brand-name } can watch prices and content on pages you choose. You’ll get a desktop notification when it finds a match.
ai-tasks-no-monitors-title = { -smart-window-brand-name } tasks aren’t available in your region
ai-tasks-no-monitors-message = Learn more <a data-l10n-name="smart-window-link">about Smart Window</a>.
ai-task-page-no-alerts = Create a task to track prices or content on pages you choose. You’ll get notified when { -smart-window-brand-name } finds a match.
ai-task-page-no-alerts-title = Watch what matters
# Variables:
#   $count (number) - The number of tasks currently active
ai-tasks-alerts-count = { $count ->
    [one] { $count } task
   *[other] { $count } tasks
}
# Variables:
#   $count (number) - The number of webpages being watched
ai-tasks-alert-watching-pages = { $count ->
    [one] Watching { $count } webpage
   *[other] Watching { $count } webpages
}

## Error Messages - Validation and error messages for alert creation

ai-tasks-alert-error-http-only = Only HTTP and HTTPS URLs are allowed
ai-tasks-alert-error-invalid-url = Please enter a valid URL
ai-tasks-alert-error-duplicate-url = This URL has already been added
# Variables:
#   $maxUrls (number) - Maximum number of URLs allowed per alert
ai-tasks-alert-error-max-urls = { $maxUrls ->
    [one] Maximum of { $maxUrls } URL allowed
   *[other] Maximum of { $maxUrls } URLs allowed
  }

## Accessibility - ARIA labels and accessibility text

ai-tasks-alert-remove-page-label =
  .aria-label = Remove page
ai-tasks-alert-show-details =
  .aria-label = Show task details
ai-tasks-alert-add-url = Add page

## Alert Display - Strings used when displaying alert details

ai-tasks-alert-change-history = Result
ai-tasks-alert-change-history-description = Results show what { -smart-window-brand-name } found at the time of each check. Open the page to confirm.
ai-tasks-alert-on-this-page = Pages to watch
# When viewing a monitor's details the user will see this string as a label for the box containing the prompt the user entered on monitor creation
ai-tasks-alert-the-alert = Notify me when
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-daily-at = Check daily at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-sunday = Check weekly on Sunday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-monday = Check weekly on Monday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-tuesday = Check weekly on Tuesday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-wednesday = Check weekly on Wednesday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-thursday = Check weekly on Thursday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-friday = Check weekly on Friday at { DATETIME($time, timeStyle: "short") }
# Variables:
#   $time (DateTime) - The time to be formatted based on locale
ai-tasks-alert-schedule-weekly-saturday = Check weekly on Saturday at { DATETIME($time, timeStyle: "short") }
ai-tasks-alert-status-watching = Active
ai-tasks-alert-status-paused = Paused

## AI Window Agent chat messages
## Shown in the chat conversation while the Agent sets up or manages a monitor.

# The <a data-l10n-name="tasks"> element links to the tasks page. Its text is
# the page address; keep it and the element (with its name) unchanged.
# Variables:
#   $count (number) - The maximum number of watch tasks allowed
smartwindow-agent-monitor-limit-reached =
    { $count ->
        [one] You’ve got { $count } active watch task, which is the current limit. To create a new task, go to <a data-l10n-name="tasks">about:smartwindowtasks</a> and delete one you no longer need.
       *[other] You’ve got { $count } active watch tasks, which is the current limit. To create a new task, go to <a data-l10n-name="tasks">about:smartwindowtasks</a> and delete one you no longer need.
    }

smartwindow-agent-monitor-setup = Let’s create a task to watch this page. The more detail you include about what you’re looking for, the better.

# Shown when the user runs the watch command from a page that has no address
# to watch (for example an internal page or a blank tab).
smartwindow-agent-monitor-page-not-watchable =
    I can’t watch this page — watching works on regular web pages, not { -brand-product-name }’s own screens.<br/>
    Open the page you want checked and type /watch there.

# Fallback name used for $monitorName when the watched page has no title.
smartwindow-agent-monitor-default-name = Page Watch

# The <a data-l10n-name="tasks"> element links to the tasks page. Its text is
# the page address; keep it and the element (with its name) unchanged.
# Variables:
#   $monitorName (string) - The name of the page or target being watched
#   $schedule (string) - Readable check cadence, e.g. "daily at 9:00 AM"
smartwindow-agent-monitor-watching = I’ll check { $monitorName } { $schedule }. I’ll notify you when I find content matching your task. View or edit this task anytime at <a data-l10n-name="tasks">about:smartwindowtasks</a>.

# Shown in place of the card when the user deletes a task from the chat.
# Variables:
#   $monitorName (string) - The name of the page or target that was being watched
smartwindow-agent-monitor-deleted = I’ve stopped watching { $monitorName } and removed this task.

# Check watch schedule, added { $schedule } in the chat message.
# Variables:
#   $time (date) - The scheduled check time
smartwindow-agent-monitor-schedule-daily = daily at { DATETIME($time, hour: "numeric", minute: "2-digit") }

# Variables:
#   $time (date) - The scheduled check day and time
smartwindow-agent-monitor-schedule-weekly = weekly on { DATETIME($time, weekday: "long") } at { DATETIME($time, hour: "numeric", minute: "2-digit") }

# Status chip and change-history rows shown on a monitor card in chat.
smartwindow-agent-monitor-status-watching = Watching
smartwindow-agent-monitor-status-paused = Paused
smartwindow-agent-monitor-history-check-failed = Check failed. Check again later.
smartwindow-agent-monitor-history-no-match = Checked, didn’t meet your task. Check again later.

## Alert deletion confirmation

ai-tasks-alert-delete-confirmation-title = Delete this task?

ai-tasks-alert-delete-confirmation-message = { -smart-window-brand-name } won’t watch these pages anymore. To stop watching temporarily, pause instead.

ai-tasks-alert-delete-confirm-button = Delete

## Used in the header to show the last check result

ai-tasks-alert-last-result-met = Last result: Match
ai-tasks-alert-last-result-not-met = Last result: No match

## Used in the history table as a simple status badge

ai-tasks-alert-condition-met = Match
ai-tasks-alert-condition-not-met = No match

## AI Tab - A page generated from the content of the user's tabs

# Title given to a generated page when the model returns no title of its own and
# the user did not say what the page should focus on.
ai-tab-default-page-title = Generated page

## Smartbar command palette
## Slash commands shown in the smartbar when the user types "/".

# Group header for the agent task commands (for example, /watch).
smartbar-command-tasks-header = Tasks
# The /watch command creates a task that watches a page for changes.
smartbar-command-watch-label = /watch
smartbar-command-watch-description = Get notified when pages change
# Footer note shown at the bottom of the command palette, hinting that more
# task command types will be added later.
smartbar-command-coming-soon = More types of tasks are coming soon

## Smart Form Fill

ai-smart-form-fill-autocomplete-label = Smart Form Fill
ai-smart-form-fill-autocomplete-loading = Loading…
ai-smart-form-fill-autocomplete-sources-label = Sources:
ai-smart-form-fill-autocomplete-choose-tabs = You need to choose some relevant tabs
ai-smart-form-fill-autocomplete-open-tabs = You need to open some tabs

# Sources are what tabs the Smart Form Fill should use to generate field values
ai-smart-form-fill-edit-sources = Edit sources
ai-smart-form-fill-suggested-tabs = Suggested tabs
ai-smart-form-fill-other-tabs = Other tabs

# Variables:
#   $tabTitle (string) - Title of the tab controlled by the toggle
ai-smart-form-fill-tab-select-toggle =
    .aria-label = Toggle tab selection for “{ $tabTitle }”

ai-smart-form-fill-cancel-tab-select =
    .label = Cancel

ai-smart-form-fill-accept-tab-select =
    .label = Done
