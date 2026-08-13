# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Firefox Home / New Tab strings for about:home / about:newtab.

newtab-page-title = بلگه نۊ
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button =
    .title = سفارشی کردن ای بلگه
#  (developer note): @nova-cleanup(remove-string): Remove newtab-customize-panel-icon-button-label once Nova lands, will be using newtab-customize-panel-label instead
newtab-customize-panel-icon-button-label = سفارشی کردن
newtab-customize-panel-label =
    .label = سفارشی کردن
newtab-personalize-settings-icon-label =
    .title = سفارشی کردن بلگه نۊ
    .aria-label = سامووا
newtab-settings-dialog-label =
    .aria-label = سامووا
newtab-logo-and-wordmark =
    .aria-label = { -brand-full-name }
newtab-card-dismiss-button =
    .title = رڌ کردن
    .aria-label = رڌ کردن

## Strings for "Homepage" and "Firefox Home" sections of about:settings#home.
## Homepage panel

home-homepage-title =
    .label = بلگه هووه ای
home-homepage-new-windows =
    .label = نیمدری یل نۊ
home-homepage-new-tabs =
    .label = بلگه یل نۊ

## Custom URLs subpage

# Subheader on the Custom Homepage subpage. Followed by a form to enter URLs and a list of URLs already saved, if any.
home-custom-homepage-card-header =
    .label = نشۊوی (ا) وبگه
home-custom-homepage-address =
    .placeholder = زیذن نشۊوی
home-custom-homepage-address-button =
    .label = ٱووردن نشۊوی
home-custom-homepage-delete-address-button =
    .title = پاک کردن نشۊوی
    .aria-label = پاک کردن نشۊوی
# Further options to use when setting the home page. Two action buttons are placed in line with this prompt
# to replace the current home page with a currently open page or bookmark.
home-custom-homepage-replace-with-prompt =
    .label = جایونی کردن وا
# Button that appears in-line after text "Replace with" (home-custom-homepage-replace-with-prompt)
home-custom-homepage-current-pages-button =
    .label = بلگه یل گۊشیڌه وابیڌه هیم سکویی
# Button that appears in-line after text "Replace with" (home-custom-homepage-replace-with-prompt)
home-custom-homepage-bookmarks-button =
    .label = نشووکا…

## Firefox Home content

home-prefs-content-header =
    .label = { -firefox-home-brand-name }
home-prefs-search-header2 =
    .label = پیتینیڌن
home-prefs-widgets-header =
    .label = ویجتا
# Lists is a widget on New Tab, similar to a to-do widget
home-prefs-lists-header =
    .label = نومگه یل
# Timer is a widget on New Tab, similar to the Pomodoro timer.
home-prefs-timer-header =
    .label = زمووݩ سنج
# Sports is a widget on New Tab showing sports scores and schedules.
home-prefs-sports-widget-header =
    .label = ورزش
# Clock is a widget on New Tab that displays time zones around the world.
home-prefs-clocks-header =
    .label = ساعت
# Privacy is a widget on New Tab that shows tracking protection activity.
home-prefs-privacy-header =
    .label = سیخومی
# Stocks is a widget on New Tab that shows stock ticker prices.
home-prefs-stocks-header =
    .label = سهام
home-prefs-manage-topics-link2 =
    .label = دؽوۉداری سرتالا
home-prefs-choose-wallpaper-link2 =
    .label = پسند شؽوات زمینه
home-prefs-firefox-logo-header =
    .label = لوگو { -brand-short-name }
# Variables:
#   $num (number) - Number of rows displayed
home-prefs-sections-rows-option-srd =
    .label =
        { $num ->
            [one] { $num } ردیف
           *[other] { $num } ردیف
        }
# Dropdown option shown when an extension replaces the contents of new windows or tabs.
# Variables:
#   $extension (string) - Name of the extension
home-prefs-homepage-extension-option =
    .label = وردنی ({ $extension })
home-restore-defaults-srd =
    .label = وورگندن پؽش فرزا
    .accesskey = R
home-mode-choice-default-fx-srd =
    .label = { -firefox-home-brand-name } (پؽش فرز)
home-mode-choice-custom-srd =
    .label = نشۊویا سفارشی…
home-mode-choice-blank-srd =
    .label = بلگه پتی
home-prefs-shortcuts-header-srd =
    .label = ره نهنگا
home-prefs-shortcuts-select =
    .aria-label = ره نهنگا
home-prefs-shortcuts-by-option-sponsored-srd =
    .label = ره نهنگا هؽزگرووݩ
home-prefs-recommended-by-option-sponsored-stories-srd =
    .label = وزعیتا هؽزگرووݩ
home-prefs-highlights-option-visited-pages-srd =
    .label = بلگه یل نیشته وابیڌه
home-prefs-highlights-options-bookmarks-srd =
    .label = نشووکا
home-prefs-recent-activity-header-srd =
    .label = فعالیتا دیندایی
