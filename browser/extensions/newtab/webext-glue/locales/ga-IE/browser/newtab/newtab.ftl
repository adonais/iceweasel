# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Firefox Home / New Tab strings for about:home / about:newtab.

newtab-page-title = Cluaisín Nua
newtab-settings-button =
    .title = Saincheap an Leathanach do Chluaisín Nua
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button =
    .title = Saincheap an leathanach seo
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button-label once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button-label = Cur in Oiriúint é
newtab-customize-panel-label =
    .label = Cur in Oiriúint é
newtab-personalize-settings-icon-label =
    .title = Cluaisín Nua a chur in Oiriúint
    .aria-label = Socruithe
newtab-settings-dialog-label =
    .aria-label = Socruithe
newtab-personalize-icon-label =
    .title = Cuir an chluaisín nua in oiriúint duit féin
    .aria-label = Cuir an chluaisín nua in oiriúint duit féin
newtab-personalize-dialog-label =
    .aria-label = Cuir in oiriúint duit féin é
newtab-logo-and-wordmark =
    .aria-label = { -brand-full-name }
newtab-card-dismiss-button =
    .title = Ruaig
    .aria-label = Ruaig

## Strings for "Homepage" and "Firefox Home" sections of about:settings#home.
## Homepage panel

home-homepage-title =
    .label = Leathanach Baile
home-homepage-new-windows =
    .label = Fuinneoga nua
home-homepage-new-tabs =
    .label = Cluaisíní nua

## Custom URLs subpage

home-custom-homepage-address =
    .placeholder = Cuir isteach seoladh
home-custom-homepage-address-button =
    .label = Cuir seoladh leis
# Button that appears in-line after text "Replace with" (home-custom-homepage-replace-with-prompt)
home-custom-homepage-bookmarks-button =
    .label = Leabharmharcanna…

## Firefox Home content

home-prefs-content-header =
    .label = { -firefox-home-brand-name }
home-prefs-search-header2 =
    .label = Cuardach
home-prefs-widgets-header =
    .label = Giuirléidí
# Lists is a widget on New Tab, similar to a to-do widget
home-prefs-lists-header =
    .label = Liostaí
# Timer is a widget on New Tab, similar to the Pomodoro timer.
home-prefs-timer-header =
    .label = Amadóir
# Sports is a widget on New Tab showing sports scores and schedules.
home-prefs-sports-widget-header =
    .label = Spóirt
# Clock is a widget on New Tab that displays time zones around the world.
home-prefs-clocks-header =
    .label = Clog
# Privacy is a widget on New Tab that shows tracking protection activity.
home-prefs-privacy-header =
    .label = Príobháideacht
# Stocks is a widget on New Tab that shows stock ticker prices.
home-prefs-stocks-header =
    .label = Stoic
# Picture of the day is a widget on New Tab that shows a daily Wikimedia Commons image.
home-prefs-picture-header =
    .label = Pictiúr an lae
home-prefs-manage-topics-link2 =
    .label = Bainistigh topaicí
home-prefs-choose-wallpaper-link2 =
    .label = Roghnaigh páipéar balla
home-prefs-firefox-logo-header =
    .label = Lógó { -brand-short-name }
# Variables:
#   $num (number) - Number of rows displayed
home-prefs-sections-rows-option-srd =
    .label =
        { $num ->
            [one] { $num } ró
            [two] { $num } ró
            [few] { $num } ró
            [many] { $num } ró
           *[other] { $num } ró
        }
# Dropdown option shown when an extension replaces the contents of new windows or tabs.
# Variables:
#   $extension (string) - Name of the extension
home-prefs-homepage-extension-option =
    .label = Eisínteacht ({ $extension })
home-mode-choice-custom-srd =
    .label = URLanna saincheaptha…
home-mode-choice-blank-srd =
    .label = Leathanach Bán
home-prefs-shortcuts-header-srd =
    .label = Aicearraí
home-prefs-shortcuts-select =
    .aria-label = Aicearraí
home-prefs-shortcuts-by-option-sponsored-srd =
    .label = Aicearraí urraithe
home-prefs-recommended-by-option-sponsored-stories-srd =
    .label = Scéalta urraithe
home-prefs-highlights-option-visited-pages-srd =
    .label = Leathanaigh ar tugadh cuairt orthu
home-prefs-highlights-options-bookmarks-srd =
    .label = Leabharmharcanna
home-prefs-highlights-option-most-recent-download-srd =
    .label = An íoslódáil is déanaí
