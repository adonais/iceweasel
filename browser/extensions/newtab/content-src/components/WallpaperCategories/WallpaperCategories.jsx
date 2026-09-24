/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { connect } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
// eslint-disable-next-line no-shadow
import { CSSTransition } from "react-transition-group";
import {
  calculateTheme,
  createThumbnail,
} from "lib/Wallpapers/WallpaperThemeUtils.mjs";
import { WALLPAPER_CATEGORIES } from "content-src/lib/constants.mjs";
import { isWallpaperLibraryEnabled } from "lib/Wallpapers/WallpaperLibraryPref.mjs";

// A second save can start before the first one's reply arrives. The id keeps
// that older reply from moving focus to the wrong image.
let uploadRequestSeq = 0;

// Tiles per row in "Your images". The stylesheet reads it through
// --your-images-columns, the way Top Sites sizes its grid from
// --top-sites-max-per-row, so the layout and the arrow keys share one number.
const YOUR_IMAGES_COLUMNS = 3;

const PREF_WALLPAPER_UPLOADED_PREVIOUSLY =
  "newtabWallpapers.customWallpaper.uploadedPreviously";

const PREF_WALLPAPER_UPLOAD_MAX_FILE_SIZE =
  "newtabWallpapers.customWallpaper.fileSize";

const PREF_WALLPAPER_UPLOAD_MAX_FILE_SIZE_ENABLED =
  "newtabWallpapers.customWallpaper.fileSize.enabled";

const PREF_WALLPAPER_VISIBILITY_GROUPS = "newtabWallpapers.visibilityGroups";

// The dedicated trainhopConfig.wallpapers object wins over the pref, so a group
// can be activated without a release. The pref is never read at call sites.
export function resolveWallpaperVisibilityGroups(prefs) {
  // A trainhop payload is raw JSON from a Nimbus recipe, so a malformed value
  // must fall back to the pref rather than throw while rendering the picker.
  const trainhop = prefs.trainhopConfig?.wallpapers?.visibilityGroups;
  if (trainhop !== undefined && typeof trainhop !== "string") {
    console.warn(
      `trainhopConfig.wallpapers.visibilityGroups is ${JSON.stringify(
        trainhop
      )}; expected a string. Ignoring it.`
    );
  }
  const csv =
    (typeof trainhop === "string" && trainhop) ||
    prefs[PREF_WALLPAPER_VISIBILITY_GROUPS] ||
    "";
  return csv
    .split(",")
    .map(group => group.trim())
    .filter(Boolean);
}

// Remote Settings records may omit either field. A missing `visible` means
// visible; a missing `visibility_group` means ungated.
export const isWallpaperOffered = (wallpaper, activeGroups) =>
  wallpaper.visible !== false &&
  (!wallpaper.visibility_group ||
    activeGroups.includes(wallpaper.visibility_group));

// Returns a function will not be continuously triggered when called. The
// function will be triggered if called again after `wait` milliseconds.
function debounce(func, wait) {
  let timer;
  return (...args) => {
    if (timer) {
      return;
    }

    let wakeUp = () => {
      timer = null;
    };

    timer = setTimeout(wakeUp, wait);
    func.apply(this, args);
  };
}

export class _WallpaperCategories extends React.PureComponent {
  constructor(props) {
    super(props);
    this.handleColorInput = this.handleColorInput.bind(this);
    this.debouncedHandleChange = debounce(this.handleChange.bind(this), 999);
    this.handleChange = this.handleChange.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleCategory = this.handleCategory.bind(this);
    this.focusCategory = this.focusCategory.bind(this);
    this.handleUpload = this.handleUpload.bind(this);
    this.handleBack = this.handleBack.bind(this);
    this.handleWallpaperListEntered =
      this.handleWallpaperListEntered.bind(this);
    this.getRGBColors = this.getRGBColors.bind(this);
    this.prefersHighContrastQuery = null;
    this.prefersDarkQuery = null;
    this.categoryRef = []; // store references for wallpaper category list
    this.wallpaperRef = []; // store reference for wallpaper selection list
    this.savedWallpaperRef = []; // store references for the "Your images" list
    this.scaledThumbnails = new Set(); // library images already scaled here
    this.unmounted = false;
    this.pendingUploadId = null;
    this.uploadStartedFromTile = false;
    this.arrowButtonRef = React.createRef(); // Used to focus arrow button when category opens
    this.customColorPickerRef = React.createRef(); // Used to determine contrast icon color for custom color picker
    this.customColorInput = React.createRef(); // Used to determine contrast icon color for custom color picker
    this.wallpaperListRef = React.createRef(); // Used for CSSTransition nodeRef
    this.state = {
      inputType: "radio",
      activeId: null,
      customWallpaperErrorType: null,
      focusedCategoryIndex: 0,
      pendingRemoveIndex: null,
      pendingRemoveFilename: null,
      savedFocusIndex: 0,
      // Object URLs for the picker thumbnails, keyed by filename.
      thumbnailUrls: {},
    };
  }

  componentDidMount() {
    this.prefersDarkQuery = globalThis.matchMedia(
      "(prefers-color-scheme: dark)"
    );
    this.requestThumbnails();
    this.syncThumbnailUrls();
  }

  componentWillUnmount() {
    this.unmounted = true;
    this.revokeThumbnailUrls(this.state.thumbnailUrls);
  }

