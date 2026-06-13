# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Firefox Home / New Tab strings for about:home / about:newtab.

newtab-page-title = ផ្ទាំង​ថ្មី
newtab-settings-button =
    .title = ប្តូរទំព័រ ផ្ទាំងថ្មី របស់អ្នកតាមបំណង

## Search box component.

# "Search" is a verb/action
newtab-search-box-search-button =
    .title = ស្វែងរក
    .aria-label = ស្វែងរក

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-add-search-engine-header = បន្ថែម​ម៉ាស៊ីន​ស្វែងរក
newtab-topsites-edit-topsites-header = កែសម្រួលសាយកំពូល
newtab-topsites-title-label = ចំណង​ជើង
newtab-topsites-title-input =
    .placeholder = បញ្ចូលចំណងជើង
newtab-topsites-url-label = URL
newtab-topsites-url-input =
    .placeholder = វាយបញ្ចូល ឬបិទភ្ជាប់ URL
newtab-topsites-url-validation = ត្រូវការ URL ដែលត្រឹមត្រូវ
newtab-topsites-image-url-label = URL រូបភាពផ្ទាល់ខ្លួន
newtab-topsites-use-image-link = ប្រើ​ប្រាស់​រូបភាព​ផ្ទាល់ខ្លួន...
newtab-topsites-image-validation = មិន​អាច​ផ្ទុក​រូបភាព​បាន​ទេ។ សាកល្បង URL ផ្សេង។

## Top Sites - General form dialog buttons. These are verbs/actions.

newtab-topsites-cancel-button = បោះបង់
newtab-topsites-delete-history-button = លុប​ពី​ប្រវត្តិ
newtab-topsites-save-button = រក្សាទុក
newtab-topsites-preview-button = មើល​សាកល្បង
newtab-topsites-add-button = បន្ថែម

## Top Sites - Delete history confirmation dialog.

newtab-confirm-delete-history-p1 = តើអ្នកប្រាកដថាអ្នកចង់លុបគ្រប់វត្ថុនៃទំព័រនេះពីប្រវត្តិរបស់អ្នកឬ?
# "This action" refers to deleting a page from history.
newtab-confirm-delete-history-p2 = សកម្មភាពនេះមិនអាចមិនធ្វើឡើង​វិញបានទេ។

## Context Menu - Action Tooltips.

# General tooltip for context menus.
newtab-menu-section-tooltip =
    .title = បើក​ម៉ឺនុយ
    .aria-label = បើក​ម៉ឺនុយ
# This tooltip is for the context menu of Pocket cards or Topsites
# Variables:
#   $title (string) - The label or hostname of the site. This is for screen readers when the context menu button is focused/active.
newtab-menu-content-tooltip =
    .title = បើក​ម៉ឺនុយ
    .aria-label = បើកម៉ឺនុយបរិបទសម្រាប់ { $title }
# Tooltip on an empty topsite box to open the New Top Site dialog.
newtab-menu-topsites-placeholder-tooltip =
    .title = កែសម្រួលសាយនេះ
    .aria-label = កែសម្រួលសាយនេះ

## Context Menu: These strings are displayed in a context menu and are meant as a call to action for a given page.

newtab-menu-edit-topsites = កែសម្រួល
newtab-menu-open-new-window = បើក​នៅ​ក្នុង​បង្អួច​ថ្មី
newtab-menu-open-new-private-window = បើក​នៅ​ក្នុង​បង្អួច​ឯកជន​ថ្មី
newtab-menu-dismiss = បោះបង់ចោល
newtab-menu-pin = ខ្ទាស់
newtab-menu-unpin = ដកខ្ទាស់
newtab-menu-delete-history = លុប​ពី​ប្រវត្តិ
newtab-menu-save-to-pocket = រក្សាទុកទៅ { -pocket-brand-name }
newtab-menu-delete-pocket = លុបចេញពី { -pocket-brand-name }
newtab-menu-archive-pocket = ទុកក្នុងប័ណ្ណសារក្នុង { -pocket-brand-name }

## Message displayed in a modal window to explain privacy and provide context for sponsored content.

newtab-privacy-modal-button-done = ធ្វើ​រួច

##

# Bookmark is a noun in this case, "Remove bookmark".
newtab-menu-remove-bookmark = លុប​ចំណាំ​ចេញ
# Bookmark is a verb here.
newtab-menu-bookmark = ចំណាំ

## Context Menu - Downloaded Menu. "Download" in these cases is not a verb,
## it is a noun. As in, "Copy the link that belongs to this downloaded item".

newtab-menu-copy-download-link = ចម្លង​តំណ​ទាញ​យក
newtab-menu-go-to-download-page = ទៅ​កាន់​ទំព័រ​ទាញ​យក
newtab-menu-remove-download = យក​ចេញពី​ប្រវត្តិ

## Context Menu - Download Menu: These are platform specific strings found in the context menu of an item that has
## been downloaded. The intention behind "this action" is that it will show where the downloaded file exists on the file
## system for each operating system.

newtab-menu-show-file =
    { PLATFORM() ->
        [macos] បង្ហាញក្នុង Finder
       *[other] បើក​ថត​ដែល​ផ្ទុក
    }
newtab-menu-open-file = បើកឯកសារ

## Card Labels: These labels are associated to pages to give
## context on how the element is related to the user, e.g. type indicates that
## the page is bookmarked, or is currently open on another device.

newtab-label-visited = បាន​ចូល​មើល
newtab-label-bookmarked = បាន​ចំណាំ
newtab-label-recommended = និន្នាការ
newtab-label-saved = បានរក្សាទុកទៅ { -pocket-brand-name }
newtab-label-download = បានទាញយក

