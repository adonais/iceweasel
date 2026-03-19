/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

export const PREFS = {
  // Base / shared New Tab prefs
  ACTIVATION_WINDOW_VARIANT: "activationWindow.variant",
  ASROUTER_DEVTOOLS_ENABLED: "asrouter.devtoolsEnabled",
  IMAGES_SMART: "images.smart",
  IMPROVED_SEARCH_TOPSITE_SHORTCUTS: "improvesearch.topSiteSearchShortcuts",
  LOGO_WORDMARK_ALWAYS_VISIBLE: "logowordmark.alwaysVisible",
  NEWTAB_EXPERIENCE_COLORS: "newNewtabExperience.colors",
  PRIVACY_INFO_URL: "privacyInfo.url",
  SUPPORT_URL: "support.url",
  TOP_SITES_ROWS: "topSitesRows",

  // Discovery Stream ad sizing
  BILLBOARD_ENABLED: "newtabAdSize.billboard",
  BILLBOARD_POSITION: "newtabAdSize.billboard.position",
  LEADERBOARD_ENABLED: "newtabAdSize.leaderboard",
  LEADERBOARD_POSITION: "newtabAdSize.leaderboard.position",
  AD_SIZE_MEDIUM_RECTANGLE: "newtabAdSize.mediumRectangle",

  // Discovery Stream prefs
  ALLOWED_ENDPOINTS: "discoverystream.endpoints",
  CONTEXTUAL_ADS_ENABLED: "discoverystream.sections.contextualAds.enabled",
  CONTEXTUAL_BANNER_COUNTS:
    "discoverystream.placements.contextualBanners.counts",
  CONTEXTUAL_BANNER_PLACEMENTS: "discoverystream.placements.contextualBanners",
  DAILY_BRIEF_ENABLED: "discoverystream.dailyBrief.enabled",
  DAILY_BRIEF_SECTIONID: "discoverystream.dailyBrief.sectionId",
  DISCOVERY_STREAM_SECTIONS_CUSTOMIZE_MENU_PANEL_ENABLED:
    "discoverystream.sections.customizeMenuPanel.enabled",
  INFERRED_PERSONALIZATION_MODEL_OVERRIDE:
    "discoverystream.sections.personalization.inferred.model.override",
  INFERRED_PERSONALIZATION_SYSTEM:
    "discoverystream.sections.personalization.inferred.enabled",
  INFERRED_PERSONALIZATION_USER:
    "discoverystream.sections.personalization.inferred.user.enabled",
  INTEREST_PICKER_ENABLED: "discoverystream.sections.interestPicker.enabled",
  NOVA_ENABLED: "nova.enabled",
  OHTTP_CONFIG: "discoverystream.ohttp.configURL",
  OHTTP_MERINO: "discoverystream.merino-provider.ohttp.enabled",
  OHTTP_RELAY: "discoverystream.ohttp.relayURL",
  OHTTP_UNIFIED_ADS: "unifiedAds.ohttp.enabled",
  PROMOCARD_ENABLED: "discoverystream.promoCard.enabled",
  PROMOCARD_VISIBLE: "discoverystream.promoCard.visible",
  REPORT_ADS_ENABLED: "discoverystream.reportAds.enabled",
  SECTIONS_CARDS_ENABLED: "discoverystream.sections.cards.enabled",
  SECTIONS_ENABLED: "discoverystream.sections.enabled",
  SECTIONS_PERSONALIZATION_ENABLED:
    "discoverystream.sections.personalization.enabled",
  SPOC_COUNTS: "discoverystream.placements.spocs.counts",
  SPOC_PLACEMENTS: "discoverystream.placements.spocs",
  SPOCS_STARTUPCACHE_ENABLED: "discoverystream.spocs.startupCache.enabled",
  TOPICS_AVAILABLE: "discoverystream.topicSelection.topics",
  TOPICS_ENABLED: "discoverystream.topicLabels.enabled",
  TOPICS_SELECTED: "discoverystream.topicSelection.selectedTopics",
  TOPIC_SELECTION_ENABLED: "discoverystream.topicSelection.enabled",
  TOPIC_SELECTION_HAS_BEEN_UPDATED_PREVIOUSLY:
    "discoverystream.topicSelection.hasBeenUpdatedPreviously",
  TOPIC_SELECTION_ONBOARDING_DISPLAY_COUNT:
    "discoverystream.topicSelection.onboarding.displayCount",
  TOPIC_SELECTION_ONBOARDING_DISPLAY_TIMEOUT:
    "discoverystream.topicSelection.onboarding.displayTimeout",
  TOPIC_SELECTION_ONBOARDING_ENABLED:
    "discoverystream.topicSelection.onboarding.enabled",
  TOPIC_SELECTION_ONBOARDING_LAST_DISPLAYED:
    "discoverystream.topicSelection.onboarding.lastDisplayed",
  TOPIC_SELECTION_ONBOARDING_MAYBE_DISPLAY:
    "discoverystream.topicSelection.onboarding.maybeDisplay",
  TOPIC_SELECTION_SUGGESTED_TOPICS:
    "discoverystream.topicSelection.suggestedTopics",
  UNIFIED_ADS_ADSFEED_ENABLED: "unifiedAds.adsFeed.enabled",
  UNIFIED_ADS_ENABLED: "unifiedAds.spocs.enabled",
  UNIFIED_ADS_ENDPOINT: "unifiedAds.endpoint",
  VISIBLE_SECTIONS: "discoverystream.sections.interestPicker.visibleSections",

  // Feature highlight prefs
  MOBILE_DOWNLOAD_HIGHLIGHT_ENABLED: "mobileDownloadModal.enabled",
  MOBILE_DOWNLOAD_HIGHLIGHT_VARIANT_A: "mobileDownloadModal.variant-a",
  MOBILE_DOWNLOAD_HIGHLIGHT_VARIANT_B: "mobileDownloadModal.variant-b",
  MOBILE_DOWNLOAD_HIGHLIGHT_VARIANT_C: "mobileDownloadModal.variant-c",

  // Section visibility / feeds
  FEEDS_SECTION_TOPSTORIES: "feeds.section.topstories",
  FEEDS_SYSTEM_TOPSTORIES: "feeds.system.topstories",
  FEEDS_TOPSITES: "feeds.topsites",
  FEEDS_WEATHERFEED: "feeds.weatherfeed",

  // Widgets prefs
  WIDGETS_FEEDBACK_ENABLED: "widgets.feedback.enabled",
  WIDGETS_HIDE_ALL_TOAST_ENABLED: "widgets.hideAllToast.enabled",
  WIDGETS_LISTS_BADGE_ENABLED: "widgets.lists.badge.enabled",
  WIDGETS_LISTS_BADGE_LABEL: "widgets.lists.badge.label",
  WIDGETS_LISTS_ENABLED: "widgets.lists.enabled",
  WIDGETS_LISTS_MAX_LISTS: "widgets.lists.maxLists",
  WIDGETS_LISTS_MAX_LISTITEMS: "widgets.lists.maxListItems",
  WIDGETS_MAXIMIZED: "widgets.maximized",
  WIDGETS_SYSTEM_ENABLED: "widgets.system.enabled",
  WIDGETS_SYSTEM_LISTS_ENABLED: "widgets.system.lists.enabled",
  WIDGETS_SYSTEM_MAXIMIZED: "widgets.system.maximized",
  WIDGETS_SYSTEM_WEATHER_FORECAST_ENABLED:
    "widgets.system.weatherForecast.enabled",
  WIDGETS_SYSTEM_TIMER_ENABLED: "widgets.system.focusTimer.enabled",
  WIDGETS_TIMER_ENABLED: "widgets.focusTimer.enabled",
  WIDGETS_TIMER_SHOW_SYSTEM_NOTIFICATIONS:
    "widgets.focusTimer.showSystemNotifications",

  // Weather prefs
  SHOW_WEATHER: "showWeather",
  SYSTEM_SHOW_WEATHER: "system.showWeather",
  SYSTEM_SHOW_WEATHER_OPT_IN: "system.showWeatherOptIn",
  WEATHER_DISPLAY: "weather.display",
  WEATHER_LOCATION_SEARCH_ENABLED: "weather.locationSearchEnabled",
  WEATHER_OPT_IN_ACCEPTED: "weather.optInAccepted",
  WEATHER_OPT_IN_DISPLAYED: "weather.optInDisplayed",
  WEATHER_QUERY: "weather.query",
  WEATHER_STATIC_DATA_ENABLED: "weather.staticData.enabled",
  WEATHER_TEMPERATURE_UNITS: "weather.temperatureUnits",

  // Wallpaper prefs
  WALLPAPER_CUSTOM_COLOR_ENABLED: "newtabWallpapers.customColor.enabled",
  WALLPAPER_CUSTOM_THEME: "newtabWallpapers.customWallpaper.theme",
  WALLPAPER_SELECTED: "newtabWallpapers.wallpaper",
  WALLPAPER_UPLOADED_PREVIOUSLY:
    "newtabWallpapers.customWallpaper.uploadedPreviously",
  WALLPAPERS_ENABLED: "newtabWallpapers.enabled",
  WALLPAPER_UPLOAD_MAX_FILE_SIZE: "newtabWallpapers.customWallpaper.fileSize",
  WALLPAPER_UPLOAD_MAX_FILE_SIZE_ENABLED:
    "newtabWallpapers.customWallpaper.fileSize.enabled",
};