home-prefs-recent-activity-select =
    .aria-label = فعالیتا دیندایی
home-prefs-weather-header-srd =
    .label = ٱو وو هوا
home-prefs-support-firefox-header-srd =
    .label = لادرار { -brand-product-name }

## Strings for the Privacy widget

# Context menu item linking to more information about the Privacy widget.
newtab-privacy-menu-learn-more = قلوه دووسته بۊین

## Privacy widget — informational messages
##
## Rotating "info" secondary messages. Each message has a body plus a matched
## "-cta" button label sharing the same id stem (the CTA button isn't rendered
## yet; the labels are authored so the pairing is ready).

newtab-privacy-message-info-6-cta = قلوه دووسته بۊین
newtab-privacy-message-info-11-cta = قلوه دووسته بۊین

## Privacy widget — promotional messages
##
## Rotating "promo" secondary messages suggesting another Firefox feature. Each
## has a body plus a matched "-cta" button label.

newtab-privacy-message-promo-monitor-1-cta = قلوه دووسته بۊین
newtab-privacy-message-promo-monitor-2-cta = قلوه دووسته بۊین
newtab-privacy-message-promo-signin-1-cta = و من ٱووڌن
newtab-privacy-message-promo-vpn-1-cta = گۊشیڌن VPN
newtab-privacy-message-promo-vpn-2-cta = گۊشیڌن VPN
newtab-privacy-message-promo-vpn-3-cta = گۊشیڌن VPN
newtab-privacy-message-promo-private-window-1-cta = گۊشیڌن نیمدری سیخومی

## Strings for the Stocks widget

# Context menu item linking to more information about the Stocks widget.
newtab-stocks-menu-learn-more = قلوه دووسته بۊین
# Heading for the Stocks widget.
newtab-stocks-widget-title = سهام

## Screen-reader summary of a stock ticker.
## Variables:
##   $name (String) - the full fund/ETF name, e.g. "SPDR S&P 500 ETF Trust".
##   $change (String) - the day's percentage change, e.g. "+2.1%".
##   $price (String) - the last price, e.g. "$559.44".

# Stock increased (went up) during the day
newtab-stocks-ticker-status-up = { $name }، روء { $change }، { $price }
# Stock decreased (went down) during the day
newtab-stocks-ticker-status-down = { $name }، لم { $change }، { $price }
# Stock didn't change during the day
newtab-stocks-ticker-status-flat = { $name }، بؽ آلشتکاری { $change }، { $price }

## Strings for the Picture of the Day widget

# Attribution line shown under the title once a picture loads: an author
# credit, a link to the picture's source page, and a link to its license.
# "©" is the copyright symbol.
# $author (string) - the name of the image's author.
newtab-picture-attribution-author = © { $author }
# Context menu item linking to more information about the widget.
newtab-picture-menu-learn-more = قلوه دووسته بۊین

## Search box component.

# "Search" is a verb/action
newtab-search-box-search-button =
    .title = پیتینیڌن
    .aria-label = پیتینیڌن
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-text = پیتینیڌن وا { $engine } یا ی نشۊوی بزنین
newtab-search-box-handoff-text-no-engine = پیتینیڌن یا زیڌن نشۊوی
# Variables:
#   $engine (string) - The name of the user's default search engine
newtab-search-box-handoff-input =
    .placeholder = پیتینیڌن وا { $engine } یا ی نشۊوی بزنین
    .title = پیتینیڌن وا { $engine } یا ی نشۊوی بزنین
    .aria-label = پیتینیڌن وا { $engine } یا ی نشۊوی بزنین
newtab-search-box-handoff-input-no-engine =
    .placeholder = پیتینیڌن یا زیڌن نشۊوی
    .title = پیتینیڌن یا زیڌن نشۊوی
    .aria-label = پیتینیڌن یا زیڌن نشۊوی
newtab-search-box-text = پیتینیڌن من وب
newtab-search-box-input =
    .placeholder = پیتینیڌن من وب
    .aria-label = پیتینیڌن من وب

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-add-search-engine-header = ٱووردن موتور پیتینیڌن
newtab-topsites-add-shortcut-header = ره نهنگ نۊ
newtab-topsites-edit-shortcut-header = آلشت ره نهنگ
newtab-topsites-add-shortcut-label = ٱووردن ره نهنگ
newtab-topsites-add-shortcut-title =
    .title = ٱووردن ره نهنگ
    .aria-label = ٱووردن ره نهنگ
newtab-topsites-title-label = عونوان
newtab-topsites-title-input =
    .placeholder = زیڌن ی عونوان
newtab-topsites-url-label = نشۊوی اینترنتی
newtab-topsites-url-input =
    .placeholder = ی نشۊوی هؽل کۊنین یا جا بونین
