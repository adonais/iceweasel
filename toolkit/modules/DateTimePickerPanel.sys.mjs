/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var DateTimePickerPanel = class {
  constructor(element) {
    this.element = element;

    this.TIME_PICKER_WIDTH = "13em";
    this.TIME_PICKER_HEIGHT = "22em";
    this.DATE_PICKER_WIDTH = "24em";
    this.DATE_PICKER_HEIGHT = "27em";
    this.DATETIME_PICKER_WIDTH = "40em";
    this.DATETIME_PICKER_HEIGHT = "27em";
  }

  get dateTimePopupFrame() {
    let frame = this.element.querySelector("#dateTimePopupFrame");
    if (!frame) {
      frame = this.element.ownerDocument.createXULElement("iframe");
      frame.id = "dateTimePopupFrame";
      this.element.appendChild(frame);
    }
    return frame;
  }

  openPicker(type, rect, detail) {
    if (
      type == "datetime-local" &&
      !Services.prefs.getBoolPref("dom.forms.datetime.timepicker")
    ) {
      type = "date";
    }
    this.pickerState = {};
    // TODO: Resize picker according to content zoom level
    this.element.style.fontSize = "10px";
    this.type = type;
    this.detail = detail;
    this.dateTimePopupFrame.addEventListener("load", this, true);
    this.dateTimePopupFrame.setAttribute(
      "src",
      "chrome://global/content/datetimepicker.xhtml"
    );
    switch (type) {
      case "time": {
        this.dateTimePopupFrame.style.width = this.TIME_PICKER_WIDTH;
        this.dateTimePopupFrame.style.height = this.TIME_PICKER_HEIGHT;
        break;
      }
      case "date": {
        this.dateTimePopupFrame.style.width = this.DATE_PICKER_WIDTH;
        this.dateTimePopupFrame.style.height = this.DATE_PICKER_HEIGHT;
        break;
      }
      case "datetime-local": {
        this.dateTimePopupFrame.style.width = this.DATETIME_PICKER_WIDTH;
        this.dateTimePopupFrame.style.height = this.DATETIME_PICKER_HEIGHT;
        break;
      }
    }
    this.element.openPopupAtScreenRect(
      "after_start",
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      false,
      false
    );
  }

  closePicker(clear) {
    if (clear) {
      this.element.dispatchEvent(new CustomEvent("DateTimePickerValueCleared"));
    }
    this.pickerState = {};
    this.type = undefined;
    this.dateTimePopupFrame.removeEventListener("load", this, true);
    this.dateTimePopupFrame.contentWindow.removeEventListener("message", this);
    this.dateTimePopupFrame.setAttribute("src", "");
    this.element.hidePopup();
  }

  setPopupValue(data) {
    const detail = data.value;
    // Month value from input box starts from 1 instead of 0
    detail.month = detail.month == undefined ? undefined : detail.month - 1;
    this.postMessageToPicker({
      name: "PickerSetValue",
      detail,
    });
  }

  initPicker(detail) {
    let locale = new Services.intl.Locale(
      Services.locale.webExposedLocales[0],
      {
        calendar: "gregory",
      }
    ).toString();

    // Workaround for bug 1418061, while we wait for resolution of
    // http://bugs.icu-project.org/trac/ticket/13592: drop the PT region code,
    // because it results in "abbreviated" day names that are too long;
    // the region-less "pt" locale has shorter forms that are better here.
    locale = locale.replace(/^pt-PT/i, "pt");

    const dir = Services.locale.isAppLocaleRTL ? "rtl" : "ltr";

    const { year, month, day, hour, minute } = detail.value;
    const flattenDetail = {
      type: this.type,
      year,
      // Month value from input box starts from 1 instead of 0
      month: month == undefined ? undefined : month - 1,
      day,
      hour,
      minute,
      locale,
      dir,
      format: detail.format || "12",
      min: detail.min,
      max: detail.max,
      step: detail.step,
      stepBase: detail.stepBase,
    };

    if (this.type !== "time") {
      const { firstDayOfWeek, weekends } = this.getCalendarInfo(locale);

      const monthDisplayNames = new Services.intl.DisplayNames(locale, {
        type: "month",
        style: "short",
        calendar: "gregory",
      });
      const monthStrings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
        monthNumber => monthDisplayNames.of(monthNumber)
      );

      const weekdayDisplayNames = new Services.intl.DisplayNames(locale, {
        type: "weekday",
        style: "abbreviated",
        calendar: "gregory",
      });
      const weekdayStrings = [
        // Weekdays starting Sunday (7) to Saturday (6).
        7, 1, 2, 3, 4, 5, 6,
      ].map(weekday => weekdayDisplayNames.of(weekday));
      Object.assign(flattenDetail, {
        firstDayOfWeek,
        weekends,
        monthStrings,
        weekdayStrings,
      });
    }
    this.postMessageToPicker({
      name: "PickerInit",
      detail: flattenDetail,
    });
  }

  /**
   * @param {Boolean} passAllValues: Pass spinner values regardless if they've been set/changed or not
   */
  setInputBoxValue(passAllValues) {
    const value = {
      year: this.pickerState.year,
      month: this.pickerState.month,
      day: this.pickerState.day,
      hour: this.pickerState.hour,
      minute: this.pickerState.minute,
    };
    if (this.type !== "date") {
      const isNoValueSet =
        this.pickerState.isHourSet ||
        this.pickerState.isMinuteSet ||
        this.pickerState.isDayPeriodSet;
      if (!passAllValues || isNoValueSet) {
        value.hour =
          this.pickerState.isHourSet || this.pickerState.isDayPeriodSet
            ? value.hour
            : undefined;
        value.minute = this.pickerState.isMinuteSet ? value.minute : undefined;
      }
    }
    this.sendPickerValueChanged(value);
  }

  sendPickerValueChanged(value) {
    let detail = {};
    switch (this.type) {
      case "time": {
        detail = {
          hour: value.hour,
          minute: value.minute,
        };
        break;
      }
      case "date": {
        detail = {
          year: value.year,
          // Month value from input box starts from 1 instead of 0
          month: value.month == undefined ? undefined : value.month + 1,
          day: value.day,
        };
        break;
      }
      case "datetime-local": {
        detail = {
          year: value.year,
          // Month value from input box starts from 1 instead of 0
          month: value.month == undefined ? undefined : value.month + 1,
          day: value.day,
          hour: value.hour,
          minute: value.minute,
        };
        break;
      }
    }
    this.element.dispatchEvent(
      new CustomEvent("DateTimePickerValueChanged", {
        detail,
      })
    );
  }

  getCalendarInfo(locale) {
    const calendarInfo = Services.intl.getCalendarInfo(locale);

    // Day of week from calendarInfo starts from 1 as Monday to 7 as Sunday,
    // so they need to be mapped to JavaScript convention with 0 as Sunday
    // and 6 as Saturday
    function toDateWeekday(day) {
      return day === 7 ? 0 : day;
    }

    let firstDayOfWeek = toDateWeekday(calendarInfo.firstDayOfWeek),
      weekend = calendarInfo.weekend;

    let weekends = weekend.map(toDateWeekday);

    return {
      firstDayOfWeek,
      weekends,
    };
  }

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load": {
        this.initPicker(this.detail);
        this.dateTimePopupFrame.contentWindow.addEventListener("message", this);
        break;
      }
      case "message": {
        this.handleMessage(aEvent);
        break;
      }
    }
  }

  handleMessage(aEvent) {
    if (
      !this.dateTimePopupFrame.contentDocument.nodePrincipal.isSystemPrincipal
    ) {
      return;
    }

    switch (aEvent.data.name) {
      case "PickerPopupChanged": {
        this.pickerState = aEvent.data.detail;
        this.setInputBoxValue();
        break;
      }
      case "ClosePopup": {
        this.closePicker(aEvent.data.detail);
        break;
      }
    }
  }

  postMessageToPicker(data) {
    if (
      this.dateTimePopupFrame.contentDocument.nodePrincipal.isSystemPrincipal
    ) {
      this.dateTimePopupFrame.contentWindow.postMessage(data, "*");
    }
  }
};
