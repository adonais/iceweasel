# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Firefox Home / New Tab strings for about:home / about:newtab.

newtab-page-title = Ny fane
newtab-settings-button =
    .title = Tilpass sida for Ny fane
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button =
    .title = Tilpass denne sida
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button-label once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button-label = Tilpass
newtab-customize-panel-label =
    .label = Tilpass
newtab-personalize-settings-icon-label =
    .title = Tilpass ny fane
    .aria-label = Innstillingar
newtab-settings-dialog-label =
    .aria-label = Innstillingar
newtab-personalize-icon-label =
    .title = Tilpass ny fane-side
    .aria-label = Tilpass ny fane-side
newtab-personalize-dialog-label =
    .aria-label = Tilpass
newtab-logo-and-wordmark =
    .aria-label = { -brand-full-name }
newtab-card-dismiss-button =
    .title = Ignorer
    .aria-label = Ignorer

## Strings for "Homepage" and "Firefox Home" sections of about:settings#home.
## Homepage panel

home-homepage-title =
    .label = Startside
home-homepage-new-windows =
    .label = Nye vindauge
home-homepage-new-tabs =
    .label = Nye faner
# This option leads to the "Custom Homepage" subpage
home-homepage-custom-homepage-button =
    .label = Vel ein bestemt nettstad

## Custom URLs subpage

# Subheader on the Custom Homepage subpage. Followed by a form to enter URLs and a list of URLs already saved, if any.
home-custom-homepage-card-header =
    .label = Nettadresse(r)
home-custom-homepage-address =
    .placeholder = Skriv inn adresse
home-custom-homepage-address-button =
    .label = Legg til adresse
# Shown when no custom websites/URLs to use as a homepage have been added yet
home-custom-homepage-no-results =
    .label = Ingen nettstadar lagt til enno.
home-custom-homepage-delete-address-button =
    .aria-label = Slett adresse
    .title = Slett adresse
# Further options to use when setting the home page. Two action buttons are placed in line with this prompt
# to replace the current home page with a currently open page or bookmark.
home-custom-homepage-replace-with-prompt =
    .label = Erstatt med:
# Button that appears in-line after text "Replace with" (home-custom-homepage-replace-with-prompt)
home-custom-homepage-current-pages-button =
    .label = Gjeldande opna sider
# Button that appears in-line after text "Replace with" (home-custom-homepage-replace-with-prompt)
home-custom-homepage-bookmarks-button =
    .label = Bokmerke…

## Firefox Home content

home-prefs-content-header =
    .label = { -firefox-home-brand-name }
home-prefs-search-header2 =
    .label = Søk
home-prefs-stories-header2 =
    .label = Artiklar
    .description = Eineståande innhald utvalt av { -brand-product-name }-familien
home-prefs-widgets-header =
    .label = Widgetar
# Lists is a widget on New Tab, similar to a to-do widget
home-prefs-lists-header =
    .label = Lister
# Timer is a widget on New Tab, similar to the Pomodoro timer.
home-prefs-timer-header =
    .label = Nedteljing
# Sports is a widget on New Tab showing sports scores and schedules.
home-prefs-sports-widget-header =
    .label = Sport
# Clock is a widget on New Tab that displays time zones around the world.
home-prefs-clocks-header =
    .label = Klokke
# Privacy is a widget on New Tab that shows tracking protection activity.
home-prefs-privacy-header =
    .label = Personvern
# Stocks is a widget on New Tab that shows stock ticker prices.
home-prefs-stocks-header =
    .label = Aksjar
# Picture of the day is a widget on New Tab that shows a daily Wikimedia Commons image.
home-prefs-picture-header =
    .label = Dagens bilde
home-prefs-mission-message2 =
    .message = Sponsorane våre støttar oppdraget vårt om å byggje eit betre internett.
home-prefs-manage-topics-link2 =
    .label = Handsam emne
home-prefs-choose-wallpaper-link2 =
    .label = Vel eit bakgrunnsbilde
home-prefs-firefox-logo-header =
    .label = { -brand-short-name }-logo
# Informational message bar that appears in the Firefox Home section when the options are disabled.
# The user must select Firefox Home as their homepage for either new tabs or new windows to enable
# the features in settings.
home-prefs-firefox-home-disabled-notice =
    .message = For å bruke desse funksjonane må du stille inn nye faner eller nye vindauge til { -firefox-home-brand-name }.
# Variables:
#   $num (number) - Number of rows displayed
home-prefs-sections-rows-option-srd =
    .label =
        { $num ->
            [one] { $num } rekkje
           *[other] { $num } rekkjer
        }
# Dropdown option shown when an extension replaces the contents of new windows or tabs.
# Variables:
#   $extension (string) - Name of the extension
home-prefs-homepage-extension-option =
    .label = Utviding ({ $extension })
home-restore-defaults-srd =
    .label = Bruk standardinnstillingar
    .accesskey = r
home-mode-choice-default-fx-srd =
    .label = { -firefox-home-brand-name } (Standard)
home-mode-choice-custom-srd =
    .label = Tilpassa nettadresser…
home-mode-choice-blank-srd =
    .label = Tom side
home-prefs-shortcuts-header-srd =
    .label = Snarvegar
home-prefs-shortcuts-select =
    .aria-label = Snarvegar
home-prefs-shortcuts-by-option-sponsored-srd =
    .label = Sponsa snarvegar
home-prefs-recommended-by-option-sponsored-stories-srd =
    .label = Sponsa historiar
home-prefs-highlights-option-visited-pages-srd =
    .label = Besøkte sider
home-prefs-highlights-options-bookmarks-srd =
    .label = Bokmerke
home-prefs-highlights-option-most-recent-download-srd =
    .label = Siste nedlasting
home-prefs-recent-activity-header-srd =
    .label = Nyleg aktivitet
home-prefs-recent-activity-select =
    .aria-label = Nyleg aktivitet
home-prefs-weather-header-srd =
    .label = Vêr
home-prefs-support-firefox-header-srd =
    .label = Støtt { -brand-product-name }
home-prefs-mission-message-learn-more-link-srd = Finn ut korleis

## Strings for the Privacy widget

# Context menu item linking to more information about the Privacy widget.
newtab-privacy-menu-learn-more = Les meir

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
        [one] Sporar blokkert i dag
       *[other] Sporarar blokkerte i dag
    }
# Second line of the readout, under the large number and "Trackers blocked
# today". Counts the sites those trackers were blocked on. The English is
# shortened from "Blocked across { $count } sites" — translate it that fuller way
# if the short fragment doesn't work in your language.
# Variables:
#   $count (number) - Number of sites where trackers were blocked
newtab-privacy-across-sites =
    { $count ->
        [one] På tvers av { $count } nettstad
       *[other] På tvers av { $count } nettstadar
    }

## Privacy widget — empty state

# Shown when no trackers have been blocked yet today.
newtab-privacy-empty = { -brand-short-name } blokkerer sporarar når du surfar. Du vil sjå dei her.

## Privacy widget — informational messages
##
## Rotating "info" secondary messages. Each message has a body plus a matched
## "-cta" button label sharing the same id stem (the CTA button isn't rendered
## yet; the labels are authored so the pairing is ready).

newtab-privacy-message-info-1 = { -brand-short-name } blokkerer sporarar  automatisk når du surfar
newtab-privacy-message-info-1-cta = Vis vern
newtab-privacy-message-info-2 = Sporingsblokkering hjelper til med å stoppe selskap frå å følgje deg på nettet.
newtab-privacy-message-info-2-cta = Vis vern
newtab-privacy-message-info-3 = Mange nettstadar har sporingsverktøy slik at selskap du aldri har vore innom kan følgje deg på nettet.
newtab-privacy-message-info-3-cta = Vis vern
newtab-privacy-message-info-4 = Å velje { -brand-short-name } betyr å velje vern som standard.
newtab-privacy-message-info-4-cta = Vis vern
newtab-privacy-message-info-5 = Blokkerte sporarar tyder færre selskap kan følgje deg på tvers av nettstadar.
newtab-privacy-message-info-5-cta = Vis vern
newtab-privacy-message-info-6 = Vern dataa dine med { -brand-short-name }. Vi sel dei aldri, men det kan hende at andre nettlesarar gjer det.
newtab-privacy-message-info-6-cta = Les meir
newtab-privacy-message-info-7 = Sjå kva for nokre sporarar { -brand-short-name } blokkerte.
newtab-privacy-message-info-7-cta = Vis vern
newtab-privacy-message-info-8 = Surfing med { -brand-short-name } støttar oppdraget til { -vendor-short-name } om å skape eit betre internett.
newtab-privacy-message-info-8-cta = Les meir
newtab-privacy-message-info-9 = Gjer { -brand-short-name } til din føretrekte nettlesar for innebygd personvern.
newtab-privacy-message-info-9-cta = Bruk som standard
newtab-privacy-message-info-10 = Lagre passord i { -brand-short-name } for å bruke sterke, unike påloggingar overalt.
newtab-privacy-message-info-10-cta = Gå til passord
newtab-privacy-message-info-11 = Finn ut korleis { -brand-short-name } bidreg til å halde nettlesinga di meir privat.
newtab-privacy-message-info-11-cta = Les meir
newtab-privacy-message-info-12 = Blokkering av sporarar kan bidra til å spare bandbreidde på avgrensa dataabonnement.
newtab-privacy-message-info-12-cta = Vis vern
newtab-privacy-message-info-13 = { -brand-short-name } blokkerer sporarar, og frigjer bandbreidde for jamnare strøyming.
newtab-privacy-message-info-13-cta = Vis vern

## Privacy widget — promotional messages
##
## Rotating "promo" secondary messages suggesting another Firefox feature. Each
## has a body plus a matched "-cta" button label.