  componentDidUpdate(prevProps) {
    this.focusAfterRemoval();
    this.focusAfterUpload();

    const wantsThumbnails = !!this.props.panelShowing && this.libraryEnabled;
    const wantedThumbnails =
      !!prevProps.panelShowing &&
      isWallpaperLibraryEnabled(prevProps.Prefs.values);

    if (wantsThumbnails !== wantedThumbnails) {
      if (wantsThumbnails) {
        this.requestThumbnails();
      } else {
        this.dropThumbnails();
      }
    }

    if (
      this.props.Wallpapers.customWallpaperThumbnails !==
      prevProps.Wallpapers.customWallpaperThumbnails
    ) {
      this.syncThumbnailUrls();
    }

    // An upload or a removal changes the library, so the thumbnails for it are
    // stale. Compared by filename, so a fresh array holding the same images
    // does not ask forever. The applied pref is the second trigger: a page
    // restored from the startup cache never sees the library broadcast.
    const appliedFilename =
      this.props.Prefs.values["newtabWallpapers.customWallpaper.uuid"] || "";
    const prevAppliedFilename =
      prevProps.Prefs.values["newtabWallpapers.customWallpaper.uuid"] || "";
    if (
      appliedFilename !== prevAppliedFilename ||
      this.libraryFilenames(this.props.Wallpapers.customWallpapers) !==
        this.libraryFilenames(prevProps.Wallpapers.customWallpapers)
    ) {
      this.requestThumbnails();
    }

    // A CTA can deep-link into a specific wallpaper category by dispatching
    // SHOW_PERSONALIZE with a wallpaperCategory. Open it once when it appears.
    const requestedCategory = this.props.customizePanelWallpaperCategory;
    if (
      requestedCategory &&
      requestedCategory !== prevProps.customizePanelWallpaperCategory
    ) {
      this.openRequestedCategory(requestedCategory);
    }
  }

  openRequestedCategory(categoryId) {
    const { categories } = this.props.Wallpapers;
    const index = categories?.indexOf(categoryId) ?? -1;
    // Category may not be available in every build/region; bail if missing.
    if (index === -1) {
      return;
    }
    this.setState({ focusedCategoryIndex: index });
    this.openCategory(categoryId, { fromUser: false });
  }

  handleColorInput(event) {
    let { id } = event.target;
    // Set ID to include hex value of custom color
    id = `solid-color-picker-${event.target.value}`;
    const rgbColors = this.getRGBColors(event.target.value);

    // Set background color to custom color
    event.target.style.backgroundColor = `rgb(${rgbColors.toString()})`;

    if (this.customColorPickerRef.current) {
      const colorInputBackground =
        this.customColorPickerRef.current.children[0].style.backgroundColor;
      this.customColorPickerRef.current.style.backgroundColor =
        colorInputBackground;
    }

    // Set icon color based on the selected color
    const isColorDark = this.isWallpaperColorDark(rgbColors);
    if (this.customColorPickerRef.current) {
      if (isColorDark) {
        this.customColorPickerRef.current.classList.add("is-dark");
      } else {
        this.customColorPickerRef.current.classList.remove("is-dark");
      }

      // Remove any possible initial classes
      this.customColorPickerRef.current.classList.remove(
        "custom-color-set",
        "custom-color-dark",
        "default-color-set"
      );
    }

    // Setting this now so when we remove v1 we don't have to migrate v1 values.
    this.props.setPref("newtabWallpapers.wallpaper", id);
    this.props.setPref("newtabWallpapers.initialWallpaper", "");
    this.props.setPref("newtabWallpapers.user.enabled", true);
  }

  // Note: There's a separate event (debouncedHandleChange) that fires the handleChange
  // event but is delayed so that it doesn't fire multiple events when a user
  // is selecting a custom color background
  handleChange(event) {
    let { id } = event.target;

    // Set ID to include hex value of custom color
    if (id === "solid-color-picker") {
      id = `solid-color-picker-${event.target.value}`;
    }

    this.props.setPref("newtabWallpapers.wallpaper", id);
    this.props.setPref("newtabWallpapers.initialWallpaper", "");
    this.props.setPref("newtabWallpapers.user.enabled", true);

    const uploadedPreviously =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOADED_PREVIOUSLY];