home-prefs-recent-activity-header-srd =
    .label = Gníomhaíocht is déanaí
home-prefs-weather-header-srd =
    .label = Aimsir
home-prefs-support-firefox-header-srd =
    .label = Tabhair tacaíocht do { -brand-product-name }
home-prefs-mission-message-learn-more-link-srd = Faigh amach conas

## Strings for the Privacy widget

# Context menu item linking to more information about the Privacy widget.
newtab-privacy-menu-learn-more = Tuilleadh eolais

## Privacy widget — count readout

# Label shown under the large tracker-count number, appearing like:
# Line 1: 86
# Line 2: Trackers blocked today
# Translations can be adjusted to "Today's blocked trackers" or something
# similar if this fixed order causes issues.
# Variables:
#   $count (number) - Number of trackers blocked today
newtab-privacy-trackers-blocked-today =
    { $count ->
        [one] $count lorgaire blocáilte inniu
        [two] $count lorgaire blocáilte inniu
        [few] $count lorgaire blocáilte inniu
        [many] $count lorgaire blocáilte inniu
       *[other] $count lorgaire blocáilte inniu
    }

## Privacy widget — informational messages
##
## Rotating "info" secondary messages. Each message has a body plus a matched
## "-cta" button label sharing the same id stem (the CTA button isn't rendered
## yet; the labels are authored so the pairing is ready).

newtab-privacy-message-info-6-cta = Tuilleadh eolais

## Privacy widget — promotional messages
##
## Rotating "promo" secondary messages suggesting another Firefox feature. Each
## has a body plus a matched "-cta" button label.

newtab-privacy-message-promo-signin-1-cta = Logáil isteach
newtab-privacy-message-promo-private-window-1-cta = Oscail fuinneog phríobháideach

## Strings for the Stocks widget

# Context menu item linking to more information about the Stocks widget.
newtab-stocks-menu-learn-more = Tuilleadh eolais
# Heading for the Stocks widget.
newtab-stocks-widget-title = Stoic

## Strings for the Picture of the Day widget

# Context menu item that restores today’s picture after it has been hidden.
newtab-picture-menu-show-photo = Taispeáin pictiúr an lae inniu
# Icon button shown on the widget once the picture is hidden; restores it.
newtab-picture-show-button =
    .title = Taispeáin pictiúr an lae inniu
    .aria-label = Taispeáin pictiúr an lae inniu

## Search box component.

# "Search" is a verb/action
newtab-search-box-search-button =
    .title = Cuardaigh
    .aria-label = Cuardaigh
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-text = Cuardaigh le { $engine } nó cuir isteach seoladh
newtab-search-box-handoff-text-no-engine = Cuardaigh nó cuir isteach seoladh
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-input =
    .placeholder = Cuardaigh le { $engine } nó cuir isteach seoladh
    .title = Cuardaigh le { $engine } nó cuir isteach seoladh
    .aria-label = Cuardaigh le { $engine } nó cuir isteach seoladh
newtab-search-box-handoff-input-no-engine =
    .placeholder = Cuardaigh nó cuir isteach seoladh
    .title = Cuardaigh nó cuir isteach seoladh
    .aria-label = Cuardaigh nó cuir isteach seoladh
newtab-search-box-text = Cuardaigh an gréasán
newtab-search-box-input =
    .placeholder = Cuardaigh an Gréasán
    .aria-label = Cuardaigh an Gréasán

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-add-search-engine-header = Cuir Inneall Cuardaigh Leis
newtab-topsites-add-shortcut-header = Aicearra Nua
newtab-topsites-edit-topsites-header = Cuir an Barrshuíomh in Eagar
newtab-topsites-edit-shortcut-header = Cuir an tAicearra in Eagar
newtab-topsites-add-shortcut-label = Cuir Aicearra leis
newtab-topsites-add-shortcut-title =
    .title = Cuir Aicearra leis
    .aria-label = Cuir Aicearra leis
newtab-topsites-title-label = Teideal
newtab-topsites-title-input =
    .placeholder = Cuir teideal isteach
newtab-topsites-url-label = URL
newtab-topsites-url-input =
    .placeholder = Clóscríobh nó greamaigh URL
newtab-topsites-url-validation = URL neamhbhailí
newtab-topsites-image-validation = Theip ar an íomhá lódáil. Bain triail as URL eile.

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-clear-input =
    .aria-label = Glan an téacs

## Top Sites - General form dialog buttons. These are verbs/actions.