newtab-privacy-message-promo-monitor-1 = Finn ut om den personlege informasjonen din dukkar opp i ein datalekkasje.
newtab-privacy-message-promo-monitor-1-cta = Les meir
newtab-privacy-message-promo-monitor-2 = Vern informasjonen din med gratis overvaking av datalekkasjar, for opptil 20 e-postar.
newtab-privacy-message-promo-monitor-2-cta = Les meir
newtab-privacy-message-promo-signin-1 = Hald bokmerke, passord og faner krypterte på tvers av einingar med { -vendor-short-name }-kontoen din.
newtab-privacy-message-promo-signin-1-cta = Logg inn
newtab-privacy-message-promo-vpn-1 = Handlar du på offentleg Wi-Fi? Slå på innebygd VPN for ekstra vern.
newtab-privacy-message-promo-vpn-1-cta = Opne VPN
newtab-privacy-message-promo-vpn-2 = Brukar du Wi-Fi på flyplassen? Vern nettlesinga di ved å slå på innebygd VPN.
newtab-privacy-message-promo-vpn-2-cta = Opne VPN
newtab-privacy-message-promo-vpn-3 = Slå på innebygd VPN for å halde plasseringa di meir privat.
newtab-privacy-message-promo-vpn-3-cta = Opne VPN
newtab-privacy-message-promo-private-window-1 = Prøv eit privat vindauge for å surfe meir privat når du deler datamaskin med andre.
newtab-privacy-message-promo-private-window-1-cta = Opne privat vindauge
newtab-privacy-message-promo-relay-1 = Reserver den verkelege e-postadressa di for folk du stolar på; bruk eit e-postalias for registreringar.
newtab-privacy-message-promo-relay-1-cta = Få e-postalias
newtab-privacy-message-promo-relay-2 = Vern innboksen din mot spam med gratis e-postalias.
newtab-privacy-message-promo-relay-2-cta = Få e-postalias
newtab-privacy-message-promo-relay-3 = Få 50 gratis e-postalias for å halde den ekte e-postadressa di privat.
newtab-privacy-message-promo-relay-3-cta = Få e-postalias

## Privacy widget — celebration messages
##
## Earned "celebration" moments (milestones, daily cap, streak, first
## protection). Count-bearing ones interpolate { $count }.

# Variables:
#   $count (number) - Trackers blocked this week
newtab-privacy-message-milestone-week =
    { $count ->
        [one] { $count } sporar blokkert denne veka. Sjå kva { -brand-short-name } held unna
       *[other] { $count } sporarar blokkerte denne veka. Sjå kva { -brand-short-name } held unna
    }
newtab-privacy-message-milestone-week-cta = Vis vern
# Variables:
#   $count (number) - Trackers blocked this month
newtab-privacy-message-milestone-month =
    { $count ->
        [one] { $count } sporar blokkert denne månaden. Eitt lite steg for personvern. Eitt stort steg for sinnsro.
       *[other] { $count } sporarar blokkerte denne månaden. Eitt lite steg for personvern. Eitt stort steg for sinnsro.
    }
newtab-privacy-message-milestone-month-cta = Vis vern
# Variables:
#   $count (number) - Trackers blocked this year
newtab-privacy-message-milestone-year =
    { $count ->
        [one] { $count } sporar blokkert i år. Det er eit sterkt år for ivaretaking av personvernet ditt.
       *[other] { $count } sporarar blokkerte i år. Det er eit sterkt år for ivaretaking av personvernet ditt.
    }
newtab-privacy-message-milestone-year-cta = Vis vern
# Variables:
#   $count (number) - Trackers blocked all-time
newtab-privacy-message-milestone-total =
    { $count ->
        [one] { $count } sporar blokkert. Det er eit stort framsteg for personvern på dine vilkår.
       *[other] { $count } sporarar blokkerte. Det er eit stort framsteg for personvern på dine vilkår.
    }
newtab-privacy-message-milestone-total-cta = Vis vern
# Shown when today's blocked-tracker count reaches the display cap ("100+").
newtab-privacy-message-daily-cap = (Over 100 sporarar vart blokkerte i dag.) Færre sporarar betyr meir personvern.
newtab-privacy-message-daily-cap-cta = Vis vern
# Variables:
#   $count (number) - Consecutive days the user has had trackers blocked
newtab-privacy-message-streak =
    { $count ->
        [one] Du har vore verna { $count } dag på rad.
       *[other] Du har vore verna { $count } dagar på rad.
    }
newtab-privacy-message-streak-cta = Vis vern
# Shown the first time the tracker count goes above zero.
newtab-privacy-message-first-protection = Surf vidare, { -brand-short-name } blokkerer framleis sporingsverktøy.
newtab-privacy-message-first-protection-cta = Vis vern

## Strings for the Stocks widget

# Context menu item for searching stock ticker symbols.
newtab-stocks-menu-search = Søk etter aksjesymbol
# Context menu item linking to more information about the Stocks widget.
newtab-stocks-menu-learn-more = Les meir
# "Stocks widget options" is an icon-only button in the widget toolbar — the
# attributes are consumed as tooltip/screen-reader label only. The button
# never renders visible text.
newtab-stocks-widget-menu-button =
    .title = Innstillingar for aksje-widgeten
    .aria-label = Innstillingar for aksje-widgeten
# Heading for the Stocks widget.
newtab-stocks-widget-title = Aksjar

## Screen-reader summary of a stock ticker.
## Variables:
##   $name (String) - the full fund/ETF name, e.g. "SPDR S&P 500 ETF Trust".
##   $change (String) - the day's percentage change, e.g. "+2.1%".
##   $price (String) - the last price, e.g. "$559.44".

# Stock increased (went up) during the day
newtab-stocks-ticker-status-up = { $name }, opp { $change }, { $price }
# Stock decreased (went down) during the day
newtab-stocks-ticker-status-down = { $name }, ned { $change }, { $price }
# Stock didn't change during the day
newtab-stocks-ticker-status-flat = { $name }, inga endring, { $change }, { $price }

## Strings for the Picture of the Day widget

# Title shown at the top of the widget, with the source name appended.
# "Wikimedia Commons" is a brand name and should not be translated.
newtab-picture-header = Dagens bilde · Wikimedia Commons
# Shorter title shown at the top of the widget, without the source name.
newtab-picture-header-main = Dagens bilde
# Attribution line shown under the title once a picture loads: an author
# credit, a link to the picture's source page, and a link to its license.
# "©" is the copyright symbol.
# $author (string) - the name of the image's author.
newtab-picture-attribution-author = © { $author }
# Link to the picture's source page (its Wikimedia Commons file page).
# "Wikimedia Commons" is a brand name and should not be translated.
newtab-picture-attribution-source-link = Wikimedia Commons
# Screen-reader label for the license link; the visible text is the license
# name (for example "CC BY-SA 4.0") provided with the picture.
# $license (string) - the name of the license.
newtab-picture-attribution-license =
    .aria-label = Vis { $license }-lisensen
# Tooltip and screen-reader label for the icon-only button that opens the
# widget's context menu. The button never renders visible text.
newtab-picture-widget-menu-button =
    .title = Innstillingar for «Dagens bilde»
    .aria-label = Innstillingar for «Dagens bilde»
# Button that sets the current picture as the New Tab background wallpaper. The
# button collapses to an icon when not hovered/focused, so .title is its tooltip.
newtab-picture-set-wallpaper =
    .label = Vel bakgrunnsbilde
    .title = Vel bakgrunnsbilde
    .aria-label = Bruk dagens bilde som bakgrunnsbilde
# Context menu item that opens the New Tab customization panel.
newtab-picture-menu-manage-wallpaper = Behandle bakgrunnsbilde
# Context menu item that hides today’s picture, replacing it with an existing
# wallpaper.
newtab-picture-menu-hide-photo = Skjul dagens bilde
# Context menu item that restores today’s picture after it has been hidden.
newtab-picture-menu-show-photo = Vis dagens bilde
# Context menu item linking to more information about the widget.
newtab-picture-menu-learn-more = Les meir
# Icon button shown on the widget once the picture is hidden; restores it.
newtab-picture-show-button =
    .title = Vis dagens bilde
    .aria-label = Vis dagens bilde
# Shown when there is no new picture to display yet.
newtab-picture-check-back = Sjekk tilbake i morgon for eit nytt bilde
# Screen-reader text alternative for the picture; fallback used when the source
# provides no localized description.
newtab-picture-image-alt = Dagens bilde frå Wikimedia Commons

## Search box component.

# "Search" is a verb/action
newtab-search-box-search-button =
    .title = Søk
    .aria-label = Søk
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-text = Søk med { $engine } eller skriv inn ei adresse
newtab-search-box-handoff-text-no-engine = Søk eller skriv inn ei adresse
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-input =
    .placeholder = Søk med { $engine } eller skriv inn ei adresse
    .title = Søk med { $engine } eller skriv inn ei adresse
    .aria-label = Søk med { $engine } eller skriv inn ei adresse
newtab-search-box-handoff-input-no-engine =
    .placeholder = Søk eller skriv inn ei adresse
    .title = Søk eller skriv inn ei adresse
    .aria-label = Søk eller skriv inn ei adresse
newtab-search-box-text = Søk på nettet
newtab-search-box-input =
    .placeholder = Søk på nettet
    .aria-label = Søk på nettet

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-add-search-engine-header = Legg til søkjemotor
newtab-topsites-add-shortcut-header = Ny snarveg
newtab-topsites-edit-topsites-header = Rediger Mest besøkt
newtab-topsites-edit-shortcut-header = Rediger snarveg
newtab-topsites-add-shortcut-label = Legg til snarveg
newtab-topsites-add-shortcut-title =
    .title = Legg til snarveg
    .aria-label = Legg til snarveg
newtab-shortcuts-pinned-area = Festa områda
newtab-topsites-title-label = Tittel
newtab-topsites-title-input =
    .placeholder = Skriv inn ein tittel