## Section Menu: These strings are displayed in the section context menu and are
## meant as a call to action for the given section.

newtab-section-menu-remove-section = លុប​ផ្នែក​ចេញ
newtab-section-menu-collapse-section = បង្រួមផ្នែក
newtab-section-menu-expand-section = ពង្រីកផ្នែក
newtab-section-menu-manage-section = គ្រប់គ្រងផ្នែក
newtab-section-menu-manage-webext = គ្រប់គ្រងផ្នែកបន្ថែម
newtab-section-menu-add-topsite = បញ្ចូល​គេហទំព័រ​ពេញនិយម​បំផុត
newtab-section-menu-add-search-engine = បន្ថែម​ម៉ាស៊ីន​ស្វែងរក
newtab-section-menu-move-up = ​ផ្លាស់ទី​ឡើង​លើ
newtab-section-menu-move-down = ផ្លាស់ទី​ចុះក្រោម
newtab-section-menu-privacy-notice = ការជូនដំណឹង​អំពី​ឯកជនភាព

## Section Headers.

newtab-section-header-topsites = វិបសាយ​លើ​គេ
# Variables:
#   $provider (string) - Name of the corresponding content provider.
newtab-section-header-pocket = បានណែនាំដោយ { $provider }

## Empty Section States: These show when there are no more items in a section. Ex. When there are no more Pocket story recommendations, in the space where there would have been stories, this is shown instead.

newtab-empty-section-highlights = ចាប់ផ្តើមការរុករក ហើយយើងនឹងបង្ហាញអត្ថបទ វីដេអូ និងទំព័រដ៏អស្ចារ្យផ្សេងទៀតដែលអ្នកបានមើល ឬបានចំណាំនៅទីនេះ។
# Ex. When there are no more Pocket story recommendations, in the space where there would have been stories, this is shown instead.
# Variables:
#   $provider (string) - Name of the content provider for this section, e.g "Pocket".
newtab-empty-section-topstories = អ្នកបានអានរឿងទាំងអស់ហើយ។ ពិនិត្យ​រឿង​ដែល​ពេញនិយមបំផុត​ឡើងវិញ​​ពី { $provider }។ មិនអាចរង់ចាំ? ជ្រើសរើសប្រធានបទកំពុងពេញនិយម ដើម្បីស្វែងរករឿងដ៏អស្ចារ្យនៅ​លើ​អ៊ីនធឺណិត។

## Pocket Content Section.

# This is shown at the bottom of the trending stories section and precedes a list of links to popular topics.
newtab-pocket-read-more = ប្រធានបទកំពុងពេញនិយម៖
newtab-pocket-more-recommendations = ការណែនាំច្រើនទៀត
newtab-pocket-cta-button = ទាញយក { -pocket-brand-name }

## Thumbs up and down buttons that shows over a newtab stories card thumbnail on hover.

# Clicking the thumbs down button for this story informs us that the user does not feel like the story is interesting for them
newtab-pocket-thumbs-down-tooltip =
    .title = មិនមែនសម្រាប់ខ្ញុំទេ

## Error Fallback Content.
## This message and suggested action link are shown in each section of UI that fails to render.

newtab-error-fallback-info = អូ មានអ្វីមួយខុសប្រក្រតីក្នុងការផ្ទុក​ខ្លឹមសារ​នេះ។
newtab-error-fallback-refresh-link = ផ្ទុកទំព័រឡើងវិញ ដើម្បីព្យាយាមម្ដងទៀត។

## New Tab Wallpapers

newtab-wallpaper-title = ផ្ទាំងរូបភាព
newtab-wallpaper-toggle-title =
    .label = ផ្ទាំងរូបភាព

## New Tab Weather

newtab-weather-opt-in-not-now =
    .label = កុំទាន់
newtab-weather-opt-in-yes =
    .label = បាទ/ចាស៎
# We'll be showing static (fake) weather data if the user has not opted in to using their location
newtab-weather-static-city = ទីក្រុងញូវយ៉ក

## Topic Selection Modal

newtab-topic-selection-cancel-button = បោះបង់

## Confirmation modal for blocking a section

newtab-section-cancel-button = កុំទាន់

## Strings for new user activation custom wallpaper highlight

newtab-new-user-custom-wallpaper-cta = សាកល្បងឥឡូវនេះ

## Strings for reporting issues with ads and content

newtab-report-ads-reason-not-interested =
    .label = ខ្ញុំមិនចាប់អារម្មណ៍ទេ
newtab-report-cancel = បោះបង់

## Strings for task / to-do list productivity widget

# A simple label next to the default list name letting users know this is a new / beta feature
newtab-widget-lists-label-new =
    .label = ថ្មី
# When tasks have been previous marked as complete, they will appear in their own separate list beneath incomplete items
# Variables:
#   $number (number) - Amount of list items marked complete
newtab-widget-lists-completed-list = បានបញ្ចប់ ({ $number })
newtab-widget-lists-menu-delete = លុបបញ្ជីនេះ
newtab-widget-lists-input-menu-delete = លុប
# The placeholder value of the name field for a newly created list
newtab-widget-lists-name-placeholder-new =
    .placeholder = បញ្ជីថ្មី

## Strings introduced by the Nova redesign of the Timer widget

newtab-widget-timer-notification-warning = ការជូនដំណឹងត្រូវបានបិទ
newtab-widget-timer-menu-notifications = បិទការជូនដំណឹង
newtab-widget-timer-menu-notifications-on = បើកការជូនដំណឹង