newtab-topsites-cancel-button = Cealaigh
newtab-topsites-delete-history-button = Scrios ón Stair
newtab-topsites-save-button = Sábháil
newtab-topsites-preview-button = Réamhamharc
newtab-topsites-add-button = Cuir leis

## Top Sites - Delete history confirmation dialog.

newtab-confirm-delete-history-p1 = An bhfuil tú cinnte gur mhaith leat an leathanach seo a scriosadh go hiomlán ó do stair?
# "This action" refers to deleting a page from history.
newtab-confirm-delete-history-p2 = Ní féidir an gníomh seo a chur ar ceal.

## Top Sites - Sponsored label

newtab-topsite-sponsored = Urraithe

## Context Menu - Action Tooltips.

# General tooltip for context menus.
newtab-menu-section-tooltip =
    .title = Oscail roghchlár
    .aria-label = Oscail roghchlár
# Tooltip for dismiss button
newtab-dismiss-button-tooltip =
    .title = Bain
    .aria-label = Bain
# This tooltip is for the context menu of Pocket cards or Topsites
# Variables:
#   $title (string) - The label or hostname of the site. This is for screen readers when the context menu button is focused/active.
newtab-menu-content-tooltip =
    .title = Oscail roghchlár
    .aria-label = Oscail roghchlár comhthéacs i gcomhair { $title }
# Tooltip on an empty topsite box to open the New Top Site dialog.
newtab-menu-topsites-placeholder-tooltip =
    .title = Cuir an suíomh seo in eagar
    .aria-label = Cuir an suíomh seo in eagar

## Context Menu: These strings are displayed in a context menu and are meant as a call to action for a given page.

newtab-menu-edit-topsites = Eagar
newtab-menu-open-new-window = Oscail i bhFuinneog Nua
newtab-menu-open-new-private-window = Oscail i bhFuinneog Nua Phríobháideach
newtab-menu-dismiss = Ruaig
newtab-menu-pin = Pionnáil
newtab-menu-unpin = Díphionnáil
newtab-menu-delete-history = Scrios ón Stair
newtab-menu-save-to-pocket = Sábháil in { -pocket-brand-name }
newtab-menu-delete-pocket = Scrios ó { -pocket-brand-name } é
newtab-menu-archive-pocket = Cuir sa chartlann in { -pocket-brand-name } é
newtab-menu-show-privacy-info = Ár n-urraitheoirí agus do phríobháideacht
newtab-menu-about-fakespot = Maidir le { -fakespot-brand-name }
# Report is a verb (i.e. report issue with the content).
newtab-menu-report = Déan Tuairisc
# Context menu option to personalize New Tab recommended stories by blocking a section of stories,
# e.g. "Sports". "Block" is a verb here.
newtab-menu-section-block = Cuir bac air
# "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
# e.g. Following the travel section of stories.
newtab-menu-section-unfollow-topic = Ná lean
# Context menu option to open a support page explaining the New Tab personalization features and privacy controls.
newtab-menu-section-learn-more = Tuilleadh eolais
# "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
# e.g. Following the travel section of stories.
newtab-menu-section-unfollow = Ná lean an topaic

## Message displayed in a modal window to explain privacy and provide context for sponsored content.

newtab-privacy-modal-button-done = Déanta
newtab-privacy-modal-header = Is rud tábhachtach é do phríobháideacht.

##

# Bookmark is a noun in this case, "Remove bookmark".
newtab-menu-remove-bookmark = Scrios an Leabharmharc
# Bookmark is a verb here.
newtab-menu-bookmark = Cruthaigh leabharmharc

## Context Menu - Downloaded Menu. "Download" in these cases is not a verb,
## it is a noun. As in, "Copy the link that belongs to this downloaded item".

newtab-menu-remove-download = Bain ón Stair é

## Context Menu - Download Menu: These are platform specific strings found in the context menu of an item that has
## been downloaded. The intention behind "this action" is that it will show where the downloaded file exists on the file
## system for each operating system.

newtab-menu-open-file = Oscail Comhad

## Card Labels: These labels are associated to pages to give
## context on how the element is related to the user, e.g. type indicates that
## the page is bookmarked, or is currently open on another device.

newtab-label-visited = Feicthe
newtab-label-bookmarked = Leabharmharcáilte
newtab-label-recommended = Treochtáil
newtab-label-download = Íoslódáilte
# This string is used in the story cards to indicate sponsored content
# Variables:
#   $sponsorOrSource (string) - The name of a company or their domain
newtab-label-sponsored = { $sponsorOrSource } · Urraithe