newtab-topsites-url-label = URL
newtab-topsites-url-input =
    .placeholder = Skriv eller lim inn ein URL
newtab-topsites-url-validation = Gyldig URL er påkravd
newtab-topsites-image-url-label = Tilpassa bilde-URL
newtab-topsites-use-image-link = Bruk eit tilpassa bilde…
newtab-topsites-image-validation = Klarte ikkje å lesa bildet. Prøv ein annan URL.

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-clear-input =
    .aria-label = Fjern tekst

## Top Sites - General form dialog buttons. These are verbs/actions.

newtab-topsites-cancel-button = Avbryt
newtab-topsites-delete-history-button = Slett frå historikk
newtab-topsites-save-button = Lagre
newtab-topsites-preview-button = Førehandsvis
newtab-topsites-add-button = Legg til

## Top Sites - Delete history confirmation dialog.

newtab-confirm-delete-history-p1 = Er du sikker på at du vil slette alle førekomstar av denne sida frå historikken din?
# "This action" refers to deleting a page from history.
newtab-confirm-delete-history-p2 = Denne handlinga kan ikkje angrast.

## Top Sites - Sponsored label

newtab-topsite-sponsored = Sponsa

## Label used by screen readers for pinned top sites

# Variables:
#   $title (string) - The label or hostname of the site.
topsite-label-pinned =
    .aria-label = { $title } (festa)
    .title = { $title }

## Context Menu - Action Tooltips.

# General tooltip for context menus.
newtab-menu-section-tooltip =
    .title = Opne meny
    .aria-label = Opne meny
# Tooltip for dismiss button
newtab-dismiss-button-tooltip =
    .title = Fjern
    .aria-label = Fjern
# This tooltip is for the context menu of Pocket cards or Topsites
# Variables:
#   $title (string) - The label or hostname of the site. This is for screen readers when the context menu button is focused/active.
newtab-menu-content-tooltip =
    .title = Opne meny
    .aria-label = Opne kontekstmeny for { $title }
# Tooltip on an empty topsite box to open the New Top Site dialog.
newtab-menu-topsites-placeholder-tooltip =
    .title = Rediger denne nettsida
    .aria-label = Rediger denne nettsida

## Context Menu: These strings are displayed in a context menu and are meant as a call to action for a given page.

newtab-menu-edit-topsites = Rediger
newtab-menu-open-new-window = Opne i nytt vindauge
newtab-menu-open-new-private-window = Opne i eit nytt privat vindauge
newtab-menu-dismiss = Avvis
newtab-menu-pin = Fest
newtab-menu-unpin = Løys
newtab-menu-delete-history = Slett frå historikk
newtab-menu-save-to-pocket = Lagre til { -pocket-brand-name }
newtab-menu-delete-pocket = Slett frå { -pocket-brand-name }
newtab-menu-archive-pocket = Arkiver i { -pocket-brand-name }
newtab-menu-show-privacy-info = Våre sponsorar og ditt personvern
newtab-menu-about-fakespot = Om { -fakespot-brand-name }
# Report is a verb (i.e. report issue with the content).
newtab-menu-report = Rapporter
# Context menu option to personalize New Tab recommended stories by blocking a section of stories,
# e.g. "Sports". "Block" is a verb here.
newtab-menu-section-block = Blokker
# "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
# e.g. Following the travel section of stories.
newtab-menu-section-unfollow-topic = Slutt å følgje
# Context menu option to open a support page explaining the New Tab personalization features and privacy controls.
newtab-menu-section-learn-more = Les meir
# "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
# e.g. Following the travel section of stories.
newtab-menu-section-unfollow = Slutt å følgje emnet

## Context menu options for sponsored stories and new ad formats on New Tab.

newtab-menu-manage-sponsored-content = Handsam sponsa innhald
newtab-menu-our-sponsors-and-your-privacy = Sponsorane våre og ditt personvern
newtab-menu-report-this-ad = Rapporter denne annonsen

## Message displayed in a modal window to explain privacy and provide context for sponsored content.

newtab-privacy-modal-button-done = Ferdig
newtab-privacy-modal-button-manage = Handsam innstillingar for sponsa innhald
newtab-privacy-modal-header = Personvernet ditt er viktig.
newtab-privacy-modal-paragraph-2 =
    I tillegg til å servere fengslande artiklar, viser vi deg også relevant og
    høgt kontrollert innhald frå utvalde sponsorar. Du kan vere sikker på, <strong>at surfedata dine
    aldri forlèt det personlege eksemplaret ditt av  { -brand-product-name }</strong> — vi ser dei ikkje, og sponsorane våre ser dei ikkje heller.
newtab-privacy-modal-link = Lær deg korleis personvernet fungerer på den nye fana

##

# Bookmark is a noun in this case, "Remove bookmark".
newtab-menu-remove-bookmark = Fjern bokmerke
# Bookmark is a verb here.
newtab-menu-bookmark = Bokmerke

## Context Menu - Downloaded Menu. "Download" in these cases is not a verb,
## it is a noun. As in, "Copy the link that belongs to this downloaded item".

newtab-menu-copy-download-link = Kopier nedlastingslenke
newtab-menu-go-to-download-page = Gå til nedlastingsside
newtab-menu-remove-download = Fjern frå historikk

## Context Menu - Download Menu: These are platform specific strings found in the context menu of an item that has
## been downloaded. The intention behind "this action" is that it will show where the downloaded file exists on the file
## system for each operating system.

newtab-menu-show-file =
    { PLATFORM() ->
        [macos] Vis i Finder
       *[other] Opne innhaldsmappe
    }
newtab-menu-open-file = Opne fil

## Card Labels: These labels are associated to pages to give
## context on how the element is related to the user, e.g. type indicates that
## the page is bookmarked, or is currently open on another device.

newtab-label-visited = Besøkt
newtab-label-bookmarked = Bokmerkte
newtab-label-removed-bookmark = Bokmerke fjerna
newtab-label-recommended = Trendar
newtab-label-saved = Lagra til { -pocket-brand-name }
newtab-label-download = Nedlasta
# This string is used in the story cards to indicate sponsored content
# Variables:
#   $sponsorOrSource (string) - The name of a company or their domain
newtab-label-sponsored = { $sponsorOrSource } · Sponsa
# This string is used at the bottom of story cards to indicate sponsored content
# Variables:
#   $sponsor (string) - The name of a sponsor
newtab-label-sponsored-by = Sponsa av { $sponsor }
# This string is used under the image of story cards to indicate source and time to read
# Variables:
#   $source (string) - The name of a company or their domain
#   $timeToRead (number) - The estimated number of minutes to read this story
newtab-label-source-read-time = { $source } · { $timeToRead } min
# This string is used under fixed size ads to indicate sponsored content
newtab-label-sponsored-fixed = Sponsa

## Section Menu: These strings are displayed in the section context menu and are
## meant as a call to action for the given section.

newtab-section-menu-remove-section = Fjern seksjon
newtab-section-menu-collapse-section = Slå saman seksjon
newtab-section-menu-expand-section = Utvid seksjon
newtab-section-menu-manage-section = Handsam seksjon
newtab-section-menu-manage-webext = Handsam utviding
newtab-section-menu-add-topsite = Legg til mest besøkte
newtab-section-menu-add-search-engine = Legg til søkjemotor
newtab-section-menu-move-up = Flytt opp
newtab-section-menu-move-down = Flytt ned
newtab-section-menu-privacy-notice = Personvernfråsegn

## Section aria-labels

newtab-section-collapse-section-label =
    .aria-label = Slå saman seksjon
newtab-section-expand-section-label =
    .aria-label = Utvid seksjon

## Section Headers.

newtab-section-header-topsites = Mest besøkte nettstadar
newtab-section-header-recent-activity = Nyleg aktivitet
# Variables:
#   $provider (string) - Name of the corresponding content provider.
newtab-section-header-pocket = Tilrådd av { $provider }
newtab-section-header-stories = Tankevekkjande artiklar
# "picks" refers to recommended articles
newtab-section-header-todays-picks = Dagens utvalde artiklar for deg

## Empty Section States: These show when there are no more items in a section. Ex. When there are no more Pocket story recommendations, in the space where there would have been stories, this is shown instead.

newtab-empty-section-highlights = Begynn å surfe, og vi vil vise deg nokre av dei beste artiklane, videoane og andre sider du nyleg har besøkt eller bokmerka her.
# Ex. When there are no more Pocket story recommendations, in the space where there would have been stories, this is shown instead.
# Variables:
#   $provider (string) - Name of the content provider for this section, e.g "Pocket".
newtab-empty-section-topstories = Det finst ikkje fleire. Kom tilbake seinare for fleire topphistoriar frå { $provider }. Kan du ikkje vente? Vel eit populært emne for å finne fleire gode artiklar frå heile nettet.
# Ex. When there are no more story recommendations, in the space where there would have been stories, this is shown instead.
newtab-empty-section-topstories-generic = Du har no lest alt. Kom tilbake seinare for fleire artiklar. Kan du ikkje vente? Vel eit populært emne for å finne fleire flotte artiklar frå nettet.

## Empty Section (Content Discovery Experience). These show when there are no more stories or when some stories fail to load.

newtab-discovery-empty-section-topstories-header = Du har lest alt!
newtab-discovery-empty-section-topstories-content = Kom tilbake seinare for fleire artiklar.
newtab-discovery-empty-section-topstories-try-again-button = Prøv på nytt
newtab-discovery-empty-section-topstories-loading = Lastar…
# Displays when a layout in a section took too long to fetch articles.
newtab-discovery-empty-section-topstories-timed-out = Ops! Vi lasta nesten denne delen, men ikkje heilt.

## Pocket Content Section.