    this.handleUserEvent(at.WALLPAPER_CLICK, {
      selected_wallpaper: id,
      had_previous_wallpaper: !!this.props.activeWallpaper,
      had_uploaded_previously: !!uploadedPreviously,
    });
  }

  focusCategory(focusIndex) {
    if (!this.categoryRef) {
      return;
    }

    const el = this.categoryRef[focusIndex];
    if (el) {
      el.focus();
    }
  }

  // function implementing arrow navigation for wallpaper category selection
  handleCategoryKeyDown(event, category) {
    const getIndex = this.categoryRef.findIndex(cat => cat.id === category);
    if (getIndex === -1) {
      return; // prevents errors if wallpaper index isn't found when navigating with arrow keys
    }

    const isRTL = document.dir === "rtl"; // returns true if page language is right-to-left
    let eventKey = event.key;

    if (eventKey === "ArrowRight" || eventKey === "ArrowLeft") {
      if (isRTL) {
        eventKey = eventKey === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
      }
    }

    let nextIndex = getIndex;

    if (eventKey === "ArrowRight") {
      nextIndex =
        getIndex + 1 < this.categoryRef.length ? getIndex + 1 : getIndex;
    } else if (eventKey === "ArrowLeft") {
      nextIndex = getIndex - 1 >= 0 ? getIndex - 1 : getIndex;
    }

    this.setState({ focusedCategoryIndex: nextIndex }, () =>
      this.focusCategory(nextIndex)
    );
  }

  // function implementing arrow navigation for wallpaper selection
  handleWallpaperKeyDown(event, title) {
    if (event.key === "Tab") {
      if (event.shiftKey) {
        event.preventDefault();
        this.arrowButtonRef.current?.focus();
      } else {
        event.preventDefault(); // prevent tabbing within wallpaper selection. We should only be using the Tab key to tab between groups
      }
      return;
    }

    const isRTL = document.dir === "rtl"; // returns true if page language is right-to-left
    let eventKey = event.key;

    if (eventKey === "ArrowRight" || eventKey === "ArrowLeft") {
      if (isRTL) {
        eventKey = eventKey === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
      }
    }

    const getIndex = this.wallpaperRef.findIndex(
      wallpaper => wallpaper.id === title
    );

    if (getIndex === -1) {
      return; // prevents errors if wallpaper index isn't found when navigating with arrow keys
    }

    // the set layout of columns per row for the wallpaper selection
    const columnCount = 3;
    let nextIndex = getIndex;

    if (eventKey === "ArrowRight") {
      nextIndex =
        getIndex + 1 < this.wallpaperRef.length ? getIndex + 1 : getIndex;
    } else if (eventKey === "ArrowLeft") {
      nextIndex = getIndex - 1 >= 0 ? getIndex - 1 : getIndex;
    } else if (eventKey === "ArrowDown") {
      nextIndex =
        getIndex + columnCount < this.wallpaperRef.length
          ? getIndex + columnCount
          : getIndex;
    } else if (eventKey === "ArrowUp") {
      nextIndex =
        getIndex - columnCount >= 0 ? getIndex - columnCount : getIndex;
    }

    this.wallpaperRef[nextIndex].tabIndex = 0;
    this.wallpaperRef[getIndex].tabIndex = -1;
    this.wallpaperRef[nextIndex].focus();
    this.wallpaperRef[nextIndex].click();
  }

  handleReset() {
    const uploadedPreviously =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOADED_PREVIOUSLY];

    const selectedWallpaper =
      this.props.Prefs.values["newtabWallpapers.wallpaper"];

    // With the library off there is nowhere to see or delete a saved image, so
    // resetting still removes it, the way it did before the library existed.
    if (selectedWallpaper === "custom" && !this.libraryEnabled) {
      this.props.dispatch(
        ac.OnlyToMain({
          type: at.WALLPAPER_REMOVE_UPLOAD,
        })
      );
    }

    // Reset active wallpaper
    this.props.setPref("newtabWallpapers.wallpaper", "");
    this.props.setPref("newtabWallpapers.initialWallpaper", "");

    // Fire WALLPAPER_CLICK telemetry event
    this.handleUserEvent(at.WALLPAPER_CLICK, {
      selected_wallpaper: "none",
      had_previous_wallpaper: !!this.props.activeWallpaper,
      had_uploaded_previously: !!uploadedPreviously,
    });
  }

  categoryFluentID(categoryId) {
    switch (categoryId) {
      case WALLPAPER_CATEGORIES.Abstracts:
        return "newtab-wallpaper-category-title-abstract";
      case WALLPAPER_CATEGORIES.Celestial:
        return "newtab-wallpaper-category-title-celestial";
      case WALLPAPER_CATEGORIES.Photographs:
        return "newtab-wallpaper-category-title-photographs";
      case WALLPAPER_CATEGORIES.SolidColors:
        // @nova-cleanup(remove-conditional): Remove novaEnabled conditional and always use newtab-wallpaper-colors
        return this.props.Prefs.values["nova.enabled"]
          ? "newtab-wallpaper-colors"
          : "newtab-wallpaper-category-title-colors";
      case WALLPAPER_CATEGORIES.Firefox:
        return "newtab-wallpaper-category-title-firefox";
      case WALLPAPER_CATEGORIES.CustomWallpaper:
        return "newtab-wallpaper-your-images";
      default:
        return undefined;
    }
  }

  // Which images the library holds, as one comparable string.
  libraryFilenames(wallpapers) {
    return (wallpapers || []).map(wallpaper => wallpaper.filename).join("|");
  }

  // The library lives in a folder the page cannot load from, so the picker asks
  // for the thumbnail bytes and turns them into object URLs here.
  requestThumbnails() {
    // The picker is mounted on every new tab, so asking on mount would read the
    // whole library once per tab, for a panel nobody opened.
    if (!this.props.panelShowing || !this.libraryEnabled) {
      return;
    }
    this.props.dispatch(
      ac.OnlyToMain({ type: at.WALLPAPERS_CUSTOM_THUMBNAILS_REQUEST })
    );
  }

  revokeThumbnailUrls(urls) {
    for (const url of Object.values(urls || {})) {
      globalThis.URL?.revokeObjectURL(url);
    }
  }

  syncThumbnailUrls() {
    if (!this.props.panelShowing || !this.libraryEnabled) {
      this.dropThumbnails();
      return;
    }
    const thumbnails = this.props.Wallpapers.customWallpaperThumbnails || [];
    const next = {};
    for (const { filename, file } of thumbnails) {
      // A startup cache restore rebuilds these from JSON, where a Blob comes
      // back as a plain object that createObjectURL rejects.
      if (file instanceof globalThis.Blob) {
        next[filename] = globalThis.URL.createObjectURL(file);
      }
    }
    const previous = this.state.thumbnailUrls;
    this.setState({ thumbnailUrls: next }, () =>
      this.revokeThumbnailUrls(previous)
    );
    this.scaleMissingThumbnails(thumbnails);
  }

  // Anything saved without a page to scale it, a migrated wallpaper or one
  // rescued when it was retired, arrives full size and marked. Scaling runs
  // here and the result goes back to be stored.
  async scaleMissingThumbnails(thumbnails) {
    for (const { filename, file, needsThumbnail } of thumbnails) {
      if (
        !needsThumbnail ||
        this.scaledThumbnails.has(filename) ||
        !(file instanceof globalThis.Blob)
      ) {
        continue;
      }
      // Checked again after the await. This component stays mounted on every
      // new tab, so closing the panel is the only signal that the work is no
      // longer wanted, and a large library takes many turns to get through.
      if (this.unmounted || !this.props.panelShowing || !this.libraryEnabled) {
        return;
      }
      // The set means done or in flight. Anything that does not finish has to
      // come back out, or reopening the panel would skip it for good.
      this.scaledThumbnails.add(filename);
      let sent = false;
      try {
        const thumbnail = await createThumbnail(globalThis, file);
        if (
          this.unmounted ||
          !this.props.panelShowing ||
          !this.libraryEnabled
        ) {
          return;
        }
        this.props.dispatch(
          ac.OnlyToMain({
            type: at.WALLPAPERS_CUSTOM_THUMBNAILS_MADE,
            data: { filename, thumbnail },
          })
        );
        sent = true;
      } catch (e) {
        console.error("Failed to make a thumbnail for a saved image", e);
      } finally {
        if (!sent) {
          this.scaledThumbnails.delete(filename);
        }
      }
    }
  }

  dropThumbnails() {
    if (!(this.props.Wallpapers.customWallpaperThumbnails || []).length) {
      return;
    }
    // Local dispatch, so the bytes leave this tab's state as well. Nothing
    // renders them again until the panel is reopened.
    this.props.dispatch({
      type: at.WALLPAPERS_CUSTOM_THUMBNAILS_SET,
      data: [],
    });
    const previous = this.state.thumbnailUrls;
    this.setState({ thumbnailUrls: {} }, () =>
      this.revokeThumbnailUrls(previous)
    );
  }

  thumbnailUrl(filename) {
    return this.state.thumbnailUrls[filename];
  }

  get libraryEnabled() {
    return isWallpaperLibraryEnabled(this.props.Prefs.values);
  }

  get savedWallpapers() {
    const saved = this.props.Wallpapers.customWallpapers || [];

    if (this.libraryEnabled) {
      return saved;
    }

    // Without the library this is the one custom wallpaper someone has, which
    // is what the picker showed before "Your images" existed.
    const applied =
      this.props.Prefs.values["newtabWallpapers.customWallpaper.uuid"];
    return saved.filter(wallpaper => wallpaper.filename === applied);
  }

  get appliedSavedWallpaper() {
    const filename =
      this.props.Prefs.values["newtabWallpapers.customWallpaper.uuid"];
    const isCustomSelected =
      this.props.Prefs.values["newtabWallpapers.wallpaper"] === "custom";
    if (!isCustomSelected || !filename) {
      return null;
    }
    return this.savedWallpapers.find(
      wallpaper => wallpaper.filename === filename
    );
  }

  handleSavedWallpaper(wallpaper, index) {
    // Assistive technology can activate a radio without focusing it first, so
    // the roving tab stop moves here as well as on focus.
    if (index !== undefined) {
      this.setState({ savedFocusIndex: index });
    }
    const uploadedPreviously =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOADED_PREVIOUSLY];

    // The parent copies the image out of the library and sets every pref that
    // names it, including the selection. It can refuse, for an image another
    // tab deleted, and setting them here would leave the page pointing at one
    // it cannot show.
    this.props.dispatch(
      ac.OnlyToMain({
        type: at.WALLPAPERS_CUSTOM_APPLY,
        data: { filename: wallpaper.filename },
      })
    );

    this.handleUserEvent(at.WALLPAPER_CLICK, {
      selected_wallpaper: "custom",
      had_previous_wallpaper: !!this.props.activeWallpaper,
      had_uploaded_previously: !!uploadedPreviously,
    });
  }

  handleRemoveSavedWallpaper(wallpaper, index) {
    // The name rather than the slot: the dialog has no cancel callback, so a
    // canceled removal is told apart by its image still being there.
    this.setState({
      pendingRemoveIndex: index,
      pendingRemoveFilename: wallpaper.filename,
    });

    this.props.dispatch({
      type: at.DIALOG_OPEN,
      data: {
        onConfirm: [
          ac.OnlyToMain({
            type: at.WALLPAPER_REMOVE_UPLOAD,
            data: { filename: wallpaper.filename },
          }),
          ac.AlsoToMain({ type: at.DIALOG_CLOSE }),
        ],
        eventSource: "WALLPAPERS",
        body_string_id: [
          "newtab-wallpaper-remove-image-title",
          "newtab-wallpaper-remove-image-body",
        ],
        confirm_button_string_id: "newtab-wallpaper-remove-image-confirm",
        confirm_button_type: "primary",
        cancel_button_string_id: "newtab-wallpaper-remove-image-cancel",
      },
    });
  }

  // What a screen reader calls this image. A kept Picture of the Day carries
  // its description and a rescued Firefox wallpaper its name. An image someone
  // added has neither and goes by its number, which every saved image has.
  renderSavedWallpaperLabel(id, { number, fallbackName }) {
    // The name goes through Fluent like every other one in the picker, so it
    // picks up the same bidi isolation the remove button's copy of it gets.
    return (
      <label
        htmlFor={id}
        className="sr-only"
        data-l10n-id={
          fallbackName
            ? "newtab-wallpaper-your-images-item"
            : "newtab-wallpaper-your-images-item-numbered"
        }
        data-l10n-args={JSON.stringify(
          fallbackName ? { name: fallbackName } : { number }
        )}
      ></label>
    );
  }

  // The answer to one upload, so it is stale once acted on. Local dispatch, the
  // same way the thumbnail bytes leave this tab.
  clearUploadResult() {
    this.props.dispatch({ type: at.WALLPAPER_UPLOAD_RESULT, data: null });
  }

  // An upload lands at the top of the list and becomes the applied image, so the
  // tab stop moves to it. Focus follows only if it was already in this folder.
  focusAfterUpload() {
    const result = this.props.Wallpapers.uploadResult;
    if (!this.pendingUploadId || result?.requestId !== this.pendingUploadId) {
      return;
    }

    if (!result.filename) {
      this.pendingUploadId = null;
      this.clearUploadResult();
      return;
    }

    // The folder is not open on a first save, since the tile that started it
    // was still "Add an image". Focus the tile that replaced it.
    if (this.props.activeCategory !== WALLPAPER_CATEGORIES.CustomWallpaper) {
      this.pendingUploadId = null;
      this.clearUploadResult();
      if (this.uploadStartedFromTile) {
        this.uploadStartedFromTile = false;
        document.querySelector("#custom-wallpaper")?.focus();
      }
      return;
    }

    const addedIndex = this.savedWallpapers.findIndex(
      wallpaper => wallpaper.filename === result.filename
    );
    if (addedIndex === -1) {
      return;
    }

    this.pendingUploadId = null;
    this.clearUploadResult();

    const hadFocus = this.savedWallpaperRef.some(
      element => element && element === element.ownerDocument.activeElement
    );

    this.setState({ savedFocusIndex: addedIndex }, () => {
      if (hadFocus) {
        this.savedWallpaperRef[addedIndex]?.focus();
      }
    });
  }

  // The removed tile is gone, so focus whatever took its place. The tile that
  // adds an image is always last, so there is always something to focus.
  focusAfterRemoval() {
    const { pendingRemoveIndex, pendingRemoveFilename } = this.state;
    if (
      pendingRemoveIndex === null ||
      this.props.activeCategory !== WALLPAPER_CATEGORIES.CustomWallpaper
    ) {
      return;
    }

    const current = this.savedWallpapers;
    // Still listed means the dialog was canceled, or something else was
    // removed. Either way this is not the removal that was asked for here.
    if (current.some(w => w.filename === pendingRemoveFilename)) {
      return;
    }
    const nextIndex = Math.min(pendingRemoveIndex, current.length);
    this.setState(
      {
        pendingRemoveIndex: null,
        pendingRemoveFilename: null,
        savedFocusIndex: nextIndex,
      },
      () => {
        this.savedWallpaperRef[nextIndex]?.focus();
      }
    );
  }

  // Arrow key navigation for "Your images". The last tile adds an image, so it
  // is focused rather than activated.
  handleSavedWallpaperKeyDown(event, index) {
    const isRTL = document.dir === "rtl";
    let eventKey = event.key;

    if (eventKey === "ArrowRight" || eventKey === "ArrowLeft") {
      if (isRTL) {
        eventKey = eventKey === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
      }
    }

    const columnCount = YOUR_IMAGES_COLUMNS;
    let nextIndex = index;

    if (eventKey === "ArrowRight") {
      nextIndex = Math.min(index + 1, this.savedWallpaperRef.length - 1);
    } else if (eventKey === "ArrowLeft") {
      nextIndex = Math.max(index - 1, 0);
    } else if (eventKey === "ArrowDown") {
      // Only ever straight down. Clamping to the last tile would move sideways
      // as well, whenever the bottom row is short.
      const below = index + columnCount;
      nextIndex = below < this.savedWallpaperRef.length ? below : index;
    } else if (eventKey === "ArrowUp") {
      const above = index - columnCount;
      nextIndex = above >= 0 ? above : index;
    } else {
      return;
    }

    // Consume it either way. Left at the grid edge the native radio group would
    // wrap around and apply a different wallpaper.
    event.preventDefault();

    const next = this.savedWallpaperRef[nextIndex];
    if (!next || nextIndex === index) {
      return;
    }

    this.setState({ savedFocusIndex: nextIndex }, () => {
      next.focus();
      if (next.tagName === "INPUT") {
        next.click();
      }
    });
  }

  // Open a wallpaper category subpanel. `fromUser` distinguishes a real category
  // click (records telemetry) from a programmatic deep-link via a CTA.
  openCategory(categoryId, { fromUser = true } = {}) {
    // Entering "Your images" starts the tab stop on the applied image.
    const applied = this.appliedSavedWallpaper;
    const appliedIndex = applied ? this.savedWallpapers.indexOf(applied) : 0;

    this.setState({ savedFocusIndex: Math.max(appliedIndex, 0) });
    this.props.openPanel(categoryId);

    if (fromUser) {
      this.handleUserEvent(at.WALLPAPER_CATEGORY_CLICK, categoryId);
    }
  }

  handleCategory = event => {
    this.openCategory(event.target.id);
  };

  // Custom wallpaper image upload
  async handleUpload() {
    const wallpaperUploadMaxFileSizeEnabled =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOAD_MAX_FILE_SIZE_ENABLED];

    const wallpaperUploadMaxFileSize =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOAD_MAX_FILE_SIZE];

    const uploadedPreviously =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOADED_PREVIOUSLY];

    // Create a file input since category buttons are radio inputs
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*"; // only allow image files

    // Catch cancel events
    fileInput.oncancel = () => {
      this.setState({ customWallpaperErrorType: null });
    };

    // Reset error state when user begins file selection
    this.setState({ customWallpaperErrorType: null });

    // Fire when user selects a file
    fileInput.onchange = async event => {
      const [file] = event.target.files;

      if (file) {
        // Validate file type: Only accept files with a valid image MIME type
        const isValidImage = file.type && file.type.startsWith("image/");
        if (!isValidImage) {
          console.error("Invalid file type");
          this.setState({ customWallpaperErrorType: "fileType" });
          return;
        }

        // Limit image uploaded to a maximum file size if enabled
        // Note: The max file size pref (customWallpaper.fileSize) is converted to megabytes (MB)
        // Example: if pref value is 5, max file size is 5 MB
        const maxSize = wallpaperUploadMaxFileSize * 1024 * 1024;
        if (wallpaperUploadMaxFileSizeEnabled && file.size > maxSize) {
          console.error("File size exceeds limit");
          this.setState({ customWallpaperErrorType: "fileSize" });
          return;
        }

        let theme;
        try {
          theme = await calculateTheme(globalThis, file);
        } catch (e) {
          console.error("Failed to decode wallpaper image", e);
          this.setState({ customWallpaperErrorType: "fileType" });
          return;
        }

        // Scaled here; the parent stores the result it receives. A failure only
        // costs the tile its preview, so the save goes on.
        let thumbnail;
        try {
          thumbnail = await createThumbnail(globalThis, file);
        } catch (e) {
          console.error("Failed to make a wallpaper thumbnail", e);
        }

        const requestId = String(++uploadRequestSeq);
        this.pendingUploadId = requestId;
        // The first save turns the "Add an image" tile into the folder, and the
        // two use different keys, so React replaces the node and focus lands on
        // the body. Remember where it was so it can be put back.
        const tile = document.querySelector("#custom-wallpaper");
        this.uploadStartedFromTile =
          !!tile && tile === tile.ownerDocument.activeElement;

        this.props.dispatch(
          ac.OnlyToMain({
            type: at.WALLPAPER_UPLOAD,
            data: { file, theme, thumbnail, requestId },
          })
        );

        // Set active wallpaper ID to "custom"
        this.props.setPref("newtabWallpapers.wallpaper", "custom");
        this.props.setPref("newtabWallpapers.initialWallpaper", "");
        this.props.setPref("newtabWallpapers.user.enabled", true);

        // Update the uploadedPreviously pref to TRUE
        // Note: this pref used for telemetry. Do not reset to false.
        this.props.setPref(PREF_WALLPAPER_UPLOADED_PREVIOUSLY, true);

        this.handleUserEvent(at.WALLPAPER_CLICK, {
          selected_wallpaper: "custom",
          had_previous_wallpaper: !!this.props.activeWallpaper,
          had_uploaded_previously: !!uploadedPreviously,
        });
      }
    };

    fileInput.click();
  }

  handleBack() {
    this.props.closePanel();
    // Wait for the parent's state update before moving focus back to the category tile.
    requestAnimationFrame(() => {
      this.focusCategory(this.state.focusedCategoryIndex);
    });
  }

  handleWallpaperListEntered() {
    this.arrowButtonRef.current?.focus();
  }

  // Record user interaction when changing wallpaper and reseting wallpaper to default
  handleUserEvent(type, data) {
    this.props.dispatch(ac.OnlyToMain({ type, data }));
  }

  setActiveId = id => {
    this.setState({ activeId: id }); // Set the active ID
  };

  getRGBColors(input) {
    if (input.length !== 7) {
      return [];
    }

    const r = parseInt(input.substr(1, 2), 16);
    const g = parseInt(input.substr(3, 2), 16);
    const b = parseInt(input.substr(5, 2), 16);

    return [r, g, b];
  }

  isWallpaperColorDark([r, g, b]) {
    return 0.2125 * r + 0.7154 * g + 0.0721 * b <= 110;
  }

  renderCustomWallpaperError(id) {
    if (!this.state.customWallpaperErrorType) {
      return null;
    }

    const wallpaperUploadMaxFileSize =
      this.props.Prefs.values[PREF_WALLPAPER_UPLOAD_MAX_FILE_SIZE];

    return (
      <div className="custom-wallpaper-error" id={id} role="alert">
        <span className="icon icon-info"></span>
        {this.state.customWallpaperErrorType === "fileSize" ? (
          <span
            data-l10n-id="newtab-wallpaper-error-max-file-size"
            data-l10n-args={`{"file_size": ${wallpaperUploadMaxFileSize}}`}
          ></span>
        ) : (
          <span data-l10n-id="newtab-wallpaper-error-upload-file-type"></span>
        )}
      </div>
    );
  }

  // The "Your images" folder: everything saved, then a tile to add another.
  renderYourImages() {
    const applied = this.appliedSavedWallpaper;
    const { savedWallpapers } = this;
    this.savedWallpaperRef.length = savedWallpapers.length + 1;

    return (
      <fieldset
        className="your-images"
        style={{ "--your-images-columns": YOUR_IMAGES_COLUMNS }}
      >
        <legend
          className="sr-only"
          data-l10n-id="newtab-wallpaper-your-images"
        ></legend>
        {savedWallpapers.map((wallpaper, index) => {
          const { filename, position, number, fallbackName } = wallpaper;
          // Named the same way as the tile it belongs to.
          const removeId = fallbackName
            ? "newtab-wallpaper-remove-image"
            : "newtab-wallpaper-remove-image-numbered";
          const removeArgs = JSON.stringify(
            fallbackName ? { name: fallbackName } : { number }
          );
          const url = this.thumbnailUrl(filename);
          const id = `your-images-${filename}`;
          const isApplied = applied?.filename === filename;
          return (
            <div className="your-images-item" key={filename}>
              <input
                ref={el => {
                  if (el) {
                    this.savedWallpaperRef[index] = el;
                  }
                }}
                onChange={() => this.handleSavedWallpaper(wallpaper, index)}
                onFocus={() => this.setState({ savedFocusIndex: index })}
                onKeyDown={e => this.handleSavedWallpaperKeyDown(e, index)}
                style={
                  url
                    ? {
                        backgroundImage: `url(${url})`,
                        backgroundPosition: position,
                      }
                    : {}
                }
                type="radio"
                name="wallpaper-your-images"
                id={id}
                value={filename}
                checked={isApplied}
                className="wallpaper-input"
                tabIndex={index === this.state.savedFocusIndex ? 0 : -1}
              />
              {this.renderSavedWallpaperLabel(id, wallpaper)}
              <moz-button
                type="ghost"
                size="small"
                className="your-images-remove"
                iconSrc="chrome://global/skin/icons/close.svg"
                data-l10n-id={removeId}
                data-l10n-args={removeArgs}
                tabIndex={index === this.state.savedFocusIndex ? 0 : -1}
                onClick={() =>
                  this.handleRemoveSavedWallpaper(wallpaper, index)
                }
              ></moz-button>
            </div>
          );
        })}
        <div className="your-images-item">
          <button
            ref={el => {
              if (el) {
                this.savedWallpaperRef[savedWallpapers.length] = el;
              }
            }}
            id="your-images-add"
            className="wallpaper-input theme-custom-wallpaper"
            onFocus={() =>
              this.setState({ savedFocusIndex: savedWallpapers.length })
            }
            onClick={this.handleUpload}
            onKeyDown={e =>
              this.handleSavedWallpaperKeyDown(e, savedWallpapers.length)
            }
            tabIndex={
              savedWallpapers.length === this.state.savedFocusIndex ? 0 : -1
            }
          />
          <label
            htmlFor="your-images-add"
            data-l10n-id="newtab-wallpaper-add-an-image"
          ></label>
        </div>
      </fieldset>
    );
  }

  sortWallpapersByOrder(wallpapers) {
    return wallpapers.sort((a, b) => {
      const aOrder = a.order || 0;
      const bOrder = b.order || 0;
      if (aOrder === 0 && bOrder === 0) {
        return 0;
      }
      if (aOrder === 0) {
        return 1;
      }
      if (bOrder === 0) {
        return -1;
      }
      return aOrder - bOrder;
    });
  }

  render() {
    const prefs = this.props.Prefs.values;
    // @nova-cleanup(remove-conditional): Remove novaEnabled once Nova ships
    const novaEnabled = prefs["nova.enabled"];
    const { wallpaperList, categories } = this.props.Wallpapers;
    const { savedWallpapers } = this;
    const hasSavedWallpapers = !!savedWallpapers.length;
    // Without the library the tile stays the single upload button it was, so
    // there is no folder to browse and no folder to put an error in.
    const showYourImagesFolder = hasSavedWallpapers && this.libraryEnabled;
    const { activeWallpaper, activeCategory, showPanel } = this.props;
    const activeCategoryFluentID = this.categoryFluentID(activeCategory);
    // @nova-cleanup(remove-conditional): Remove novaEnabled check, keep arrowIconSrc computation
    let arrowIconSrc;
    if (novaEnabled) {
      const isRTL = typeof document !== "undefined" && document.dir === "rtl";
      arrowIconSrc = `chrome://global/skin/icons/shaft-arrow-${isRTL ? "right" : "left"}.svg`;
    }
    // Enable custom color select if pref'ed on
    let showColorPicker = prefs["newtabWallpapers.customColor.enabled"];
    const activeGroups = resolveWallpaperVisibilityGroups(prefs);
    let filteredWallpapers = wallpaperList.filter(
      wallpaper =>
        wallpaper.category === activeCategory &&
        isWallpaperOffered(wallpaper, activeGroups)
    );
    function reduceColorsToFitCustomColorInput(arr) {
      // Reduce the amount of custom colors to make space for the custom color picker
      while (arr.length && arr.length % 3 !== 2) {
        arr.pop();
      }
      return arr;
    }

    let wallpaperCustomSolidColorHex = null;

    const wallpapersUserEnabled = prefs["newtabWallpapers.user.enabled"];
    const selectedWallpaper = prefs["newtabWallpapers.wallpaper"];

    // User has previous selected a custom color
    if (selectedWallpaper.includes("solid-color-picker")) {
      showColorPicker = true;
      const regex = /#([a-fA-F0-9]{6})/;
      [wallpaperCustomSolidColorHex] = selectedWallpaper.match(regex);
    }

    // Remove last item of solid colors to make space for custom color picker
    if (
      prefs["newtabWallpapers.customColor.enabled"] &&
      activeCategory === "solid-colors"
    ) {
      filteredWallpapers =
        reduceColorsToFitCustomColorInput(filteredWallpapers);
    }

    // Bug 1953012 - If nothing selected, default to color of customize panel
    // --color-blue-70 : #054096
    // --color-blue-05 : #deeafc
    const starterColorHex = this.prefersDarkQuery?.matches
      ? "#054096"
      : "#deeafc";

    // Set initial state of the color picker (depending if the user has already set a custom color)
    let initStateClassname = wallpaperCustomSolidColorHex
      ? "custom-color-set"
      : "default-color-set";

    // If a custom color picker is set, make sure the icon has the correct contrast
    if (wallpaperCustomSolidColorHex) {
      const rgbColors = this.getRGBColors(wallpaperCustomSolidColorHex);
      const isColorDark = this.isWallpaperColorDark(rgbColors);
      if (isColorDark) {
        initStateClassname += " custom-color-dark";
      }
    }

    let colorPickerInput =
      showColorPicker && activeCategory === "solid-colors" ? (
        <div
          className={`theme-custom-color-picker ${initStateClassname}`}
          ref={this.customColorPickerRef}
        >
          <input
            onInput={this.handleColorInput}
            onChange={this.debouncedHandleChange}
            onClick={() => this.setActiveId("solid-color-picker")} //
            type="color"
            name={`wallpaper-solid-color-picker`}
            id="solid-color-picker"
            // aria-checked is not applicable for input[type="color"] elements
            aria-current={this.state.activeId === "solid-color-picker"}
            value={wallpaperCustomSolidColorHex || starterColorHex}
            className={`wallpaper-input
              ${this.state.activeId === "solid-color-picker" ? "active" : ""}`}
            ref={this.customColorInput}
          />
          <label
            htmlFor="solid-color-picker"
            data-l10n-id="newtab-wallpaper-custom-color"
          ></label>
        </div>
      ) : (
        ""
      );

    return (
      // @nova-cleanup(remove-conditional): Remove nova-enabled class from root div
      <div className={novaEnabled ? "nova-enabled" : undefined}>
        <div className="category-header">
          {
            // @nova-cleanup(remove-conditional): Remove h2 once Nova ships — title moves to the wallpaper toggle
            !novaEnabled && <h2 data-l10n-id="newtab-wallpaper-title"></h2>
          }
          {
            // @nova-cleanup(remove-conditional): Remove reset button once Nova ships — toggle handles reset
            !novaEnabled && (
              <button
                className="wallpapers-reset"
                onClick={this.handleReset}
                data-l10n-id="newtab-wallpaper-reset"
              />
            )
          }
        </div>
        <div
          role="grid"
          aria-label="Wallpaper category selection. Use arrow keys to navigate."
        >
          <fieldset className="category-list">
            {categories.map((category, index) => {
              const filteredList = wallpaperList.filter(
                wallpaper =>
                  wallpaper.category === category &&
                  isWallpaperOffered(wallpaper, activeGroups)
              );
              const sortedList = this.sortWallpapersByOrder(filteredList);
              const activeWallpaperObj =
                activeWallpaper &&
                sortedList.find(wp => wp.title === activeWallpaper);
              // Detect custom solid color
              const isCustomSolidColor =
                category === "solid-colors" &&
                activeWallpaper.startsWith("solid-color-picker");
              const thumbnail = activeWallpaperObj || sortedList[0];
              // The custom wallpaper tile adds an image until something is
              // saved, and is the "Your images" folder after that.
              const isYourImagesFolder =
                category === WALLPAPER_CATEGORIES.CustomWallpaper &&
                showYourImagesFolder;
              let fluent_id;
              if (category === WALLPAPER_CATEGORIES.CustomWallpaper) {
                // @nova-cleanup(remove-conditional): Remove novaEnabled conditional and always use newtab-wallpaper-add-an-image
                const addImageFluentID = novaEnabled
                  ? "newtab-wallpaper-add-an-image"
                  : "newtab-wallpaper-upload-image";
                fluent_id = isYourImagesFolder
                  ? "newtab-wallpaper-your-images"
                  : addImageFluentID;
              } else {
                fluent_id = this.categoryFluentID(category);
              }
              let style = {};
              // Thumbnails arrive from the parent after the panel opens, so the
              // folder has nothing to show for a moment on the first open.
              let folderHasPreview = false;
              if (isYourImagesFolder) {
                // The applied image and its URL reach the page ahead of the
                // library, so prefer them. A library thumbnail can still be the
                // previous image, which would show the wrong picture entirely.
                const appliedUrl =
                  prefs["newtabWallpapers.wallpaper"] === "custom"
                    ? this.props.Wallpapers.uploadedWallpaper
                    : null;
                const preview =
                  this.appliedSavedWallpaper || savedWallpapers[0];
                const previewUrl =
                  appliedUrl || this.thumbnailUrl(preview.filename);
                if (previewUrl) {
                  folderHasPreview = true;
                  style.backgroundImage = `url(${previewUrl})`;
                  style.backgroundPosition = appliedUrl
                    ? prefs["newtabWallpapers.customWallpaper.position"] ||
                      "center"
                    : preview.position;
                }
              } else if (thumbnail?.wallpaperUrl) {
                style.backgroundImage = `url(${thumbnail?.thumbnail || thumbnail?.wallpaperUrl})`;
                style.backgroundPosition =
                  thumbnail.background_position || "center";
              } else {
                style.backgroundColor = thumbnail?.solid_color || "";
              }
              // If custom solid color is active, override the thumbnail to the chosen hex
              if (isCustomSolidColor) {
                const hex =
                  activeWallpaper.split("solid-color-picker-")[1] || "";
                style.backgroundColor = hex;
              }
              const isCategorySelected =
                wallpapersUserEnabled &&
                (activeWallpaperObj ||
                  isCustomSolidColor ||
                  (isYourImagesFolder && this.appliedSavedWallpaper));
              return (
                <div key={category}>
                  <button
                    // Fluent only tidies the attributes of elements it is still
                    // translating, so dropping data-l10n-id when this stops
                    // being the folder would strand its aria-label on the node.
                    // A new key means a new element with nothing left over.
                    key={isYourImagesFolder ? "your-images" : "add-an-image"}
                    ref={el => {
                      if (el) {
                        this.categoryRef[index] = el;
                      }
                    }}
                    id={category}
                    style={style}
                    onKeyDown={e => this.handleCategoryKeyDown(e, category)}
                    // Add overrides for custom wallpaper upload UI
                    onClick={event => {
                      this.setState({ focusedCategoryIndex: index });
                      if (
                        category !== WALLPAPER_CATEGORIES.CustomWallpaper ||
                        isYourImagesFolder
                      ) {
                        this.handleCategory(event);
                      } else {
                        this.handleUpload();
                      }
                    }}
                    className={`wallpaper-input
                      ${category === WALLPAPER_CATEGORIES.CustomWallpaper && (!isYourImagesFolder || !folderHasPreview) ? "theme-custom-wallpaper" : ""}
                      ${isYourImagesFolder ? "your-images-folder" : ""}
                      ${isCategorySelected ? "selected" : ""}`}
                    tabIndex={
                      this.state.focusedCategoryIndex === index ? 0 : -1
                    }
                    data-l10n-id={
                      isYourImagesFolder
                        ? "newtab-wallpaper-your-images-folder"
                        : undefined
                    }
                    aria-expanded={
                      // The upload tile opens a file picker rather than the
                      // subpanel, so it is the one tile this does not describe.
                      isYourImagesFolder ||
                      category !== WALLPAPER_CATEGORIES.CustomWallpaper
                        ? activeCategory === category
                        : undefined
                    }
                  />
                  <label htmlFor={category} data-l10n-id={fluent_id}>
                    {fluent_id}
                  </label>
                </div>
              );
            })}
          </fieldset>
          {!showYourImagesFolder &&
            this.renderCustomWallpaperError("customWallpaperError")}
        </div>

        <CSSTransition
          nodeRef={this.wallpaperListRef}
          in={!!showPanel}
          timeout={300}
          classNames="wallpaper-list"
          unmountOnExit={true}
          onEntered={this.handleWallpaperListEntered}
        >
          <section
            ref={this.wallpaperListRef}
            className="category wallpaper-list ignore-color-mode"
          >
            {
              // @nova-cleanup(remove-conditional): Remove novaEnabled check and the else branch, keep the nova branch
              novaEnabled ? (
                <div className="arrow-wrapper">
                  <moz-button
                    ref={this.arrowButtonRef}
                    type="ghost"
                    className="arrow-button"
                    iconSrc={arrowIconSrc}
                    data-l10n-id="newtab-customize-panel-back-button"
                    onClick={this.handleBack}
                  />
                  <h2 data-l10n-id={activeCategoryFluentID}></h2>
                </div>
              ) : (
                <button
                  ref={this.arrowButtonRef}
                  className="arrow-button"
                  data-l10n-id={activeCategoryFluentID}
                  onClick={this.handleBack}
                />
              )
            }
            <div
              role="grid"
              aria-label="Wallpaper selection. Use arrow keys to navigate."
            >
              {activeCategory === WALLPAPER_CATEGORIES.CustomWallpaper ? (
                this.renderYourImages()
              ) : (
                <fieldset>
                  {this.sortWallpapersByOrder(filteredWallpapers).map(
                    (
                      {
                        background_position,
                        fluent_id,
                        solid_color,
                        theme,
                        title,
                        thumbnail,
                        wallpaperUrl,
                      },
                      index
                    ) => {
                      let style = {};
                      if (wallpaperUrl) {
                        style.backgroundImage = `url(${thumbnail || wallpaperUrl})`;
                        style.backgroundPosition =
                          background_position || "center";
                      } else {
                        style.backgroundColor = solid_color || "";
                      }
                      return (
                        <React.Fragment key={title}>
                          <input
                            ref={el => {
                              if (el) {
                                this.wallpaperRef[index] = el;
                              }
                            }}
                            onChange={this.handleChange}
                            onKeyDown={e =>
                              this.handleWallpaperKeyDown(e, title)
                            }
                            style={style}
                            type="radio"
                            name={`wallpaper-${title}`}
                            id={title}
                            value={title}
                            checked={
                              wallpapersUserEnabled && title === activeWallpaper
                            }
                            aria-checked={
                              wallpapersUserEnabled && title === activeWallpaper
                            }
                            className={`wallpaper-input theme-${theme} ${this.state.activeId === title ? "active" : ""}`}
                            onClick={() => this.setActiveId(title)} //
                            tabIndex={index === 0 ? 0 : -1} //the first wallpaper in the array will have a tabindex of 0 so we can tab into it. The rest will have a tabindex of -1
                          />
                          <label
                            htmlFor={title}
                            className="sr-only"
                            data-l10n-id={fluent_id}
                          >
                            {fluent_id}
                          </label>
                        </React.Fragment>
                      );
                    }
                  )}
                  {colorPickerInput}
                </fieldset>
              )}
            </div>
            {activeCategory === WALLPAPER_CATEGORIES.CustomWallpaper &&
              this.renderCustomWallpaperError("yourImagesWallpaperError")}
          </section>
        </CSSTransition>
      </div>
    );
  }
}

export const WallpaperCategories = connect(state => {
  return {
    Wallpapers: state.Wallpapers,
    Prefs: state.Prefs,
    customizePanelWallpaperCategory: state.App.customizePanelWallpaperCategory,
  };
})(_WallpaperCategories);