## Section Menu: These strings are displayed in the section context menu and are
## meant as a call to action for the given section.

newtab-section-menu-add-search-engine = Cuir Inneall Cuardaigh Leis
newtab-section-menu-move-up = Bog Suas
newtab-section-menu-move-down = Bog Síos

## Section Headers.

newtab-section-header-topsites = Barrshuímh
# Variables:
#   $provider (string) - Name of the corresponding content provider.
newtab-section-header-pocket = Molta ag { $provider }

## Empty Section (Content Discovery Experience). These show when there are no more stories or when some stories fail to load.

newtab-discovery-empty-section-topstories-header = Níl aon scéal eile ann!

## Pocket Content Section.

# This is shown at the bottom of the trending stories section and precedes a list of links to popular topics.
newtab-pocket-read-more = Topaicí i mbéal an phobail:
newtab-pocket-more-recommendations = Tuilleadh Moltaí
newtab-pocket-cta-button = Faigh { -pocket-brand-name }
newtab-pocket-save = Sábháil
newtab-pocket-saved = Sábháilte

## Customization Menu

newtab-custom-shortcuts-title = Aicearraí
#  (developer note): @nova-cleanup(remove-string): Remove old string once Nova lands. The newtab-custom-shortcuts-nova string will take over
newtab-custom-shortcuts-toggle =
    .label = Aicearraí
    .description = Suímh a shábháil tú nó a thugann tú cuairt orthu
# Variables
#   $num (number) - Number of rows to display
newtab-custom-row-selector =
    { $num ->
        [one] { $num } ró
        [two] { $num } ró
        [few] { $num } ró
        [many] { $num } ró
       *[other] { $num } ró
    }
newtab-custom-widget-weather-toggle =
    .label = Aimsir
newtab-custom-widget-lists-toggle =
    .label = Liostaí
newtab-custom-widget-timer-toggle =
    .label = Amadóir
newtab-custom-widget-sports-toggle =
    .label = Corn an Domhain
newtab-custom-widget-clock-toggle =
    .label = Clog
newtab-custom-widget-sports-toggle2 =
    .label = Spóirt
newtab-custom-widget-privacy-toggle =
    .label = Príobháideacht
newtab-custom-widget-picture-toggle =
    .label = Pictiúr an lae
newtab-widget-manage-title = Giuirléidí
newtab-widget-manage-widget-button =
    .label = Bainistigh giuirléidí
# Tooltip for close button
newtab-custom-close-menu-button =
    .title = Dún
    .aria-label = Dún an roghchlár
newtab-custom-settings = Bainistigh tuilleadh socruithe

## New Tab Wallpapers

newtab-wallpaper-toggle-title =
    .label = Páipéir balla
newtab-wallpaper-dark-city = Tírdhreach cathrach corcra

## Solid Colors

newtab-wallpaper-colors = Dathanna
newtab-wallpaper-orange = Oráiste
newtab-wallpaper-pink = Bándearg
newtab-wallpaper-light-pink = Bándearg éadrom
newtab-wallpaper-red = Dearg

## Firefox

# Variables
#   $author_string (String) - The name of the creator of the photo.
#   $webpage_string (String) - The name of the webpage where the photo is located.
newtab-wallpaper-attribution = Grianghraf a ghlac <a data-l10n-name="name-link">{ $author_string }</a> ar an <a data-l10n-name="webpage-link">{ $webpage_string }</a>
newtab-wallpaper-feature-highlight-header = Cuir beagán datha leis
newtab-wallpaper-feature-highlight-button = Tuigim

## Firefox

newtab-wallpaper-category-title-firefox = { -brand-product-name }

## New Tab Weather

newtab-weather-todays-forecast = Réamhaisnéis an lae inniu
newtab-weather-see-full-forecast = Féach an réamhaisnéis iomlán
# Display options are:
# - Simple: Displays a current weather condition icon and the current temperature
# - Detailed: Include simple information plus a short text summary: e.g. "Mostly cloudy"
newtab-weather-menu-weather-display-option-simple = Simplí
newtab-weather-menu-temperature-option-fahrenheit = Fahrenheit
newtab-weather-menu-temperature-option-celsius = Celsius
newtab-weather-menu-change-temperature-units-fahrenheit = Athraigh go Fahrenheit
newtab-weather-menu-change-temperature-units-celsius = Athraigh go Celsius
newtab-weather-menu-hide-weather = Folaigh an aimsir ar an gCluaisín Nua
newtab-weather-opt-in-not-now =
    .label = Ní anois