# This is shown at the bottom of the trending stories section and precedes a list of links to popular topics.
newtab-pocket-read-more = Populære emne:
newtab-pocket-new-topics-title = Vil du ha endå fleire artiklar? Sjå desse populære emna frå { -pocket-brand-name }
newtab-pocket-more-recommendations = Fleire tilrådingar
newtab-pocket-learn-more = Les meir
newtab-pocket-cta-button = Last ned { -pocket-brand-name }
newtab-pocket-cta-text = Lagre artiklane du synest er interessante i { -pocket-brand-name }, og stimuler tankane dine med fasinerande lesemateriell.
newtab-pocket-pocket-firefox-family = { -pocket-brand-name } er ein del av { -brand-product-name }-familien.
newtab-pocket-save = Lagre
newtab-pocket-saved = Lagra

## Thumbs up and down buttons that shows over a newtab stories card thumbnail on hover.

# Clicking the thumbs up button for this story will result in more stories like this one being recommended
newtab-pocket-thumbs-up-tooltip =
    .title = Meir som dette
# Clicking the thumbs down button for this story informs us that the user does not feel like the story is interesting for them
newtab-pocket-thumbs-down-tooltip =
    .title = Ikkje for meg
# Used to show the user a message upon clicking the thumbs up or down buttons
newtab-toast-thumbs-up-or-down2 =
    .message = Takk. Tilbakemeldinga di  vil hjelpe oss med å gjere kjelda di betre.
newtab-toast-dismiss-button =
    .title = Avvis
    .aria-label = Avvis

## Pocket content onboarding experience dialog and modal for new users seeing the Pocket section for the first time, shown as the first item in the Pocket section.

newtab-pocket-onboarding-discover = Oppdag det beste på nettet
newtab-pocket-onboarding-cta = { -pocket-brand-name } utforskar ei mengde ulike publikasjonar for å få det mest informative, inspirerande og pålitelege innhaldet direkte til { -brand-product-name }-nettlesaren din.

## Error Fallback Content.
## This message and suggested action link are shown in each section of UI that fails to render.

newtab-error-fallback-info = Ops, noko gjekk gale då innhaldet skulle lastast inn.
newtab-error-fallback-refresh-link = Oppdater sida for å prøve på nytt.

## Customization Menu

newtab-custom-shortcuts-title = Snarvegar
newtab-custom-shortcuts-subtitle = Nettstadar du lagrar eller besøkjer
#  (developer note): @nova-cleanup(remove-string): Remove old string once Nova lands. The newtab-custom-shortcuts-nova string will take over
newtab-custom-shortcuts-toggle =
    .label = Snarvegar
    .description = Nettstadar du lagrar eller besøkjer
newtab-custom-shortcuts-nova =
    .label = Snarvegar
newtab-custom-row-description =
    .description = Antal rader
# Variables
#   $num (number) - Number of rows to display
#  (developer note): @nova-cleanup(remove-string): Remove string once Nova lands. We won't be using "row"/"rows" anymore for the dropdown
newtab-custom-row-selector2 =
    .label =
        { $num ->
            [one] { $num } rad
           *[other] { $num } rader
        }
# Variables
#   $num (number) - Number of rows to display
newtab-custom-row-selector =
    { $num ->
        [one] { $num } rad
       *[other] { $num } rader
    }
newtab-custom-sponsored-sites = Sponsa snarvegar
newtab-custom-pocket-title = Tilrådd av { -pocket-brand-name }
newtab-custom-pocket-subtitle = Eksepsjonelt innhald sett saman av { -pocket-brand-name }, ein del av { -brand-product-name }-familien
#  (developer note): @nova-cleanup(remove-string): Remove string once Nova lands. We won't be having a description under "Recommended stories" anymore
newtab-custom-stories-toggle =
    .label = Tilrådde artiklar
    .description = Eineståande innhald utvalt av { -brand-product-name } familien
newtab-recommended-stories-toggle =
    .label = Tilrådde artiklar
newtab-custom-stories-personalized-toggle =
    .label = Artiklar
newtab-custom-stories-personalized-checkbox =
    .label = Personlege artiklar basert på aktiviteten din
newtab-custom-stories-personalized-checkbox-label = Personlege artiklar basert på aktiviteten din
newtab-custom-pocket-sponsored = Sponsa historier
newtab-custom-pocket-show-recent-saves = Vis siste lagra
newtab-custom-recent-title = Nyleg aktivitet
newtab-custom-recent-subtitle = Eit utval av nylege nettstadar og innhald
newtab-custom-weather-toggle =
    .label = Vêr
    .description = Dagens vêrmelding i korte trekk
newtab-custom-widget-weather-toggle =
    .label = Vêr
newtab-custom-widget-lists-toggle =
    .label = Lister
newtab-custom-widget-timer-toggle =
    .label = Nedteljing
newtab-custom-widget-sports-toggle =
    .label = VM
newtab-custom-widget-clock-toggle =
    .label = Klokke
newtab-custom-widget-sports-toggle2 =
    .label = Sport
newtab-custom-widget-privacy-toggle =
    .label = Personvern
newtab-custom-widget-stocks-toggle =
    .label = Aksjar
newtab-custom-widget-picture-toggle =
    .label = Dagens bilde
newtab-custom-widget-section-title = Widgetar
newtab-custom-widget-section-toggle =
    .label = Widgetar
newtab-widget-manage-title = Widgetar
newtab-widget-manage-widget-button =
    .label = Handsam widgetar
# Tooltip for close button
newtab-custom-close-menu-button =
    .title = Lat att
    .aria-label = Lat att meny
newtab-custom-close-button = Lat att
newtab-custom-settings = Handsam fleire innstillingar

## New Tab Wallpapers

newtab-wallpaper-title = Bakgrunnsbilde
newtab-wallpaper-reset = Still tilbake til standard
#  (developer note): @nova-cleanup(remove-string): Remove old "Upload an image" string once Nova lands. The new "Add an image"  string will take over
newtab-wallpaper-upload-image = Last opp eit bilde
newtab-wallpaper-add-an-image = Legg til eit bilde
newtab-wallpaper-custom-color = Vel ein farge
newtab-wallpaper-toggle-title =
    .label = Bakgrunnsbilde
# Variables
#   $file_size (number) - The number of the maximum image file size (in MB) that may be uploaded
newtab-wallpaper-error-max-file-size = Bildet overskreid filstorleiksgrensa på { $file_size }MB. Prøv å laste opp ei mindre fil.
newtab-wallpaper-error-upload-file-type = Vi klarte ikkje å laste opp fila di. Prøv igjen med ei bildefil.
newtab-wallpaper-error-file-type = Vi klarte ikkje å laste opp fila di. Prøv igjen med ein annan filtype.
newtab-wallpaper-light-red-panda = Raudpanda
newtab-wallpaper-light-mountain = Kvitt fjell
newtab-wallpaper-light-sky = Himmel med lilla og rosa skyer
newtab-wallpaper-light-color = Blå, rosa og gule former
newtab-wallpaper-light-landscape = Fjellandskap med blå tåke
newtab-wallpaper-light-beach = Strand med palmetre
newtab-wallpaper-dark-aurora = Nordlys
newtab-wallpaper-dark-color = Raude og blå former
newtab-wallpaper-dark-panda = Raudpanda gøymt i skogen
newtab-wallpaper-dark-sky = Bylandskap med nattehimmel
newtab-wallpaper-dark-mountain = Fjellandskap
newtab-wallpaper-dark-city = Lilla bylandskap
newtab-wallpaper-dark-fox-anniversary = Ein rev på fortauet nær ein skog
newtab-wallpaper-light-fox-anniversary = Ein rev i ei graskledd mark med eit tåkete fjellandskap

## Solid Colors

#  (developer note): @nova-cleanup(remove-string): Remove old "Solid colors" string once Nova lands. The simplified "Colors" string will take over
newtab-wallpaper-category-title-colors = Einsfarga
newtab-wallpaper-colors = Fargar
newtab-wallpaper-blue = Blå
newtab-wallpaper-light-blue = Lyseblå
newtab-wallpaper-light-purple = Lyselilla
newtab-wallpaper-light-green = Lysegrøn
newtab-wallpaper-green = Grøn
newtab-wallpaper-beige = Beige
newtab-wallpaper-yellow = Gul
newtab-wallpaper-orange = Oransje
newtab-wallpaper-pink = Rosa
newtab-wallpaper-light-pink = Lyserosa
newtab-wallpaper-red = Raud
newtab-wallpaper-dark-blue = Mørkeblå
newtab-wallpaper-dark-purple = Mørkelilla
newtab-wallpaper-dark-green = Mørkegrøn
newtab-wallpaper-brown = Brun

## Abstract

newtab-wallpaper-category-title-abstract = Abstrakt
newtab-wallpaper-abstract-green = Grøne former
newtab-wallpaper-abstract-blue = Blåe former
newtab-wallpaper-abstract-purple = Lilla former
newtab-wallpaper-abstract-orange = Oransje former
newtab-wallpaper-gradient-orange = Fargeovergang oransje og rosa
newtab-wallpaper-abstract-blue-purple = Blå og lilla former
newtab-wallpaper-abstract-white-curves = Kvit med skraverte kurver
newtab-wallpaper-abstract-purple-green = Fargeovergang med lilla og grønt lys
newtab-wallpaper-abstract-blue-purple-waves = Blå og lilla bølgjeformer
newtab-wallpaper-abstract-black-waves = Svarte bølgjeformer

## Firefox