newtab-topsites-url-validation = نشۊوی اینترنتی موعتبر لازوم هڌ
newtab-topsites-image-url-label = نشۊوی سفارشی شؽوات
newtab-topsites-use-image-link = و کار گرؽڌن ی شؽوات سفارشی…
newtab-topsites-image-validation =
    بار ونی شؽوات شکست خرد.
    نشۊوی دیری ن امتهووݩ کۊنین.

## Clear text button for the URL and image URL input fields in the Top Sites form.

newtab-topsites-clear-input =
    .aria-label = روفتن هؽل

## Top Sites - General form dialog buttons. These are verbs/actions.

newtab-topsites-cancel-button = لقو
newtab-topsites-delete-history-button = پاک کردن ز ویرگار
newtab-topsites-save-button = زفت
newtab-topsites-preview-button = پؽش نشووݩ
newtab-topsites-add-button = ٱووردن

## Top Sites - Delete history confirmation dialog.

# "This action" refers to deleting a page from history.
newtab-confirm-delete-history-p2 = ای کار وورگندنی نؽ.

## Top Sites - Sponsored label

newtab-topsite-sponsored = هؽزگری وابیڌه

## Label used by screen readers for pinned top sites

# Variables:
#   $title (string) - The label or hostname of the site.
topsite-label-pinned =
    .aria-label = { $title } (دیسنیڌه وابی)
    .title = { $title }

## Context Menu - Action Tooltips.

# General tooltip for context menus.
newtab-menu-section-tooltip =
    .title = گۊشیڌن نومگه
    .aria-label = گۊشیڌن نومگه
# Tooltip for dismiss button
newtab-dismiss-button-tooltip =
    .title = پاک کردن
    .aria-label = پاک کردن
# Tooltip on an empty topsite box to open the New Top Site dialog.
newtab-menu-topsites-placeholder-tooltip =
    .title = آلشت ای وبگه
    .aria-label = آلشت ای وبگه

## Context Menu: These strings are displayed in a context menu and are meant as a call to action for a given page.

newtab-menu-edit-topsites = آلشت
newtab-menu-open-new-window = گۊشیڌن من ی نیمدری نۊ
newtab-menu-open-new-private-window = گۊشیڌن من ی نیمدری سیخومی نۊ
newtab-menu-dismiss = رڌ کردن
newtab-menu-pin = دیسنیڌن
newtab-menu-unpin = وورداشتن دیسنیڌن
newtab-menu-delete-history = پاک کردن ز ویرگار
newtab-menu-save-to-pocket = زفت کردن من { -pocket-brand-name }
newtab-menu-delete-pocket = پاک کردن ز { -pocket-brand-name }
newtab-menu-archive-pocket = آرشیو من { -pocket-brand-name }
newtab-menu-show-privacy-info = هؽزگرووݩ ایما وو هریم سیخومی ایسا
newtab-menu-about-fakespot = زبار { -fakespot-brand-name }
# Report is a verb (i.e. report issue with the content).
newtab-menu-report = گوزارش
# Context menu option to personalize New Tab recommended stories by blocking a section of stories,
# e.g. "Sports". "Block" is a verb here.
newtab-menu-section-block = مسدۊد کردن
# Context menu option to open a support page explaining the New Tab personalization features and privacy controls.
newtab-menu-section-learn-more = قلوه دووسته بۊین

## Message displayed in a modal window to explain privacy and provide context for sponsored content.

newtab-privacy-modal-button-done = ٱنجوم وابی
newtab-privacy-modal-button-manage = دؽوۉداری سامووا موئتوا هؽزگر

##

# Bookmark is a noun in this case, "Remove bookmark".
newtab-menu-remove-bookmark = پاک کردن نشووک
# Bookmark is a verb here.
newtab-menu-bookmark = نشووک

## Context Menu - Downloaded Menu. "Download" in these cases is not a verb,
## it is a noun. As in, "Copy the link that belongs to this downloaded item".

newtab-menu-copy-download-link = لف گیری لینگ دانلود
newtab-menu-go-to-download-page = رئڌن و بلگه دانلود
newtab-menu-remove-download = پاک کردن ز ویرگار

## Context Menu - Download Menu: These are platform specific strings found in the context menu of an item that has
## been downloaded. The intention behind "this action" is that it will show where the downloaded file exists on the file
## system for each operating system.

newtab-menu-open-file = گۊشیڌن فایل

## Card Labels: These labels are associated to pages to give
## context on how the element is related to the user, e.g. type indicates that
## the page is bookmarked, or is currently open on another device.

newtab-label-visited = نیشته وابیڌه
newtab-label-bookmarked = نشووک ناهاڌه وابیڌه
newtab-label-removed-bookmark = نشووک پاک وابی
newtab-label-saved = من { -pocket-brand-name } زفت وابیڌه
newtab-label-download = دانلود وابیڌه
# This string is used under fixed size ads to indicate sponsored content
newtab-label-sponsored-fixed = هؽزگری وابیڌه