newtab-weather-opt-in-yes =
    .label = Tá
# We'll be showing static (fake) weather data if the user has not opted in to using their location
newtab-weather-static-city = Cathair Nua-Eabhrac

## Topic Labels

newtab-topic-label-sports = Spóirt
newtab-topic-label-tech = Teic
newtab-topic-label-travel = Taisteal
newtab-topic-label-home = Baile & Gairdín

## Topic Selection Modal

# “fine-tune” refers to the process of making small adjustments to something to get
# the best or desired experience or performance.
newtab-topic-selection-title = Roghnaigh topaicí chun do fotha a choigeartú
newtab-topic-selection-save-button = Sábháil
newtab-topic-selection-cancel-button = Cealaigh
newtab-topic-selection-button-maybe-later = Ar ball, b'fhéidir

## Content Feed Sections
## "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
## e.g. Following the travel section of stories.

newtab-section-follow-button = Lean
newtab-section-following-button = Á Leanúint
newtab-section-unfollow-button = Ná lean

## Button to block/unblock listed topics
## "Block", "unblocked", and "blocked" are social media terms that refer to hiding a section of stories.
## e.g. Blocked the politics section of stories.

newtab-section-block-button = Cuir bac air
newtab-section-blocked-button = Bactha

## Confirmation modal for blocking a section

newtab-section-cancel-button = Ní anois
newtab-section-block-cancel-button = Cealaigh

## Strings for custom wallpaper highlight

newtab-section-mangage-topics-title = Topaicí
newtab-custom-wallpaper-cta = Bain triail as

## Strings for reporting issues with ads and content

newtab-report-ads-reason-not-interested =
    .label = Níl suim agam
newtab-report-ads-reason-inappropriate =
    .label = Tá sé míchuí
newtab-report-ads-reason-seen-it-too-many-times =
    .label = Chonaic mé rómhinic é
newtab-report-content-wrong-category =
    .label = Catagóir mhícheart
newtab-report-content-outdated =
    .label = As dáta
newtab-report-content-inappropriate-offensive =
    .label = Míchuí nó déistineach

## Strings introduced by the Nova redesign of the Timer widget

newtab-widget-timer-menu-button =
    .aria-label = Roghanna an amadóra

## Strings introduced by the Nova redesign of the Timer widget

newtab-widget-timer-pause-aria =
    .aria-label = Cuir an t-amadóir ar sos
# Variables:
#   $minutes (number) - The currently selected timer duration in minutes
newtab-widget-timer-spinbutton-name =
    .aria-label =
        { $minutes ->
            [one] { $minutes } nóiméad
            [two] { $minutes } nóiméad
            [few] { $minutes } nóiméad
            [many] { $minutes } nóiméad
           *[other] { $minutes } nóiméad
        }
newtab-widget-timer-decrease-min =
    .title = Laghdaigh 1 nóiméad
newtab-widget-timer-increase-min =
    .title = Méadaigh 1 nóiméad
newtab-widget-timer-mode-group =
    .aria-label = Mód amadóra
# Context-menu item to hide the Timer widget. Replaces the shared "Hide widget"
# copy with a widget-specific string per the Nova design.
newtab-widget-timer-menu-hide = Cuir an t-amadóir i bhfolach
# Message shown inside the Timer widget after a focus session ends.
newtab-widget-timer-celebration-message-focus = An bhfuil sos uait?
# Message shown inside the Timer widget after a break session ends.
newtab-widget-timer-celebration-message-break = Réidh le díriú ar an obair?

##

newtab-sports-widget-menu-follow-teams = Lean foirne
newtab-sports-widget-menu-view-schedule = An Sceideal
newtab-sports-widget-menu-view-upcoming = Féach a bhfuil ar na bacáin
newtab-sports-widget-menu-view-results = Féach ar na torthaí
# Milestone dates (e.g. group stage, semifinals, etc.). Refers to calendar dates.
newtab-sports-widget-menu-key-dates = Na príomhdhátaí
newtab-sports-widget-menu-learn-more = Tuilleadh eolais
# “Keep tabs on” is an informal expression meaning to stay updated on, stay informed on, or regularly follow something (in this case, World Cup matches and updates).
newtab-sports-widget-keep-tabs = Coinnigh súil ar Chorn an Domhain
newtab-sports-widget-get-updates = Is féidir an scéal is déanaí a fháil faoi chluichí,  agus tuilleadh.
newtab-sports-widget-view-schedule =
    .label = An Sceideal
newtab-sports-widget-follow-teams =
    .label = Lean foirne