newtab-wallpaper-category-title-photographs = Fotografi
newtab-wallpaper-beach-at-sunrise = Strand ved soloppgang
newtab-wallpaper-beach-at-sunset = Strand ved solnedgang
newtab-wallpaper-storm-sky = Stormhimmel
newtab-wallpaper-sky-with-pink-clouds = Himmel med rosa skyer
newtab-wallpaper-red-panda-yawns-in-a-tree = Raud panda som geispar i eit tre
newtab-wallpaper-white-mountains = Kvite fjell
newtab-wallpaper-hot-air-balloons = Fargespel av luftballongar på dagtid
newtab-wallpaper-starry-canyon = Blå stjerneklar kveld
newtab-wallpaper-suspension-bridge = Foto av grå hengebru på dagtid
newtab-wallpaper-sand-dunes = Kvite sanddyner
newtab-wallpaper-palm-trees = Silhuett av kokospalmar i den gylne timen
newtab-wallpaper-blue-flowers = Nærbiletfotografering av blåblada blomstrar i bløming
# Variables
#   $author_string (String) - The name of the creator of the photo.
#   $webpage_string (String) - The name of the webpage where the photo is located.
newtab-wallpaper-attribution = Bilde av <a data-l10n-name="name-link">{ $author_string }</a> på <a data-l10n-name="webpage-link">{ $webpage_string }</a>
newtab-wallpaper-feature-highlight-header = Prøv ein fargeklatt
newtab-wallpaper-feature-highlight-content = Gje ny fane-sida ein friskt utsjånad med bakgrunnsbilde.
newtab-wallpaper-feature-highlight-button = Eg forstår
# Tooltip for dismiss button
feature-highlight-dismiss-button =
    .title = Lat att
    .aria-label = Lat att sprettoppvindauge
feature-highlight-wallpaper =
    .title = { -newtab-wallpaper-feature-highlight-header }
    .aria-label = { -newtab-wallpaper-feature-highlight-content }

## Firefox

newtab-wallpaper-category-title-firefox = { -brand-product-name }

## Celestial

# “Celestial” referring to astronomy; positioned in or relating to the sky,
# or outer space as observed in astronomy.
# Not to be confused with religious definition of the word.
newtab-wallpaper-category-title-celestial = Verdsrommet
newtab-wallpaper-celestial-lunar-eclipse = Måneformørking
newtab-wallpaper-celestial-earth-night = Nattfoto frå låg bane rundt jorda
newtab-wallpaper-celestial-starry-sky = Stjerneklar himmel
newtab-wallpaper-celestial-eclipse-time-lapse = Intervallfoto av måneformørking
newtab-wallpaper-celestial-black-hole = Illustrasjon av galakse med svart hol
newtab-wallpaper-celestial-river = Satellittbilde av elv

## New Tab Weather

# Variables:
#   $provider (string) - Service provider for weather data
newtab-weather-see-forecast =
    .title = Sjå vêrmelding hos { $provider }.
# Variables:
#   $provider (string) - Service provider for weather data
newtab-weather-sponsored = { $provider } ∙ Sponsa
newtab-weather-menu-change-location = Endre plassering
newtab-weather-change-location-search-input-placeholder =
    .placeholder = Søk plassering
    .aria-label = Søk plassering
# "Current" refers to the user's physical/geographic location detected via geolocation.
newtab-weather-change-location-search-use-current =
    .label = Bruk gjeldande plassering
newtab-weather-menu-weather-display = Vêrvising
newtab-weather-todays-forecast = Vêrmeldinga i dag.
newtab-weather-see-full-forecast = Sjå fullstendig vêrmelding
# Display options are:
# - Simple: Displays a current weather condition icon and the current temperature
# - Detailed: Include simple information plus a short text summary: e.g. "Mostly cloudy"
newtab-weather-menu-weather-display-option-simple = Enkel
newtab-weather-menu-change-weather-display-simple = Byt til enkel vising
newtab-weather-menu-weather-display-option-detailed = Detaljert
newtab-weather-menu-change-weather-display-detailed = Byt til detaljert vising
newtab-weather-menu-temperature-units = Temperatureiningar
newtab-weather-menu-temperature-option-fahrenheit = Fahrenheit
newtab-weather-menu-temperature-option-celsius = Celsius
newtab-weather-menu-change-temperature-units-fahrenheit = Byt til Fahrenheit
newtab-weather-menu-change-temperature-units-celsius = Byt til Celsius
newtab-weather-menu-hide-weather = Skjul vêret på ny fane
newtab-weather-menu-learn-more = Les meir
newtab-weather-menu-detect-my-location = Oppdag posisjonen min
# This message is shown if user is working offline
newtab-weather-error-not-available = Vêrdata er ikkje tilgjengeleg akkurat no.
newtab-weather-opt-in-see-weather = Vil du sjå vêret for plasseringa di?
newtab-weather-opt-in-not-now =
    .label = Ikkje no
newtab-weather-opt-in-yes =
    .label = Ja
newtab-weather-opt-in-headline = Få di lokale vêrmelding
newtab-weather-opt-in-use-location =
    .label = Bruk plassering
newtab-weather-opt-in-choose-location = Vel plassering
# We'll be showing static (fake) weather data if the user has not opted in to using their location
newtab-weather-static-city = New York City
# "Highest" here refers to the highest temperature of the day
newtab-weather-high =
    .aria-label = Høg
# "Lowest" here refers to the lowest temperature of the day
newtab-weather-low =
    .aria-label = Låg
# Variables:
#   $provider (string) - Service provider for weather data
newtab-weather-see-forecast-description =
    .title = Sjå vêrmelding hos { $provider }.
    .aria-description = { $provider } ∙ Sponsa

## Topic Labels

newtab-topic-label-business = Business
newtab-topic-label-career = Karriere
newtab-topic-label-education = Utdanning
newtab-topic-label-arts = Underhaldning
newtab-topic-label-food = Mat
newtab-topic-label-health = Helse
newtab-topic-label-hobbies = Spel
# ”Money” = “Personal Finance”, refers to articles and stories that help readers better manage
# and understand their personal finances – from saving money to buying a home. See the
# “Curated by our editors“ section at the top of https://getpocket.com/explore/personal-finance for more context
newtab-topic-label-finance = Pengar
newtab-topic-label-society-parenting = Foreldreskap
newtab-topic-label-government = Politikk
newtab-topic-label-education-science = Vitskap
# ”Life Hacks” = “Self Improvement”, refers to articles and stories aimed at helping readers improve various
# aspects of their lives – from mental health to  productivity. See the “Curated by our editors“ section
# at the top of https://getpocket.com/explore/self-improvement for more context.
newtab-topic-label-society = Kvardagsknep og småtriks
newtab-topic-label-sports = Sport
newtab-topic-label-tech = Teknologi
newtab-topic-label-travel = Reise
newtab-topic-label-home = Heim og hage

## Topic Selection Modal

# “fine-tune” refers to the process of making small adjustments to something to get
# the best or desired experience or performance.
newtab-topic-selection-title = Vel emne for å finjustere feed-en din
# “tailored” refers to process of (a tailor) making (clothes) to fit individual customers.
# In other words, “Our expert curators prioritize stories to fit your selected interests”
newtab-topic-selection-subtitle = Vel to eller fleire emne. Ekspertkuratorane våre prioriterer artiklar tilpassa etter dine interesser. Oppdater når som helst.
newtab-topic-selection-save-button = Lagre
newtab-topic-selection-cancel-button = Avbryt
newtab-topic-selection-button-maybe-later = Kanskje seinare
newtab-topic-selection-privacy-link = FInn ut korleis vi vernar og handsamar data
newtab-topic-selection-button-update-interests = Oppdater interessene dine
newtab-topic-selection-button-pick-interests = Vel interessene dine

## Content Feed Sections
## "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
## e.g. Following the travel section of stories.

newtab-section-follow-button = Følg
# Variables:
#   $topic (string) - Topic that the user can follow
newtab-section-follow-button-label =
    .aria-label = Følg { $topic }
newtab-section-following-button = Følgjer
newtab-section-unfollow-button = Slutt å følgje
# Variables:
#   $topic (string) - Topic that the user is following and can unfollow
newtab-section-unfollow-button-label =
    .aria-label = Følgjer: Slutt å følgje { $topic }
# A modal may appear next to the Follow button, directing users to try out the feature
newtab-section-follow-highlight-title = Finjuster kjelda di
newtab-section-follow-highlight-subtitle = Følg interessene dine for å sjå meir av det du likar.

## Button to block/unblock listed topics
## "Block", "unblocked", and "blocked" are social media terms that refer to hiding a section of stories.
## e.g. Blocked the politics section of stories.

newtab-section-block-button = Blokker
newtab-section-blocked-button = Blokkert
newtab-section-unblock-button = Opphev blokkeringa
# Variables:
#   $topic (string) - Name of topic that user is following
newtab-section-follow-topic =
    .aria-label = Følg { $topic }
# Variables:
#   $topic (string) - Name of topic that user is unfollowing
newtab-section-unfollow-topic =
    .aria-label = Slutt å følgje { $topic }
# Variables:
#   $topic (string) - Name of topic that user is blocking
newtab-section-block-topic =
    .aria-label = Blokker { $topic }
# Variables:
#   $topic (string) - Name of topic that user is unblocking
newtab-section-unblock-topic =
    .aria-label = Opphev blokkering av { $topic }

## Confirmation modal for blocking a section

newtab-section-cancel-button = Ikkje no
newtab-section-confirm-block-topic-p1 = Er du sikker på at du vil blokkere dette emnet?
newtab-section-confirm-block-topic-p2 = Blokkerte emne vil ikkje lenger visast i kanalen din.
# Variables:
#   $topic (string) - Name of topic that user is blocking
newtab-section-block-topic-button = Blokker { $topic }
newtab-section-block-cancel-button = Avbryt

## Strings for custom wallpaper highlight

newtab-section-mangage-topics-title = Emne
newtab-section-manage-topics-button-v2 =
    .label = Handsam emne