## Section Menu: These strings are displayed in the section context menu and are
## meant as a call to action for the given section.

newtab-section-menu-remove-section = پاک کردن بشن
newtab-section-menu-collapse-section = جم کردن بشن
newtab-section-menu-expand-section = واز کردن بشن
newtab-section-menu-manage-section = دؽوۉداری بشن
newtab-section-menu-manage-webext = دؽوۉداری وردنی
newtab-section-menu-add-search-engine = ٱووردن موتور پیتینیڌن
newtab-section-menu-move-up = جاگورو و روء
newtab-section-menu-move-down = جاگورو و لم
newtab-section-menu-privacy-notice = نوکات زفت مهرمووه ای

## Section aria-labels

newtab-section-collapse-section-label =
    .aria-label = جم کردن بشن
newtab-section-expand-section-label =
    .aria-label = واز کردن بشن

## Section Headers.

newtab-section-header-recent-activity = فعالیتا دیندایی
# Variables:
#   $provider (string) - Name of the corresponding content provider.
newtab-section-header-pocket = پؽشنهاڌ وابیڌه و دست { $provider }
newtab-section-header-stories = داستانا فرگ کردنی

## Empty Section (Content Discovery Experience). These show when there are no more stories or when some stories fail to load.

newtab-discovery-empty-section-topstories-try-again-button = قپ ریت دووارته
newtab-discovery-empty-section-topstories-loading = هونی بار اونه…

## Pocket Content Section.

newtab-pocket-learn-more = قلوه دووسته بۊین
newtab-pocket-cta-button = گرؽڌن { -pocket-brand-name }
newtab-pocket-save = زفت
newtab-pocket-saved = زفت وابی

## Thumbs up and down buttons that shows over a newtab stories card thumbnail on hover.

newtab-toast-dismiss-button =
    .title = رڌ کردن
    .aria-label = رڌ کردن

## Customization Menu

newtab-custom-shortcuts-title = ره نهنگا
newtab-custom-shortcuts-nova =
    .label = ره نهنگا
newtab-custom-sponsored-sites = ره نهنگا هؽزگرووݩ
newtab-custom-stories-personalized-toggle =
    .label = داستانا
newtab-custom-pocket-sponsored = وزعیتا هؽزگرووݩ
newtab-custom-recent-title = فعالیتا دیندایی
newtab-custom-widget-weather-toggle =
    .label = ٱو وو هوا
newtab-custom-widget-lists-toggle =
    .label = نومگه یل
newtab-custom-widget-timer-toggle =
    .label = زمووݩ سنج
newtab-custom-widget-sports-toggle =
    .label = جام جهۊوی
newtab-custom-widget-clock-toggle =
    .label = ساعت
newtab-custom-widget-sports-toggle2 =
    .label = ورزش
newtab-custom-widget-privacy-toggle =
    .label = سیخومی
newtab-custom-widget-stocks-toggle =
    .label = سهام
newtab-custom-widget-section-title = ویجتا
newtab-custom-widget-section-toggle =
    .label = ویجتا
newtab-widget-manage-title = ویجتا
newtab-widget-manage-widget-button =
    .label = دؽوۉداری ویجتا
# Tooltip for close button
newtab-custom-close-menu-button =
    .title = بستن
    .aria-label = بستن نومگه
newtab-custom-close-button = بستن
newtab-custom-settings = دؽوۉداری سامووا قلوه

## New Tab Wallpapers

newtab-wallpaper-title = کاقز دیواری یل
newtab-wallpaper-reset = وورگندن و سامووا پؽش فرز
#  (developer note): @nova-cleanup(remove-string): Remove old "Upload an image" string once Nova lands. The new "Add an image"  string will take over
newtab-wallpaper-upload-image = آپلود ی شؽوات
newtab-wallpaper-add-an-image = ٱووردن ی شؽوات
newtab-wallpaper-custom-color = ی رنگ پسند کۊنین
newtab-wallpaper-toggle-title =
    .label = کاقز دیواری یل
newtab-wallpaper-light-red-panda = پاندای سوئر
newtab-wallpaper-light-mountain = کوه اسبؽڌ
newtab-wallpaper-light-sky = آسمۊوی وا ٱورا بناوش وو آل

## Solid Colors

#  (developer note): @nova-cleanup(remove-string): Remove old "Solid colors" string once Nova lands. The simplified "Colors" string will take over
newtab-wallpaper-category-title-colors = رنگا سابت
newtab-wallpaper-colors = رنگا
newtab-wallpaper-blue = کوۊ
newtab-wallpaper-light-blue = کوۊ رۊشن
newtab-wallpaper-light-purple = بناوش رۊشن
newtab-wallpaper-light-green = ساوز رۊشن
newtab-wallpaper-green = ساوز
newtab-wallpaper-beige = بژ
newtab-wallpaper-yellow = هیل
newtab-wallpaper-orange = نارنجی
newtab-wallpaper-pink = آل
newtab-wallpaper-light-pink = آل رۊشن
newtab-wallpaper-red = سوئر
newtab-wallpaper-dark-blue = کوۊ تاریک
newtab-wallpaper-dark-purple = بناوش تاریک
newtab-wallpaper-dark-green = ساوز تاریک