newtab-sports-widget-view-matches =
    .label = Na Cluichí
# Variables:
#   $number (number) - Maximum number of teams a user can choose to follow in the team selection state
newtab-sports-widget-follow-teams-title =
    { $number ->
        [one] Lean suas le { $number } fhoireann amháin
        [two] Lean suas le { $number } fhoireann
        [few] Lean suas le { $number } bhfoireann
        [many] Lean suas le { $number } foireann
       *[other] Lean suas le { $number } foreann
    }
newtab-sports-widget-choose-wallpaper =
    .label = Roghnaigh páipéar balla
newtab-sports-widget-skip = Léim Thar Seo
newtab-sports-widget-search-country =
    .aria-label = Cuardaigh tír
    .placeholder = Cuardaigh tír
newtab-sports-widget-cancel = Cealaigh
newtab-sports-widget-back-button =
    .aria-label = Siar
# Shown in the follow-teams list for a team that has been knocked out of the tournament.
# Variables:
#   $teamName (string) - the localized team name (e.g. "Canada").
newtab-sports-widget-team-name-eliminated = { $teamName } (díbeartha)
newtab-sports-widget-view-all =
    .label = Taispeáin gach ceann
newtab-sports-widget-show-less =
    .label = Níos lú
# Toggle that filters the list of teams the user follows
newtab-sports-widget-followed-only-toggle =
    .label = Foirne atá á leanúint, agus iadsan amháin
# Watch is a verb (as in watch matches online).
newtab-sports-widget-watch =
    .label = Féach air
    .title = Féach air beo
# Watch is a verb (as in watch matches online).
newtab-sports-widget-watch-icon =
    .title = Féach air beo
    .aria-label = Féach air beo
newtab-sports-widget-watch-dialog-close =
    .title = Dún
    .aria-label = Dún
# Tag: user can watch without paying (sign-in may still be required).
newtab-sports-widget-watch-stream-free = Saor in aisce
# Tag: user can start watching via a trial; continued access may require payment after it ends.
newtab-sports-widget-watch-stream-free-trial = Leagan trialach saor in aisce
# Tag: provider offers both a no-cost or trial path and a paid path.
newtab-sports-widget-watch-stream-free-paid = Saor in aisce agus íoctha
# Tag: user must pay to watch (subscription, TV provider, premium plan, or add-on).
newtab-sports-widget-watch-stream-paid = Íoctha
# Note: provider only streams some matches, not the full tournament.
newtab-sports-widget-watch-stream-select-games-only = Cluichí roghnaithe amháin
# Heading for the list of streaming services available in the user’s country/region.
newtab-sports-widget-watch-available-region = Ar fáil i do réigiún
# Heading for the list of streaming services available outside the user’s country/region.
newtab-sports-widget-watch-available-other-regions = Réigiúin eile
# Button that opens the provider’s stream page in a new tab.
newtab-sports-widget-watch-play =
    .title = Oscail an sruth
    .aria-label = Oscail an sruth
newtab-sports-widget-group-stage = Babhta na nGrúpaí
newtab-sports-widget-group-a = Grúpa A
newtab-sports-widget-group-b = Grúpa B
newtab-sports-widget-group-c = Grúpa C
newtab-sports-widget-group-d = Grúpa D
newtab-sports-widget-group-e = Grúpa E
newtab-sports-widget-group-f = Grúpa F
newtab-sports-widget-group-g = Grúpa G
newtab-sports-widget-group-h = Grúpa H
newtab-sports-widget-group-i = Grúpa I
newtab-sports-widget-group-j = Grúpa J
newtab-sports-widget-group-k = Grúpa K
newtab-sports-widget-group-l = Grúpa L
newtab-sports-widget-round-32 = An 32 deiridh
newtab-sports-widget-round-16 = Ochtú ceannais
newtab-sports-widget-quarter-finals = Ceathrú ceannais
# The "LIVE" string is meant to be uppercase in English, but other languages and locales may vary in how they handle this.
newtab-sports-widget-live = BEO
newtab-custom-widget-live-refresh =
    .title = Athnuaigh na scóir
    .aria-label = Athnuaigh na scóir