newtab-section-mangage-topics-followed-topics = Følgt
newtab-section-mangage-topics-followed-topics-empty-state = Du har ikkje følgt nokon emne enno.
newtab-section-mangage-topics-blocked-topics = Blokkert
newtab-section-mangage-topics-blocked-topics-empty-state = Du har ikkje blokkert nokon emne enno.
newtab-custom-wallpaper-title = No får du tilpassa bakgrunnsbilde
# 'Make firefox yours" means to customize or personalize
newtab-custom-wallpaper-subtitle = Last opp ditt eige bakgrunnsbilde eller vel ein farge for å gjere { -brand-product-name } til din.
newtab-custom-wallpaper-cta = Prøv det

## Strings for new user activation custom wallpaper highlight

newtab-new-user-custom-wallpaper-title = Vel eit bakgrunnsbilde for å gjere { -brand-product-name } til din eigen
newtab-new-user-custom-wallpaper-subtitle = Få kvar nye fane til å kjennast som heime med tilpassa bakgrunnar og fargar.
newtab-new-user-custom-wallpaper-cta = Prøv det no

## Strings for Nova wallpaper feature highlight

newtab-wallpaper-feature-highlight-title = Nye bakgrunnsbilde er no tilgjengelege
newtab-wallpaper-feature-highlight-subtitle = Vel favoritten din og få kvar ny fane til å kjennast som heime
newtab-wallpaper-feature-highlight-cta = Vel bakgrunnsbilde

## Strings for download mobile highlight

newtab-download-mobile-highlight-title = Last ned { -brand-product-name } for mobil
# "Scan the code" refers to scanning the QR code that appears above the body text that leads to Firefox for mobile download.
newtab-download-mobile-highlight-body-variant-a = Skann koden for å surfe trygt medan du er på farta.
newtab-download-mobile-highlight-body-variant-b = Hald fram der du slutta når du synkroniserer faner, passord, og meir.
newtab-download-mobile-highlight-body-variant-c = Visste du at du kan ta med { -brand-product-name } på farta? Same nettlesar. I lomma.
newtab-download-mobile-highlight-image =
    .aria-label = QR-kode for å laste ned { -brand-product-name } for mobil

## Strings for shortcuts highlight

newtab-shortcuts-highlight-title = Dine favorittar lett tilgjengelege
newtab-shortcuts-highlight-subtitle = Legg til ein snarveg for å ha favorittnettstadane dine eitt klikk unna.

## Strings for reporting issues with ads and content

newtab-report-content-why-reporting-this =
    .label = Kvifor rapporterer du dette?
newtab-report-ads-reason-not-interested =
    .label = Eg er ikkje interessert
newtab-report-ads-reason-inappropriate =
    .label = Det er upassande
newtab-report-ads-reason-seen-it-too-many-times =
    .label = Eg har sett den altfor mange gongar
newtab-report-content-wrong-category =
    .label = Feil kategori
newtab-report-content-outdated =
    .label = Utdatert
newtab-report-content-inappropriate-offensive =
    .label = Upassande eller krenkande
newtab-report-content-spam-misleading =
    .label = Søppelpost eller villeiande
newtab-report-content-requires-payment-subscription =
    .label = Krev betaling eller abonnement
newtab-report-content-requires-payment-subscription-learn-more = Les meir
newtab-report-cancel = Avbryt
newtab-report-submit = Send inn
newtab-toast-thanks-for-reporting =
    .message = Takk for at du rapporterte dette.
newtab-toast-widgets-hidden =
    .message = Vel blyantikonet for å leggje til widgetar igjen, når som helst.
# Variables:
#   $topic (string) - Topic that the user has followed
newtab-section-toast-follow =
    .message = Du følgjer no { $topic }.
# Variables:
#   $topic (string) - Topic that the user has unfollowed
newtab-section-toast-unfollow =
    .message = Du følgjer ikkje lenger { $topic }.
# Variables:
#   $topic (string) - Topic that the user has blocked
newtab-section-toast-block =
    .message = Du vil ikkje lenger sjå artiklar om { $topic }.

## Strings for task / to-do list productivity widget

# "Add one" means adding a new task to the list (e.g., "Walk the dog")
newtab-widget-lists-empty-cta = Moglegheitene er uendelege. Legg til éi.
# A simple label next to the default list name letting users know this is a new / beta feature
newtab-widget-lists-label-new =
    .label = Ny
newtab-widget-lists-label-beta =
    .label = Beta
# When tasks have been previous marked as complete, they will appear in their own separate list beneath incomplete items
# Variables:
#   $number (number) - Amount of list items marked complete
newtab-widget-lists-completed-list = Fullført ({ $number })
newtab-widget-lists-celebration-headline = Bra jobba
newtab-widget-lists-celebration-subhead = Alt klart
newtab-widget-task-list-menu-copy = Kopier
newtab-widget-lists-menu-edit = Rediger listenamn
newtab-widget-lists-menu-edit2 =
    .aria-label = Rediger listenamn
newtab-widget-lists-menu-create = Opprett ei ny liste
newtab-widget-lists-menu-delete = Slett denne lista
newtab-widget-lists-menu-copy = Kopier liste til utklippstavla
newtab-widget-lists-menu-learn-more = Les meir
newtab-widget-lists-button-add-item = Legg til eit element
newtab-widget-lists-input-add-an-item2 =
    .placeholder = Legg til eit element
    .aria-label = Legg til eit element
newtab-widget-lists-input-error = Legg til tekst for å leggje til eit element.
newtab-widget-lists-input-menu-open-link = Opne lenke
newtab-widget-lists-input-menu-move-up = Flytt opp
newtab-widget-lists-input-menu-move-down = Flytt ned
newtab-widget-lists-input-menu-delete = Slett
newtab-widget-lists-input-menu-edit = Rediger
newtab-widget-lists-input-menu-edit2 =
    .aria-label = Rediger element
newtab-widget-lists-edit-clear =
    .aria-label = Avbryt
    .title = Avbryt
# the + symbol emphasises the functionality of adding a new list
newtab-widget-lists-dropdown-create =
    .label = + Lag ei ny liste
newtab-widget-lists-name-label-default =
    .label = Oppgåveliste
newtab-widget-lists-name-label-checklist =
    .label = Sjekkliste
newtab-widget-lists-name-placeholder-default =
    .placeholder = Oppgåveliste
newtab-widget-lists-name-placeholder-checklist2 =
    .placeholder = Sjekkliste
    .aria-label = Rediger listenamn
# The placeholder value of the name field for a newly created list
newtab-widget-lists-name-placeholder-new2 =
    .placeholder = Ny liste
    .aria-label = Rediger listenamn
newtab-widget-section-title = Widgetar
newtab-widget-menu-hide = Skjul widget
newtab-widget-menu-change-size = Endre storleik
# Parent label for a submenu in the widget menu that reorders the widget
# among its siblings. "Left" and "Right" appear as items inside this submenu.
newtab-widget-menu-move = Flytt
# Submenu item under "Move"; moves the widget one position to the left.
# RTL locales should translate this as "Right".
newtab-widget-menu-move-left = Til venstre
# Submenu item under "Move"; moves the widget one position to the right.
# RTL locales should translate this as "Left".
newtab-widget-menu-move-right = Til høgre
newtab-widget-size-small = liten
newtab-widget-size-medium = middels
newtab-widget-size-large = Stor
# Tooltip for hide all widgets button
newtab-widget-section-hide-all-button =
    .title = Skjul widgetar
    .aria-label = Skjul alle widgetar
newtab-widget-section-maximize =
    .title = Utvid widgetar
    .aria-label = Utvid alle widgetar til full størrelse
newtab-widget-section-minimize =
    .title = Minimer widgetar
    .aria-label = Slå saman alle widgetar til kompakt størrelse
newtab-widget-section-menu-button =
    .title = Widget-meny
    .aria-label = Opne widget-meny
newtab-widget-add-widgets-button =
    .aria-label = Legg til widget
    .title = Legg til widget
newtab-widget-section-menu-manage = Handsam widgetar
newtab-widget-section-menu-hide-all = Skjul widgetar
newtab-widget-section-menu-learn-more = Les meir
newtab-widget-section-feedback = Fortel oss kva du synest
# Button shown when additional widgets are hidden beyond the
# first row, allowing users to show them.
newtab-widget-section-show-more =
    .label = Vis fleire widgetar
# Button shown when the widgets row is expanded to multiple rows,
# allowing users to collapse it back to one row.
newtab-widget-section-show-less =
    .label = Vis færre widgetar
newtab-widget-lists-name-default = Sjekkliste

## Strings introduced by the Nova redesign of the Timer widget

newtab-widget-timer-notification-title = Nedteljing
newtab-widget-timer-notification-focus = Fokustida er over. Bra jobba. Treng du ein pause?
newtab-widget-timer-notification-break = Pausen din er over. Klar for å fokusere?
newtab-widget-timer-notification-warning = Varsel er av
newtab-widget-timer-mode-focus =
    .label = Fokus
newtab-widget-timer-mode-break =
    .label = Pause
newtab-widget-timer-label-play =
    .label = Spel av
newtab-widget-timer-label-pause =
    .label = Pause
newtab-widget-timer-reset =
    .title = Tilbakestill
newtab-widget-timer-menu-notifications = Slå av varsel
newtab-widget-timer-menu-notifications-on = Slå på varsel
newtab-widget-timer-menu-learn-more = Les meir
newtab-widget-timer-menu-button =
    .aria-label = Timer-innstillingar