## Firefox

# Variables
#   $author_string (String) - The name of the creator of the photo.
#   $webpage_string (String) - The name of the webpage where the photo is located.
newtab-wallpaper-attribution = شؽوات و دست <a data-l10n-name="name-link">{ $author_string }</a> ری <a data-l10n-name="webpage-link">{ $webpage_string }</a>
newtab-wallpaper-feature-highlight-header = رنگا شاڌ ن امتهووݩ کۊنین
newtab-wallpaper-feature-highlight-button = فئمیم
feature-highlight-wallpaper =
    .title = { -newtab-wallpaper-feature-highlight-header }
    .aria-label = { -newtab-wallpaper-feature-highlight-content }

## Firefox

newtab-wallpaper-category-title-firefox = { -brand-product-name }

## Celestial

# “Celestial” referring to astronomy; positioned in or relating to the sky,
# or outer space as observed in astronomy.
# Not to be confused with religious definition of the word.
newtab-wallpaper-category-title-celestial = آسمۊوی
newtab-wallpaper-celestial-lunar-eclipse = مه گرؽڌیی
newtab-wallpaper-celestial-earth-night = شؽوات شاو ز مدار بلمی زمین
newtab-wallpaper-celestial-starry-sky = آسمووݩ پور آستاره

## New Tab Weather

# Display options are:
# - Simple: Displays a current weather condition icon and the current temperature
# - Detailed: Include simple information plus a short text summary: e.g. "Mostly cloudy"
newtab-weather-menu-weather-display-option-simple = ساڌه
newtab-weather-menu-weather-display-option-detailed = جۊزعیات
newtab-weather-menu-change-weather-display-detailed = آلشت و هالت نیشتن جۊزعیات
newtab-weather-menu-temperature-units = واهدا دما
newtab-weather-menu-temperature-option-fahrenheit = فارنهایت
newtab-weather-menu-temperature-option-celsius = سانتیگراد
newtab-weather-menu-change-temperature-units-fahrenheit = آلشت و فارنهایت
newtab-weather-menu-change-temperature-units-celsius = آلشت و سانتیگراد
newtab-weather-menu-hide-weather = بؽڌار کردن ٱو وو هوا من بلگه نۊ
newtab-weather-menu-learn-more = قلوه دووسته بۊین
newtab-weather-menu-detect-my-location = تشخیس داڌن جاگه مو
# This message is shown if user is working offline
newtab-weather-error-not-available = دووسمندیا ٱو وو هوا سکو من دسرس نؽ
newtab-weather-opt-in-not-now =
    .label = سکو ن
newtab-weather-opt-in-yes =
    .label = هری
# We'll be showing static (fake) weather data if the user has not opted in to using their location
newtab-weather-static-city = شئر نیویورک
# "Highest" here refers to the highest temperature of the day
newtab-weather-high =
    .aria-label = قلوه
# "Lowest" here refers to the lowest temperature of the day
newtab-weather-low =
    .aria-label = کم

## Topic Labels

newtab-topic-label-business = کسب ۉ کار
newtab-topic-label-career = شوغل
newtab-topic-label-education = وا نوم ناهاڌن
newtab-topic-label-arts = سرگرمی
newtab-topic-label-food = غزا
newtab-topic-label-health = سلامت
newtab-topic-label-hobbies = بازی
# ”Money” = “Personal Finance”, refers to articles and stories that help readers better manage
# and understand their personal finances – from saving money to buying a home. See the
# “Curated by our editors“ section at the top of https://getpocket.com/explore/personal-finance for more context
newtab-topic-label-finance = پیل
newtab-topic-label-government = سیاست
newtab-topic-label-education-science = علم
# ”Life Hacks” = “Self Improvement”, refers to articles and stories aimed at helping readers improve various
# aspects of their lives – from mental health to  productivity. See the “Curated by our editors“ section
# at the top of https://getpocket.com/explore/self-improvement for more context.
newtab-topic-label-society = شگردا زندیی
newtab-topic-label-sports = ورزش
newtab-topic-label-tech = تکنۊلۊژی
newtab-topic-label-travel = سفر
newtab-topic-label-home = هووه وو باغ

## Topic Selection Modal

newtab-topic-selection-save-button = زفت
newtab-topic-selection-cancel-button = لقو
newtab-topic-selection-button-maybe-later = گاشڌ دینداتر
newtab-topic-selection-privacy-link = دووسته بۊین ک چتاور دووسمندیا ن زفت وو هونووݩ ن دؽوۉداری اکۊنیم
newtab-topic-selection-button-update-interests = علاقه یل خوتووݩ ن ورۊ رسۊوی کۊنین
newtab-topic-selection-button-pick-interests = پسند علاقه یل خوتووݩ

