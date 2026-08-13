/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  createElement,
  createFactory,
  PureComponent,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
const {
  withRouter,
} = require("resource://devtools/client/shared/vendor/react-router-dom.js");

const FluentReact = require("resource://devtools/client/shared/vendor/fluent-react.js");
const Localized = createFactory(FluentReact.Localized);

const {
  ICON_LABEL_LEVEL,
  PAGE_TYPES,
  RUNTIMES,
} = require("resource://devtools/client/aboutdebugging/src/constants.js");
const Types = require("resource://devtools/client/aboutdebugging/src/types/index.js");
loader.lazyRequireGetter(
  this,
  "ADB_ADDON_STATES",
  "resource://devtools/client/shared/remote-debugging/adb/adb-addon.js",
  true
);

const IconLabel = createFactory(
  require("resource://devtools/client/aboutdebugging/src/components/shared/IconLabel.js")
);
const SidebarItem = createFactory(
  require("resource://devtools/client/aboutdebugging/src/components/sidebar/SidebarItem.js")
);
const SidebarRuntimeItem = createFactory(
  require("resource://devtools/client/aboutdebugging/src/components/sidebar/SidebarRuntimeItem.js")
);
const RefreshDevicesButton = createFactory(
  require("resource://devtools/client/aboutdebugging/src/components/sidebar/RefreshDevicesButton.js")
);
const FIREFOX_ICON =
  "chrome://devtools/skin/images/aboutdebugging-firefox-logo.svg";
const CONNECT_ICON = "chrome://devtools/skin/images/settings.svg";
const GLOBE_ICON =
  "chrome://devtools/skin/images/aboutdebugging-globe-icon.svg";
const USB_ICON =
  "chrome://devtools/skin/images/aboutdebugging-connect-icon.svg";
const HELP_ICON = "chrome://global/skin/icons/help.svg";

class Sidebar extends PureComponent {
  static get propTypes() {
    return {
      adbAddonStatus: Types.adbAddonStatus,
      className: PropTypes.string,
      dispatch: PropTypes.func.isRequired,
      history: PropTypes.object,
      isAdbReady: PropTypes.bool.isRequired,
      isScanningUsb: PropTypes.bool.isRequired,
      networkRuntimes: PropTypes.arrayOf(Types.runtime).isRequired,
      selectedPage: Types.page,
      selectedRuntimeId: PropTypes.string,
      usbRuntimes: PropTypes.arrayOf(Types.runtime).isRequired,
    };
  }

  componentDidMount() {
    // Capture the custom event emitted by `<moz-page-nav-button>` when clicked so we
    // can navigate to the associated page
    window.addEventListener("change-view", this.onChangeView);
  }

  componentWillUnmount() {
    window.removeEventListener("change-view", this.onChangeView);
  }

  onChangeView = e => {
    const to = e.target.getAttribute("to");
    if (this.props.history.location.pathname !== to) {
      // Underlying ReactRouter API
      this.props.history.push(to);
    }
  };

  renderAdbStatus() {
    const isUsbEnabled =
      this.props.isAdbReady &&
      this.props.adbAddonStatus === ADB_ADDON_STATES.INSTALLED;
    const localizationId = isUsbEnabled
      ? "about-debugging-sidebar-usb-enabled"
      : "about-debugging-sidebar-usb-disabled";
    return IconLabel(
      {
        level: isUsbEnabled ? ICON_LABEL_LEVEL.OK : ICON_LABEL_LEVEL.INFO,
      },
      Localized(
        {
          id: localizationId,
        },
        dom.span(
          {
            className: "qa-sidebar-usb-status",
          },
          localizationId
        )
      )
    );
  }

  renderDevicesEmpty() {
    return SidebarItem(
      {},
      Localized(
        {
          id: "about-debugging-sidebar-no-devices",
        },
        dom.aside(
          {
            className: "sidebar__label qa-sidebar-no-devices",
          },
          "No devices discovered"
        )
      )
    );
  }