# Milestone dates (e.g. group stage, semifinals, etc.). Refers to calendar dates.
newtab-sports-widget-key-dates = Na príomhdhátaí
newtab-sports-widget-upcoming = Ar na bacáin
# Used for a match currently ongoing
newtab-sports-widget-now = Anois
newtab-sports-widget-results = Torthaí
newtab-sports-widget-semi-finals = Cluichí leathcheannais
newtab-sports-widget-bronze-finals = Tríú hÁit
# Final is the final match for 1st place.
newtab-sports-widget-final = Cluiche Ceannais
# Variables:
#   $start (Date) - Start date of a tournament stage
#   $end (Date) - End date of a tournament stage
newtab-sports-widget-key-date-range = { DATETIME($start, day: "numeric", month: "short") } - { DATETIME($end, day: "numeric", month: "short") }
# Variables:
#   $date (Date) - Date of a single tournament event
newtab-sports-widget-key-date = { DATETIME($date, day: "numeric", month: "short") }
newtab-sports-widget-delayed = Moill curtha leis
newtab-sports-widget-postponed = Curtha ar athló
newtab-sports-widget-suspended = Curtha ar fionraí
newtab-sports-widget-cancelled = Curtha ar ceal
newtab-sports-widget-information = Eolas faoin gcluiche
newtab-sports-widget-no-live-data = Níl sonraí faoi na cluichíbeo á nuashonrú faoi láthair
newtab-sports-widget-view-results-link = Féach ar na torthaí
newtab-sports-widget-third-place = An Tríú hÁit
# Runner-up is the team in 2nd place.
newtab-sports-widget-runner-up = An dara háit
newtab-sports-widget-champions = Seaimpíní
newtab-sports-widget-world-cup-champions = Seaimpíní Chorn an Domhain 2026
# Compact champions label for the medium-size widget result card; the larger
# card uses newtab-sports-widget-world-cup-champions.
newtab-sports-widget-world-cup-champions-short = Seaimpíní 2026
newtab-sports-widget-match-full-time = Thart
newtab-sports-widget-match-halftime = Leath-am
newtab-sports-widget-match-extra-time = Am breise
newtab-sports-widget-match-penalties = C. éirice

## Sports widget live-games pagination. Shown when 2+ matches are live at the same time

# arrow button that goes to the previous page of live matches.
newtab-sports-widget-pagination-previous =
    .title = Roimhe seo
    .aria-label = Roimhe seo
# Dot indicator that jumps directly to a given live match.
# $index (number) - 1-based position of this dot in the list.
# $total (number) - Total number of live matches.
newtab-sports-widget-pagination-dot =
    .title = Cluiche beo { $index } de { $total }
    .aria-label = Cluiche beo { $index } de { $total }

## Accessible labels for match rows in the sports widget. These are read by
## screen readers to announce the match details and status.
## Variables shared by all messages in this group:
##   $homeTeam (String) - The full name of the home team (e.g. "Mexico")
##   $awayTeam (String) - The full name of the away team (e.g. "Russia")

# A finished match row (regular full-time result).
# Variables:
#   $homeScore (number) - The home team's regular-time score
#   $awayScore (number) - The away team's regular-time score
newtab-sports-widget-match-aria-label-results =
    .aria-label = { $homeTeam }, { $homeScore } i gcoinne { $awayTeam }, { $awayScore }
# A finished match row that went to a penalty shootout.
# Parenthesized values are the shootout score.
# Variables:
#   $homeScore (number) - The home team's regular-time score
#   $awayScore (number) - The away team's regular-time score
#   $homePenalty (number) - The home team's penalty shootout score
#   $awayPenalty (number) - The away team's penalty shootout score
newtab-sports-widget-match-aria-label-results-penalties =
    .aria-label = { $homeTeam }, { $homeScore } ({ $homePenalty }) i gcoinne { $awayTeam }, { $awayScore } ({ $awayPenalty })
# A match that is currently in progress.
# Variables:
#   $homeScore (number) - The home team's current score
#   $awayScore (number) - The away team's current score
newtab-sports-widget-match-aria-label-now =
    .aria-label = Beo: { $homeTeam }, { $homeScore } i gcoinne { $awayTeam }, { $awayScore }
# An upcoming scheduled match row. Announces kickoff time and date.
# Variables:
#   $date (Date) - The scheduled kickoff date/time
newtab-sports-widget-match-aria-label-upcoming =
    .aria-label = { $homeTeam } v { $awayTeam }, { DATETIME($date, hour: "numeric", minute: "numeric") }, { DATETIME($date, day: "numeric", month: "long") }
# An upcoming match row whose status is "delayed".
newtab-sports-widget-match-aria-label-upcoming-delayed =
    .aria-label = { $homeTeam } v { $awayTeam }, moill curtha leis