## Content Feed Sections
## "Follow", "unfollow", and "following" are social media terms that refer to subscribing to or unsubscribing from a section of stories.
## e.g. Following the travel section of stories.

# A modal may appear next to the Follow button, directing users to try out the feature
newtab-section-follow-highlight-title = فید خوتووݩ ن دییق سامووݩ کۊنین

## Button to block/unblock listed topics
## "Block", "unblocked", and "blocked" are social media terms that refer to hiding a section of stories.
## e.g. Blocked the politics section of stories.

newtab-section-block-button = مسدۊد کردن
newtab-section-blocked-button = مسدۊد وابیڌه
newtab-section-unblock-button = ز مسدۊدی دراووردن
# Variables:
#   $topic (string) - Name of topic that user is blocking
newtab-section-block-topic =
    .aria-label = مسدۊد کردن { $topic }

## Confirmation modal for blocking a section

newtab-section-cancel-button = سکو ن
# Variables:
#   $topic (string) - Name of topic that user is blocking
newtab-section-block-topic-button = مسدۊد کردن { $topic }
newtab-section-block-cancel-button = لقو

## Strings for custom wallpaper highlight

newtab-section-mangage-topics-title = سرتالا
newtab-section-manage-topics-button-v2 =
    .label = دؽوۉداری سرتالا
newtab-section-mangage-topics-blocked-topics = مسدۊد وابیڌه
newtab-custom-wallpaper-cta = امتهووس کوݩ

## Strings for new user activation custom wallpaper highlight

newtab-new-user-custom-wallpaper-cta = هیم سکو امتهووݩ کوݩ

## Strings for download mobile highlight

newtab-download-mobile-highlight-title = دانلود { -brand-product-name } سی موبایل

## Strings for shortcuts highlight

newtab-shortcuts-highlight-title = مووردا دلخا ایسا من دسرس تووݩ هڌ

## Strings for reporting issues with ads and content

newtab-report-content-why-reporting-this =
    .label = سیچه یونه گوزارش ادی؟
newtab-report-ads-reason-not-interested =
    .label = مو علاقه ای نڌاروم
newtab-report-ads-reason-inappropriate =
    .label = موناسو نؽ
newtab-report-ads-reason-seen-it-too-many-times =
    .label = مو هم ی کرت دو کرت نؽ ک دیمسه
newtab-report-content-wrong-category =
    .label = کتن بندی اشتوا
newtab-report-content-spam-misleading =
    .label = هرزنومه یا بلا کوننده
newtab-report-content-requires-payment-subscription =
    .label = وا پرداخت کۊنین یا اشتراک داشته بۊین
newtab-report-content-requires-payment-subscription-learn-more = قلوه دووسته بۊین
newtab-report-cancel = لقو
newtab-report-submit = فشناڌن
newtab-toast-thanks-for-reporting =
    .message = ممنووݩ ک یونه گوزارش داڌی.

## Strings for task / to-do list productivity widget

# "Add one" means adding a new task to the list (e.g., "Walk the dog")
newtab-widget-lists-empty-cta = ائتمالات تمومی نڌارن. یکی ازاف کۊنین.
# A simple label next to the default list name letting users know this is a new / beta feature
newtab-widget-lists-label-new =
    .label = نۊ
newtab-widget-lists-label-beta =
    .label = آزمایشی
# When tasks have been previous marked as complete, they will appear in their own separate list beneath incomplete items
# Variables:
#   $number (number) - Amount of list items marked complete
newtab-widget-lists-completed-list = تموم وابیڌه ({ $number })
newtab-widget-lists-celebration-headline = کار خوو
newtab-widget-task-list-menu-copy = لف گیری
newtab-widget-lists-menu-edit = آلشت نومگه نوم
newtab-widget-lists-menu-edit2 =
    .aria-label = آلشت نومگه نوم
newtab-widget-lists-menu-create = وورکل ی نومگه نۊ
newtab-widget-lists-menu-delete = پاک کردن ای نومگه
newtab-widget-lists-menu-copy = لف گیری نومگه من کلیپ بورد
newtab-widget-lists-menu-learn-more = قلوه دووسته بۊین
newtab-widget-lists-button-add-item = ٱووردن ی موورد
newtab-widget-lists-input-add-an-item2 =
    .placeholder = ٱووردن ی موورد
    .aria-label = ٱووردن ی موورد
newtab-widget-lists-input-menu-open-link = گۊشیڌن لینگ
newtab-widget-lists-input-menu-move-up = جاگورو و روء
newtab-widget-lists-input-menu-move-down = جاگورو و لم
newtab-widget-lists-input-menu-delete = پاک کردن
newtab-widget-lists-input-menu-edit = آلشت
newtab-widget-lists-edit-clear =
    .title = لقو
    .aria-label = لقو