# The title displays above a set of top news headlines.
newtab-daily-briefing-card-title = Toppoverskrifter
newtab-daily-briefing-card-menu-dismiss = Ignorer
# Variables:
#   $minutes (number) - Time since the feed has been refreshed
newtab-daily-briefing-card-timestamp = Oppdatert for { $minutes } minutt sidan
newtab-widget-message-title = Hald fokus med lister og ein innebygd nedteljar
# to-dos stands for "things to do".
newtab-widget-message-copy = Frå kjappe påminningar til daglege gjeremål, fokuserte arbeidsøkter til strekkpausar — hald deg til oppgåva og tidsplanen.
# One spot refers to a dedicated section on new tab to manage and use widgets
newtab-widget-message-focus-forecasts-title = Éin stad for fokus, vêrmeldingar og meir
newtab-widget-message-focus-forecasts-body = Hald flyten gjennom dagen med widgetar i { -brand-product-name }. Sjekk vêrmeldinga, hald fokus på oppgåvene dine eller følg tida rundt om i verda.
# "Make Firefox yours" refers to about:newtab. The call to action here ("Try it now")
# is to customize the new tab page with a background image or color from
# the built-in wallpaper collection or uploading your own image.
newtab-promo-card-title-addons = Gjer { -brand-product-name } til din
newtab-promo-card-body-addons = Vel eit bakgrunnsbilde frå samlinga vår, eller lag ditt eige.
newtab-promo-card-cta-addons = Prøv han no
newtab-promo-card-title = Støtt { -brand-product-name }
newtab-promo-card-body = Sponsorane våre støttar oppdraget vårt om å byggje eit betre internett
newtab-promo-card-cta = Les meir
newtab-promo-card-dismiss-button =
    .title = Avvis
    .aria-label = Avvis

## Strings introduced by the Nova redesign of the Timer widget

# Variables:
#   $minutes (number) - The currently selected timer duration in minutes
newtab-widget-timer-start-aria =
    .aria-label =
        { $minutes ->
           *[other] Set nedteljing på { $minutes }-minutt
        }
newtab-widget-timer-pause-aria =
    .aria-label = Set nedteljaren på pause
# Variables:
#   $minutes (number) - The currently selected timer duration in minutes
newtab-widget-timer-spinbutton-name =
    .aria-label =
        { $minutes ->
            [one] { $minutes } minutt
           *[other] { $minutes } minutt
        }
newtab-widget-timer-decrease-min =
    .title = Minsk med 1 minutt
newtab-widget-timer-increase-min =
    .title = Auk med 1 minutt
newtab-widget-timer-mode-group =
    .aria-label = Nedteljingsmodus
# Small label shown beneath the live time while the focus timer is running or paused.
newtab-widget-timer-running-focus = Fokus
# Small label shown beneath the live time while the break timer is running or paused.
newtab-widget-timer-running-break = Pause
# Context-menu item to hide the Timer widget. Replaces the shared "Hide widget"
# copy with a widget-specific string per the Nova design.
newtab-widget-timer-menu-hide = Skjul nedteljar
# Heading shown inside the Timer widget after a focus session ends.
newtab-widget-timer-celebration-heading-focus = Bra jobba
# Heading shown inside the Timer widget after a break session ends.
newtab-widget-timer-celebration-heading-break = Pausen din er over
# Message shown inside the Timer widget after a focus session ends.
newtab-widget-timer-celebration-message-focus = Treng du ein pause?
# Message shown inside the Timer widget after a break session ends.
newtab-widget-timer-celebration-message-break = Klar for å fokusere?

##

newtab-sports-widget-menu-follow-teams = Følg lag
newtab-sports-widget-menu-view-schedule = Sjå kampoppsettet
newtab-sports-widget-menu-view-upcoming = Vis komande
newtab-sports-widget-menu-view-results = Vis resultat
# Milestone dates (e.g. group stage, semifinals, etc.). Refers to calendar dates.
newtab-sports-widget-menu-key-dates = Viktige datoar
newtab-sports-widget-menu-learn-more = Les meir
# “Keep tabs on” is an informal expression meaning to stay updated on, stay informed on, or regularly follow something (in this case, World Cup matches and updates).
newtab-sports-widget-keep-tabs = Følg med på VM
newtab-sports-widget-get-updates = Få direkte kampoppdateringar og meir.
newtab-sports-widget-view-schedule =
    .label = Sjå kampoppsettet
newtab-sports-widget-follow-teams =
    .label = Følg lag
newtab-sports-widget-view-matches =
    .label = Vis kampar
# Variables:
#   $number (number) - Maximum number of teams a user can choose to follow in the team selection state
newtab-sports-widget-follow-teams-title =
    { $number ->
       *[other] Følg opptil { $number } lag
    }
newtab-sports-widget-choose-wallpaper =
    .label = Vel eit bakgrunnsbilde
newtab-sports-widget-skip = Hopp over
newtab-sports-widget-search-country =
    .placeholder = Søk etter land
    .aria-label = Søk etter land
newtab-sports-widget-cancel = Avbryt
newtab-sports-widget-back-button =
    .aria-label = Tilbake
newtab-sports-widget-done-button =
    .label = Ferdig
# Shown in the follow-teams list for a team that has been knocked out of the tournament.
# Variables:
#   $teamName (string) - the localized team name (e.g. "Canada").
newtab-sports-widget-team-name-eliminated = { $teamName } (utslått)
newtab-sports-widget-view-all =
    .label = Vis alle
newtab-sports-widget-show-less =
    .label = Vis mindre
# Toggle that filters the list of teams the user follows
newtab-sports-widget-followed-only-toggle =
    .label = Berre følgde lag
# Status shown when more matches are being fetched.
newtab-sports-widget-loading-more = Lastar inn fleire treff…
# Watch is a verb (as in watch matches online).
newtab-sports-widget-watch =
    .label = Sjå
    .title = Sjå direkte
# Watch is a verb (as in watch matches online).
newtab-sports-widget-watch-icon =
    .aria-label = Sjå direkte
    .title = Sjå direkte
newtab-sports-widget-watch-dialog-close =
    .aria-label = Lat att
    .title = Lat att
# Tag: user can watch without paying (sign-in may still be required).
newtab-sports-widget-watch-stream-free = Gratis
# Tag: user can start watching via a trial; continued access may require payment after it ends.
newtab-sports-widget-watch-stream-free-trial = Gratis prøveperiode
# Tag: provider offers both a no-cost or trial path and a paid path.
newtab-sports-widget-watch-stream-free-paid = Gratis og betalt
# Tag: user must pay to watch (subscription, TV provider, premium plan, or add-on).
newtab-sports-widget-watch-stream-paid = Betalt
# Note: provider only streams some matches, not the full tournament.
newtab-sports-widget-watch-stream-select-games-only = Berre utvalde kampar
# Heading for the list of streaming services available in the user’s country/region.
newtab-sports-widget-watch-available-region = Tilgjengeleg i din region
# Heading for the list of streaming services available outside the user’s country/region.
newtab-sports-widget-watch-available-other-regions = Andre regionar
# Button that opens the provider’s stream page in a new tab.
newtab-sports-widget-watch-play =
    .aria-label = Opne straum
    .title = Opne straum
newtab-sports-widget-group-stage = Gruppespel
newtab-sports-widget-group-a = Gruppe A
newtab-sports-widget-group-b = Gruppe B
newtab-sports-widget-group-c = Gruppe C
newtab-sports-widget-group-d = Gruppe D
newtab-sports-widget-group-e = Gruppe E
newtab-sports-widget-group-f = Gruppe F
newtab-sports-widget-group-g = Gruppe G
newtab-sports-widget-group-h = Gruppe H
newtab-sports-widget-group-i = Gruppe I
newtab-sports-widget-group-j = Gruppe J
newtab-sports-widget-group-k = Gruppe K
newtab-sports-widget-group-l = Gruppe L
newtab-sports-widget-round-32 = Sekstandedelsfinale
newtab-sports-widget-round-16 = Åttandedelsfinale
newtab-sports-widget-quarter-finals = Kvartfinalar
# The "LIVE" string is meant to be uppercase in English, but other languages and locales may vary in how they handle this.
newtab-sports-widget-live = DIREKTE
newtab-custom-widget-live-refresh =
    .title = Oppdater poeng
    .aria-label = Oppdater poeng
# Milestone dates (e.g. group stage, semifinals, etc.). Refers to calendar dates.
newtab-sports-widget-key-dates = Viktige datoar
newtab-sports-widget-upcoming = Komande
# Used for a match currently ongoing
newtab-sports-widget-now = No
newtab-sports-widget-results = Resultat
newtab-sports-widget-semi-finals = Semifinalar
newtab-sports-widget-bronze-finals = Bronsefinale
# Final is the final match for 1st place.
newtab-sports-widget-final = Finale
# Variables:
#   $start (Date) - Start date of a tournament stage
#   $end (Date) - End date of a tournament stage
newtab-sports-widget-key-date-range = { DATETIME($start, month: "short", day: "numeric") } – { DATETIME($end, month: "short", day: "numeric") }
# Variables:
#   $date (Date) - Date of a single tournament event
newtab-sports-widget-key-date = { DATETIME($date, month: "short", day: "numeric") }
newtab-sports-widget-delayed = Forseinka
newtab-sports-widget-postponed = Utsett
newtab-sports-widget-suspended = Suspendert
newtab-sports-widget-cancelled = Annulert
newtab-sports-widget-information = Informasjon om kampen
newtab-sports-widget-no-live-data = Direkte kampdata blir ikkje oppdaterte akkurat no
newtab-sports-widget-view-results-link = Vis resultat
newtab-sports-widget-third-place = Tredjeplass
# Runner-up is the team in 2nd place.
newtab-sports-widget-runner-up = Andreplass
newtab-sports-widget-champions = Meistrar
newtab-sports-widget-world-cup-champions = VM 2026 – verds­meistrar
# Compact champions label for the medium-size widget result card; the larger
# card uses newtab-sports-widget-world-cup-champions.
newtab-sports-widget-world-cup-champions-short = Verdsmeistrar 2026
# Variables:
#   $date (Date) - The match start time
newtab-sports-widget-match-time = { DATETIME($date, hour: "2-digit", minute: "2-digit") }
newtab-sports-widget-match-full-time = Slutt
newtab-sports-widget-match-halftime = Pause
newtab-sports-widget-match-extra-time = Ekstraomgangar
newtab-sports-widget-match-penalties = Straffer
# Separator shown between two teams in a placeholder match row when no upcoming
# match details are available yet.
newtab-sports-widget-match-vs = mot
# Note shown in the Upcoming tab when no match details are available yet.
newtab-sports-widget-no-upcoming-matches = Ver med oss vidare for komande kampdetaljar