# An upcoming match row whose status is "postponed".
newtab-sports-widget-match-aria-label-upcoming-postponed =
    .aria-label = { $homeTeam } vs. { $awayTeam }, curtha ar athló
# An upcoming match row whose status is "suspended".
newtab-sports-widget-match-aria-label-upcoming-suspended =
    .aria-label = { $homeTeam } v { $awayTeam }, curtha  ar fionraí
# An upcoming match row whose status is "cancelled".
newtab-sports-widget-match-aria-label-upcoming-cancelled =
    .aria-label = { $homeTeam } i gcoinne { $awayTeam }, curtha ar ceal

## Sports widget — team names (FIFA country codes)
## Only includes names not adequately covered by standard country-code
## internationalization tooling.

newtab-sports-widget-team-name-label-bih =
    .label = An Bhoisnia agus an Heirseagaivéin
newtab-sports-widget-team-name-label-civ =
    .label = An Cósta Eabhair
newtab-sports-widget-team-name-label-cod =
    .label = PD an Chongó
newtab-sports-widget-team-name-label-eng =
    .label = Sasana
newtab-sports-widget-team-name-label-sco =
    .label = Albain
# Placeholder used in a match row's aria-label for an undecided team (shown visually as "--").
newtab-sports-widget-team-tbd = Le socrú

## Sports widget OMC messages
## Shown as on-screen messages promoting the Sports widget and World Cup wallpapers.

newtab-sports-widget-message-wallpapers-title = Cuir tús le Corn an Domhain le páipéir balla nua
newtab-sports-widget-message-wallpapers-body = Tabhair fuinneamh an chluiche mhóir chuig do bhrabhsálaí feadh an chomórtais.
newtab-sports-widget-message-wallpapers-cta = Roghnaigh páipéar balla
newtab-sports-widget-message-wallpapers-semifinals-title = Faigh páipéar balla nua do na cluichí leathcheannais
newtab-sports-widget-message-wallpapers-semifinals-body = Cruthaigh atmaisféar do na cluichí is mó ag Corn an Domhain
newtab-sports-widget-message-add-widgets-cta =
    .label = Cuir giuirléidí leis
newtab-sports-widget-message-day-in-play-body = Lean Corn an Domhain, fan dírithe, rianaigh an t-am ar fud an domhain, agus tuilleadh.

## Survey prompts shown after the World Cup to gather feedback on the widgets experience.

newtab-sports-widget-message-survey-title = Cabhraigh linn na giuirléidí a fheabhsú
newtab-sports-widget-message-survey-body = Sin sin, tá Corn an Domhain thart. Seol aiseolas faoina cheap tú den taithí.
newtab-sports-widget-message-survey-widget-title = Céard a cheap tú de ghiuirléid Corn an Domhain?
newtab-sports-widget-message-survey-widget-body = Roinn do thuairimí le cabhrú linn giuirléidí amach anseo a fheabhsú. Ansin, bain triail as an gceann nua i do liosta.
newtab-sports-widget-message-survey-cta =
    .label = Tóg suirbhé

## Strings for the Clock widget

# Context menu item: toggle the clock card off.
newtab-clock-widget-menu-hide = Cuir an clog i bhfolach
newtab-clock-widget-menu-learn-more = Tuilleadh eolais
newtab-clock-widget-menu-edit = Cuir na cloig in eagar
newtab-clock-widget-menu-switch-to-12h = Athraigh go formáid 12 uair an chloig
newtab-clock-widget-menu-switch-to-24h = Athraigh go formáid 24 uair an chloig
newtab-clock-widget-label-your-clocks = Na cloig atá agat
# Accessible name for a clock row in the "Your clocks" management panel
# when the row has no user-provided nickname. Read aloud by screen
# readers when focus lands on the row.
# Variables:
#   $city (string) - The city name displayed in the row.
newtab-clock-widget-edit-item =
    .aria-label = { $city }
# Accessible name for a clock row when a user nickname has been set.
# Variables:
#   $city (string) - The city name displayed in the row.
#   $nickname (string) - The user-provided nickname for the row.
newtab-clock-widget-edit-item-with-nickname =
    .aria-label = { $city }, leasainm: { $nickname }
# Shown in place of the search results when the user's query does not match any
# supported city — e.g. typing a misspelled name or a place not in the IANA
# time zone list.
newtab-clock-widget-search-no-results = Níl aon chluiche ar siúl
# $nickname (String) - The user-defined nickname for a saved clock location (e.g., "Home", "Office").
newtab-clock-widget-label-nickname-with-value = Leasainm: { $nickname }