# the + symbol emphasises the functionality of adding a new list
newtab-widget-lists-dropdown-create =
    .label = + وورکل ی نومگه نۊ
newtab-widget-lists-name-label-default =
    .label = نومگه کارا
newtab-widget-lists-name-placeholder-default =
    .placeholder = نومگه کارا
# The placeholder value of the name field for a newly created list
newtab-widget-lists-name-placeholder-new2 =
    .placeholder = نومگه نۊ
    .aria-label = آلشت نومگه نوم
newtab-widget-section-title = ویجتا
newtab-widget-menu-change-size = آلشت هندا
# Parent label for a submenu in the widget menu that reorders the widget
# among its siblings. "Left" and "Right" appear as items inside this submenu.
newtab-widget-menu-move = جا گورو
# Submenu item under "Move"; moves the widget one position to the left.
# RTL locales should translate this as "Right".
newtab-widget-menu-move-left = چپ
# Submenu item under "Move"; moves the widget one position to the right.
# RTL locales should translate this as "Left".
newtab-widget-menu-move-right = راست
newtab-widget-size-small = کۊچیر
newtab-widget-size-medium = منجقا
newtab-widget-size-large = گپ
# Tooltip for hide all widgets button
newtab-widget-section-hide-all-button =
    .title = بؽڌار کردن ویجتا
    .aria-label = بؽڌار کردن پوی ویجتا
newtab-widget-add-widgets-button =
    .title = ٱووردن ویجت
    .aria-label = ٱووردن ویجت
newtab-widget-section-menu-manage = دؽوۉداری ویجتا
newtab-widget-section-menu-hide-all = بؽڌار کردن ویجتا
newtab-widget-section-menu-learn-more = قلوه دووسته بۊین
# Button shown when additional widgets are hidden beyond the
# first row, allowing users to show them.
newtab-widget-section-show-more =
    .label = نشووݩ داڌن ویجتا قلوه
# Button shown when the widgets row is expanded to multiple rows,
# allowing users to collapse it back to one row.
newtab-widget-section-show-less =
    .label = نشووݩ داڌن ویجتا کمتر

## Strings introduced by the Nova redesign of the Timer widget

newtab-widget-timer-notification-title = زمووݩ سنج
newtab-widget-timer-notification-warning = وارسۊویا کۊر هڌن
newtab-widget-timer-mode-focus =
    .label = فوکۊس
newtab-widget-timer-mode-break =
    .label = اشکستن
newtab-widget-timer-label-play =
    .label = پشک
newtab-widget-timer-label-pause =
    .label = واڌاشتن
newtab-widget-timer-reset =
    .title = وورنشۊوی
newtab-widget-timer-menu-notifications = کۊر کردن وارسۊویا
newtab-widget-timer-menu-notifications-on = رۊشن کردن وارسۊویا
newtab-widget-timer-menu-learn-more = قلوه دووسته بۊین
newtab-daily-briefing-card-menu-dismiss = رڌ کردن
newtab-promo-card-cta-addons = هیم سکو امتهووݩ کوݩ
newtab-promo-card-title = لادرار { -brand-product-name }
newtab-promo-card-cta = قلوه دووسته بۊین
newtab-promo-card-dismiss-button =
    .title = رڌ کردن
    .aria-label = رڌ کردن

## Strings introduced by the Nova redesign of the Timer widget

# Variables:
#   $minutes (number) - The currently selected timer duration in minutes
newtab-widget-timer-spinbutton-name =
    .aria-label =
        { $minutes ->
            [one] { $minutes } دیقه
           *[other] { $minutes } دیقه
        }
newtab-widget-timer-mode-group =
    .aria-label = هالت زمووݩ سنج
# Small label shown beneath the live time while the focus timer is running or paused.
newtab-widget-timer-running-focus = فوکۊس
# Small label shown beneath the live time while the break timer is running or paused.
newtab-widget-timer-running-break = اشکستن
# Context-menu item to hide the Timer widget. Replaces the shared "Hide widget"
# copy with a widget-specific string per the Nova design.
newtab-widget-timer-menu-hide = بؽڌار کردن زمووݩ سنج
# Heading shown inside the Timer widget after a focus session ends.
newtab-widget-timer-celebration-heading-focus = کار نشمینی بی

##

newtab-sports-widget-menu-view-schedule = نیشتن برنومه زمووی
newtab-sports-widget-menu-view-results = نیشتن نتیجه یل
newtab-sports-widget-menu-learn-more = قلوه دووسته بۊین
# “Keep tabs on” is an informal expression meaning to stay updated on, stay informed on, or regularly follow something (in this case, World Cup matches and updates).
newtab-sports-widget-keep-tabs = جام جهۊوی ن وا ویر جمعی و دین کۊنین
newtab-sports-widget-get-updates = ورۊ رسۊویا زنده موسابقات وو مووردا قلوه ن بگیرین.
newtab-sports-widget-view-schedule =
    .label = نیشتن برنومه زمووی