## Sports widget live-games pagination. Shown when 2+ matches are live at the same time

# arrow button that goes to the previous page of live matches.
newtab-sports-widget-pagination-previous =
    .aria-label = Førre
    .title = Førre
# arrow button that goes to the next page of live matches.
newtab-sports-widget-pagination-next =
    .aria-label = Neste
    .title = Neste
# Dot indicator that jumps directly to a given live match.
# $index (number) - 1-based position of this dot in the list.
# $total (number) - Total number of live matches.
newtab-sports-widget-pagination-dot =
    .aria-label = Direktesendt kamp { $index } of { $total }
    .title = Direktesendt kamp { $index } of { $total }

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
    .aria-label = { $homeTeam }, { $homeScore } mot { $awayTeam }, { $awayScore }
# A finished match row that went to a penalty shootout.
# Parenthesized values are the shootout score.
# Variables:
#   $homeScore (number) - The home team's regular-time score
#   $awayScore (number) - The away team's regular-time score
#   $homePenalty (number) - The home team's penalty shootout score
#   $awayPenalty (number) - The away team's penalty shootout score
newtab-sports-widget-match-aria-label-results-penalties =
    .aria-label = { $homeTeam }, { $homeScore } ({ $homePenalty }) mot { $awayTeam }, { $awayScore } ({ $awayPenalty })
# A match that is currently in progress.
# Variables:
#   $homeScore (number) - The home team's current score
#   $awayScore (number) - The away team's current score
newtab-sports-widget-match-aria-label-now =
    .aria-label = Direkte: { $homeTeam }, { $homeScore } mot { $awayTeam }, { $awayScore }
# An upcoming scheduled match row. Announces kickoff time and date.
# Variables:
#   $date (Date) - The scheduled kickoff date/time
newtab-sports-widget-match-aria-label-upcoming =
    .aria-label = { $homeTeam } mot { $awayTeam }, { DATETIME($date, hour: "numeric", minute: "numeric") }, { DATETIME($date, day: "numeric", month: "long") }
# An upcoming match row whose status is "delayed".
newtab-sports-widget-match-aria-label-upcoming-delayed =
    .aria-label = { $homeTeam } mot { $awayTeam }, forseinka
# An upcoming match row whose status is "postponed".
newtab-sports-widget-match-aria-label-upcoming-postponed =
    .aria-label = { $homeTeam } mot { $awayTeam }, utsett
# An upcoming match row whose status is "suspended".
newtab-sports-widget-match-aria-label-upcoming-suspended =
    .aria-label = { $homeTeam } mot { $awayTeam }, avbroten
# An upcoming match row whose status is "cancelled".
newtab-sports-widget-match-aria-label-upcoming-cancelled =
    .aria-label = { $homeTeam } mot { $awayTeam }, kansellert

## Sports widget — team names (FIFA country codes)
## Only includes names not adequately covered by standard country-code
## internationalization tooling.

newtab-sports-widget-team-name-label-bih =
    .label = Bosnia og Herzegovina
newtab-sports-widget-team-name-label-civ =
    .label = Elfenbeinskysten
newtab-sports-widget-team-name-label-cod =
    .label = DR Congo
newtab-sports-widget-team-name-label-eng =
    .label = England
newtab-sports-widget-team-name-label-sco =
    .label = Skottland
# Placeholder used in a match row's aria-label for an undecided team (shown visually as "--").
newtab-sports-widget-team-tbd = Skal bestemmast

## Sports widget OMC messages
## Shown as on-screen messages promoting the Sports widget and World Cup wallpapers.

newtab-sports-widget-message-wallpapers-title = Spark i gang VM med nye bakgrunnsbilde
newtab-sports-widget-message-wallpapers-body = Gi nettlesaren litt kampstemning under turneringa.
newtab-sports-widget-message-wallpapers-cta = Vel bakgrunnsbilde
newtab-sports-widget-message-wallpapers-semifinals-title = Få ein ny bakgrunn for semifinalane
newtab-sports-widget-message-wallpapers-semifinals-body = Gjer deg klar for VMs største kampar.
newtab-sports-widget-message-add-widgets-cta =
    .label = Legg til widgetar
newtab-sports-widget-message-day-in-play-title = Hald dagen i gang med widgetar i { -brand-product-name }
newtab-sports-widget-message-day-in-play-body = Følg VM, hald fokus på oppgåvene dine, følg tida rundt om i verda, og meir.
newtab-sports-widget-message-explore-widgets-cta =
    .label = Utforsk widgetar

## Survey prompts shown after the World Cup to gather feedback on the widgets experience.

newtab-sports-widget-message-survey-title = Hjelp oss med å gjere widgetane betre
newtab-sports-widget-message-survey-body = Då er VM over. Fortel oss kva du synest om opplevinga.
newtab-sports-widget-message-survey-widget-title = Korleis var VM-widgeten?
newtab-sports-widget-message-survey-widget-body = Del tilbakemeldingane dine for å hjelpe oss med å gjere framtidige widgetar betre. Prøv deretter den nye i utvalet ditt.
newtab-sports-widget-message-survey-cta =
    .label = Ver med på undersøkinga

## Strings for activation window message variants. In certain experiment configurations,
## the strings from these variants may be displayed in a message below the search input
## for the first 48 hours of a new profile's lifetime. Some messages include buttons with
## labels, but not all.

newtab-activation-window-message-dismiss-button =
    .title = Ignorer
    .aria-label = Ignorer
# "This space" refers to about:newtab. The call to action here ("make it your own")
# is to customize newtab with a background image or colour, or by tweaking the
# existing widgetry that appears on it.
newtab-activation-window-message-customization-focus-header = Gjer dette området til ditt eige
newtab-activation-window-message-customization-focus-message = Vel eit nytt bakgrunnsbilde, legg til snarvegar til favorittnettstadane dine, og hald deg oppdatert på artiklar som interesserer deg.
newtab-activation-window-message-customization-focus-primary-button =
    .label = Start tilpassing
# "This space" refers to about:newtab. The sentiment of "plays by your rules" is
# meant to evoke the idea that newtab is malleable and customizable. The call to
# action is to customize newtab with a background image or colour, or by tweaking
# the existing widgetry that appears on it.
newtab-activation-window-message-values-focus-header = Dette området følgjer reglane dine
newtab-activation-window-message-values-focus-message = { -brand-product-name } lèt deg surfe slik du vil, med ein meir personleg måte å starte dagen din på nettet. Gjer { -brand-product-name } til ditt eige.

## Strings for the Clock widget

# Context menu item: toggle the clock card off.
newtab-clock-widget-menu-hide = Skjul klokke
newtab-clock-widget-menu-learn-more = Les meir
newtab-clock-widget-menu-edit = Rediger klokker
newtab-clock-widget-menu-switch-to-12h = Byt til 12-timars format
newtab-clock-widget-menu-switch-to-24h = Byt til 24-timars format
newtab-clock-widget-label-your-clocks = Dine klokker
newtab-clock-widget-search-location-input =
    .label = Plassering
    .placeholder = Søk etter ein by
    .aria-label = Søk etter ein by
# "Nickname (optional)" refers to a custom, user-defined label for a saved location
# (e.g., "Home", "Office", or "School") to make it easier to recognize.
# Not to be translated as a legal name, username, or alias used for identity verification.
newtab-clock-widget-input-nickname =
    .label = Kallenamn (valfritt)
    .placeholder = Legg til eit kallenamn
    .aria-label = Kallenamn (valfritt)
# "Add new clock" is an icon-only button in the widget toolbar — the
# attributes are consumed as tooltip/screen-reader label only. The button
# never renders visible text.
newtab-clock-widget-button-add =
    .title = Legg til ei ny klokke
    .aria-label = Legg til ei ny klokke
newtab-clock-widget-button-add-clock = Legg til
newtab-clock-widget-button-cancel = Avbryt
newtab-clock-widget-button-back =
    .title = Tilbake
    .aria-label = Tilbake
newtab-clock-widget-button-edit-clock =
    .title = Rediger klokke
    .aria-label = Rediger klokke
newtab-clock-widget-button-save = Lagre
newtab-clock-widget-button-remove-clock =
    .title = Fjern klokke
    .aria-label = Fjern klokke
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
    .aria-label = { $city }, kallenamn: { $nickname }
newtab-clock-widget-add-clock-form =
    .aria-label = Legg til klokke
newtab-clock-widget-edit-clock-form =
    .aria-label = Rediger klokke
# "Search results" is the accessible label for the listbox dropdown that appears
# below the location search field, listing matching cities as the user types.
# It means "results of the search", not "search within the results".
newtab-clock-widget-search-results =
    .aria-label = Søkjeresultat
# Shown in place of the search results when the user's query does not match any
# supported city — e.g. typing a misspelled name or a place not in the IANA
# time zone list.
newtab-clock-widget-search-no-results = Ingen treff
# "Open menu for clock" is an icon-only button in the widget toolbar — the
# attributes are consumed as tooltip/screen-reader label only. The button
# never renders visible text.
newtab-clock-widget-menu-button =
    .title = Opne klokkemeny
    .aria-label = Opne klokkemeny
# $nickname (String) - The user-defined nickname for a saved clock location (e.g., "Home", "Office").
newtab-clock-widget-label-nickname-with-value = Kallenamn: { $nickname }