  renderDevices() {
    const { networkRuntimes, usbRuntimes } = this.props;

    // render a "no devices" messages when the lists are empty
    if (!networkRuntimes.length && !usbRuntimes.length) {
      return this.renderDevicesEmpty();
    }
    // render all devices otherwise
    return [
      ...this.renderRuntimeItems(GLOBE_ICON, networkRuntimes),
      ...this.renderRuntimeItems(USB_ICON, usbRuntimes),
    ];
  }

  renderRuntimeItems(icon, runtimes) {
    const { dispatch, selectedPage, selectedRuntimeId } = this.props;

    return runtimes.map(runtime => {
      const keyId = `${runtime.type}-${runtime.id}`;
      const runtimeHasDetails = !!runtime.runtimeDetails;
      const isSelected =
        selectedPage === PAGE_TYPES.RUNTIME && runtime.id === selectedRuntimeId;

      let name = runtime.name;
      if (runtime.type === RUNTIMES.USB && runtimeHasDetails) {
        // Update the name to be same to the runtime page.
        name = runtime.runtimeDetails.info.name;
      }

      return SidebarRuntimeItem({
        deviceName: runtime.extra.deviceName,
        dispatch,
        icon,
        key: keyId,
        isConnected: runtimeHasDetails,
        isConnecting: runtime.isConnecting,
        isConnectionFailed: runtime.isConnectionFailed,
        isConnectionNotResponding: runtime.isConnectionNotResponding,
        isConnectionTimeout: runtime.isConnectionTimeout,
        isSelected,
        isUnavailable: runtime.isUnavailable,
        isUnplugged: runtime.isUnplugged,
        name,
        runtimeId: runtime.id,
      });
    });
  }

  render() {
    const { dispatch, selectedPage, selectedRuntimeId, isScanningUsb } =
      this.props;

    return createElement(
      "moz-page-nav",
      {
        "data-l10n-id": "about-debugging-sidebar",
        // Since we don't render the usb/remote runtimes with moz-page-nav-button yet,
        // we need to handle the currentView ourselves.
        // This could be removed as part of Bug 2050746
        currentView: `${selectedPage}${selectedRuntimeId ? `/${selectedRuntimeId}` : ""}`,
        // This is so if a usb/remote runtime is selected, none of the moz-page-nav-button
        // will appear selected
        allowNoSelection: true,
        alwaysexpanded: true,
      },
      createElement(
        "moz-page-nav-button",
        {
          "data-l10n-id": "about-debugging-sidebar-setup-title",
          class: "qa-sidebar-item",
          iconSrc: CONNECT_ICON,
          key: PAGE_TYPES.CONNECT,
          view: PAGE_TYPES.CONNECT,
          to: "/setup",
        },
        createElement("span", {
          "data-l10n-id": "about-debugging-sidebar-setup2",
        })
      ),
      createElement(
        "moz-page-nav-button",
        {
          "data-l10n-id": "about-debugging-sidebar-this-firefox-title",
          class: "qa-sidebar-item",
          iconSrc: FIREFOX_ICON,
          key: RUNTIMES.THIS_FIREFOX,
          view: `${PAGE_TYPES.RUNTIME}/${RUNTIMES.THIS_FIREFOX}`,
          to: `/runtime/${RUNTIMES.THIS_FIREFOX}`,
        },
        createElement("span", {
          "data-l10n-id": "about-debugging-sidebar-this-firefox2",
        })
      ),
      SidebarItem(
        {
          className: "sidebar__adb-status",
        },
        this.renderAdbStatus()
      ),
      this.renderDevices(),
      SidebarItem(
        {
          className: "sidebar-item--breathe sidebar__refresh-usb",
          key: "refresh-devices",
        },
        RefreshDevicesButton({
          dispatch,
          isScanning: isScanningUsb,
        })
      ),
      dom.hr({
        className: "separator separator--breathe",
        slot: "secondary-nav",
      }),
      createElement("moz-page-nav-button", {
        "data-l10n-id": "about-debugging-sidebar-support",
        slot: "secondary-nav",
        iconSrc: HELP_ICON,
        href: "https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/",
      })
    );
  }
}

module.exports = withRouter(Sidebar);