newtab-sports-widget-follow-teams =
    .label = و دین کردن تیما
newtab-sports-widget-choose-wallpaper =
    .label = پسند شؽوات زمینه
newtab-sports-widget-skip = گوم زیڌن
newtab-sports-widget-cancel = لقو
newtab-sports-widget-back-button =
    .aria-label = وورگشتن
newtab-sports-widget-done-button =
    .label = ٱنجوم وابی
newtab-sports-widget-view-all =
    .label = نیشتن پوی
newtab-sports-widget-show-less =
    .label = نشووݩ داڌن کمتر
newtab-sports-widget-watch-dialog-close =
    .title = بستن
    .aria-label = بستن
newtab-sports-widget-group-stage = مرهله بونکۊیی
newtab-sports-widget-group-a = بونکۊ A
newtab-sports-widget-group-b = بونکۊ B
newtab-sports-widget-group-c = بونکۊ C
newtab-sports-widget-group-d = بونکۊ D
newtab-sports-widget-group-e = بونکۊ E
newtab-sports-widget-group-f = بونکۊ F
newtab-sports-widget-group-g = بونکۊ G
newtab-sports-widget-group-h = بونکۊ H
newtab-sports-widget-group-i = بونکۊ I
newtab-sports-widget-group-j = بونکۊ J
newtab-sports-widget-group-k = بونکۊ K
newtab-sports-widget-group-l = بونکۊ L
newtab-sports-widget-round-32 = دور 32
newtab-sports-widget-round-16 = دور 16
newtab-sports-widget-quarter-finals = مرهله ی چاروم دیندایی
# The "LIVE" string is meant to be uppercase in English, but other languages and locales may vary in how they handle this.
newtab-sports-widget-live = زنده
newtab-sports-widget-upcoming = آینده
newtab-sports-widget-results = نتیجه یل
newtab-sports-widget-semi-finals = نیمه دیندایی
newtab-sports-widget-bronze-finals = فینال بورونز
# Final is the final match for 1st place.
newtab-sports-widget-final = فینال
# Variables:
#   $start (Date) - Start date of a tournament stage
#   $end (Date) - End date of a tournament stage
newtab-sports-widget-key-date-range = { DATETIME($start, month: "short", day: "numeric") } – { DATETIME($end, month: "short", day: "numeric") }
# Variables:
#   $date (Date) - Date of a single tournament event
newtab-sports-widget-key-date = { DATETIME($date, month: "short", day: "numeric") }
newtab-sports-widget-cancelled = لقو وابی
newtab-sports-widget-view-results-link = نیشتن نتیجه یل
newtab-sports-widget-third-place = مقام سووم
newtab-sports-widget-world-cup-champions = قئرمووا جام جهۊوی 2026
newtab-sports-widget-match-full-time = پوی مجال
newtab-sports-widget-match-halftime = نیمه ٱول
newtab-sports-widget-match-extra-time = مجال ازافه
newtab-sports-widget-match-penalties = جریمه یل

## Accessible labels for match rows in the sports widget. These are read by
## screen readers to announce the match details and status.
## Variables shared by all messages in this group:
##   $homeTeam (String) - The full name of the home team (e.g. "Mexico")
##   $awayTeam (String) - The full name of the away team (e.g. "Russia")

# An upcoming match row whose status is "cancelled".
newtab-sports-widget-match-aria-label-upcoming-cancelled =
    .aria-label = { $homeTeam } ری و ری { $awayTeam }، لقو وابی

## Sports widget — team names (FIFA country codes)
## Only includes names not adequately covered by standard country-code
## internationalization tooling.

newtab-sports-widget-team-name-label-eng =
    .label = انگلستووݩ
newtab-sports-widget-team-name-label-sco =
    .label = اسکاتلند

## Strings for activation window message variants. In certain experiment configurations,
## the strings from these variants may be displayed in a message below the search input
## for the first 48 hours of a new profile's lifetime. Some messages include buttons with
## labels, but not all.

newtab-activation-window-message-dismiss-button =
    .title = رڌ کردن
    .aria-label = رڌ کردن
newtab-activation-window-message-customization-focus-primary-button =
    .label = ناهاڌن پا سفارشی کردن

## Strings for the Clock widget

newtab-clock-widget-menu-learn-more = قلوه دووسته بۊین
newtab-clock-widget-button-add-clock = ٱووردن
newtab-clock-widget-button-cancel = لقو
newtab-clock-widget-button-save = زفت
# Accessible name for a clock row in the "Your clocks" management panel
# when the row has no user-provided nickname. Read aloud by screen
# readers when focus lands on the row.
# Variables:
#   $city (string) - The city name displayed in the row.
newtab-clock-widget-edit-item =
    .aria-label = { $city }
