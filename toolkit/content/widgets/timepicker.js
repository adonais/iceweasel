/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from timekeeper.js */
/* import-globals-from spinner.js */

"use strict";

function TimePicker(context) {
  this.context = context;
  this._attachEventListeners();
}

{
  const DAY_IN_MS = 86400000,
    // The min value is 0001-01-01 based on HTML spec:
    // https://html.spec.whatwg.org/#valid-date-string
    MIN_DATE = -62135596800000,
    // The max value is derived from the ECMAScript spec (275760-09-13):
    // http://ecma-international.org/ecma-262/5.1/#sec-15.9.1.1
    MAX_DATE = 8640000000000000;

  TimePicker.prototype = {
    /**
     * Initializes the time picker. Set the default states and properties.
     *
     * @param  {object} props
     *         {
     *           {String} type: "date", "time", or "datetime-local"
     *           {Number} year [optional]
     *           {Number} month [optional]
     *           {Number} day [optional]
     *           {Number} hour [optional]: Hour in 24 hours format (0~23), default is current hour
     *           {Number} minute [optional]: Minute (0~59), default is current minute
     *           {Number} second [optional]: Second (0~59), default is current second
     *           {Number} millisecond [optional]: Millisecond (0~999), default is current millisecond
     *           {Number} min: Minimum time, in ms
     *           {Number} max: Maximum time, in ms
     *           {Number} step: Step size in ms
     *           {String} format [optional]: "12" for 12 hours, "24" for 24 hours format
     *           {String} locale [optional]: User preferred locale
     *           {Boolean} showSeconds [optional]: Whether a seconds picker should be shown
     *           {Boolean} showMilliseconds [optional]: Whether a milliseconds picker should be shown
     *         }
     */
    init(props) {
      if (props.type == "date") {
        return;
      }
      if (props.type == "datetime-local") {
        // When both date and time pickers are shown, we have to adjust the
        // picker panel markup. Otherwise one panel would include two different
        // modal dialogs (which is not appropriate) and would be missing
        // a common title (which is confusing).
        // TODO(bug 1993756): Handle the panel dialog markups in a better location.
        const timepicker = this.context;
        const datetimepicker = timepicker.parentNode;
        const datepicker = datetimepicker.children.namedItem("date-picker");
        // Each date and time picker to become a group instead of a modal:
        timepicker.setAttribute("role", "group");
        timepicker.removeAttribute("aria-modal");
        datepicker.setAttribute("role", "group");
        datepicker.removeAttribute("aria-modal");
        // Parent container to become a modal dialog container for both groups:
        datetimepicker.setAttribute("role", "dialog");
        datetimepicker.setAttribute("aria-modal", "true");
        datetimepicker.setAttribute("data-l10n-id", "datetime-picker-label");
      }
      this.context.hidden = false;
      this.props = props || {};
      this._setDefaultState();
      this._createComponents();
      this._setComponentStates();
      // TODO(bug 1828721): This is a bit sad.
      window.PICKER_READY = true;
      document.dispatchEvent(new CustomEvent("PickerReady"));
      // Manage focus for a timepicker dialog:
      if (props.type == "time") {
        this.components.hour.elements.spinner.focus();
      }
    },

    /*
     * Set initial time states. If there's no hour & minute, it will
     * use the current time. The Time module keeps track of the time states,
     * and calculates the valid options given the time, min, max, step,
     * and format (12 or 24).
     */
    _setDefaultState() {
      const {
        type,
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
        min,
        max,
        step,
        format,
        showSeconds,
        showMilliseconds,
      } = this.props;
      const now = new Date();

      let defaultMin = 0;
      let defaultMax = DAY_IN_MS - 1;
      if (type == "datetime-local") {
        defaultMin = MIN_DATE;
        defaultMax = MAX_DATE;
      }
      let timeKeeper = new TimeKeeper({
        type,
        year,
        month,
        day,
        min: new Date(Number.isNaN(min) ? defaultMin : min),
        max: new Date(Number.isNaN(max) ? defaultMax : max),
        step,
        format: format || "12",
      });
      const newState = {
        hour: hour == undefined ? now.getHours() : hour,
        minute: minute == undefined ? now.getMinutes() : minute,
      };
      if (showSeconds) {
        newState.second = second == undefined ? now.getSeconds() : second;
      }
      if (showMilliseconds) {
        newState.millisecond =
          millisecond == undefined ? now.getMilliseconds() : millisecond;
      }
      timeKeeper.setState(newState);
      if (timeKeeper.state.isInvalid) {
        // Value is set to min if it's first opened and time state is invalid
        // Work from largest to smallest component to find the lowest valid time
        const validPeriods = timeKeeper.ranges.dayPeriod.filter(m => m.enabled);
        if (validPeriods.length) {
          timeKeeper.setDayPeriod(validPeriods[0].value);
        }
        const validHours = timeKeeper.ranges.hours.filter(h => h.enabled);
        if (validHours.length) {
          timeKeeper.setHour(validHours[0].value);
        }
        const validMinutes = timeKeeper.ranges.minutes.filter(m => m.enabled);
        if (validMinutes.length) {
          timeKeeper.setMinute(validMinutes[0].value);
        }
        const validSeconds = timeKeeper.ranges.seconds.filter(s => s.enabled);
        if (validSeconds.length) {
          timeKeeper.setSecond(validSeconds[0].value);
        }
        const validMilliseconds = timeKeeper.ranges.milliseconds.filter(
          ms => ms.enabled
        );
        if (validMilliseconds.length) {
          timeKeeper.setMillisecond(validMilliseconds[0].value);
        }
      }

      this.state = { timeKeeper };
    },

    /**
     * Initalize the spinner components.
     */
    _createComponents() {
      const { locale, format, showSeconds, showMilliseconds } = this.props;
      const { timeKeeper } = this.state;

      const wrapSetValueFn = setTimeFunction => {
        return value => {
          setTimeFunction(value);
          this._setComponentStates();
          this._dispatchState();
        };
      };
      const options = {
        hour: "numeric",
        minute: "numeric",
        hour12: format == "12",
      };
      if (showSeconds) {
        options.second = "numeric";
      }
      if (showMilliseconds) {
        options.fractionalSecondDigits = 3;
      }
      const dateTimeFormat = new Intl.DateTimeFormat(locale, options);
      const getPartValue = (date, type) =>
        dateTimeFormat.formatToParts(date).find(f => f.type == type).value;

      this.components = {};

      // Insert components as defined by the current locale.
      for (const timePart of dateTimeFormat.formatToParts(new Date(0))) {
        switch (timePart.type) {
          case "second":
            this.components.second = new Spinner(
              {
                setValue: wrapSetValueFn(value => {
                  timeKeeper.setSecond(value);
                  this.state.isSecondSet = true;
                }),
                getDisplayString: second =>
                  getPartValue(new Date(0).setSeconds(second), "second"),
              },
              this.context
            );
            break;
          case "fractionalSecond":
            this.components.millisecond = new Spinner(
              {
                setValue: wrapSetValueFn(value => {
                  timeKeeper.setMillisecond(value);
                  this.state.isMillisecondSet = true;
                }),
                getDisplayString: millisecond =>
                  getPartValue(
                    new Date(0).setMilliseconds(millisecond),
                    "fractionalSecond"
                  ),
              },
              this.context
            );
            break;
          case "minute":
            this.components.minute = new Spinner(
              {
                setValue: wrapSetValueFn(value => {
                  timeKeeper.setMinute(value);
                  this.state.isMinuteSet = true;
                }),
                getDisplayString: minute =>
                  getPartValue(new Date(0).setMinutes(minute), "minute"),
              },
              this.context
            );
            break;
          case "hour":
            this.components.hour = new Spinner(
              {
                setValue: wrapSetValueFn(value => {
                  timeKeeper.setHour(value);
                  this.state.isHourSet = true;
                }),
                getDisplayString: hour =>
                  getPartValue(new Date(0).setHours(hour), "hour"),
              },
              this.context
            );
            break;
          case "dayPeriod":
            this.components.dayPeriod = new Spinner(
              {
                setValue: wrapSetValueFn(value => {
                  timeKeeper.setDayPeriod(value);
                  this.state.isDayPeriodSet = true;
                }),
                getDisplayString: dayPeriod =>
                  getPartValue(new Date(0).setHours(dayPeriod), "dayPeriod"),
                hideButtons: true,
              },
              this.context
            );
            break;
          case "literal":
            if (timePart.value == " ") {
              this._insertLayoutElement({
                tag: "div",
                className: "spacer",
              });
              break;
            }
            this._insertLayoutElement({
              tag: "div",
              textContent: timePart.value,
              className: "colon",
            });
            break;
        }
      }
      this._updateButtonIds();
    },

    /**
     * Insert element for layout purposes.
     *
     * @param {object}
     *        {
     *          {String} tag: The tag to create
     *          {String} className [optional]: Class name
     *          {String} textContent [optional]: Text content
     *        }
     */
    _insertLayoutElement({ tag, className, textContent }) {
      let el = document.createElement(tag);
      el.textContent = textContent;
      el.className = className;
      this.context.appendChild(el);
    },

    /**
     * Set component states.
     */
    _setComponentStates() {
      const {
        timeKeeper,
        isHourSet,
        isMinuteSet,
        isSecondSet,
        isMillisecondSet,
        isDayPeriodSet,
      } = this.state;
      const isInvalid = timeKeeper.state.isInvalid;

      this.components.hour.setState({
        value: timeKeeper.hour,
        items: timeKeeper.ranges.hours,
        isInfiniteScroll: true,
        isValueSet: isHourSet,
        isInvalid,
      });

      this.components.minute.setState({
        value: timeKeeper.minute,
        items: timeKeeper.ranges.minutes,
        isInfiniteScroll: true,
        isValueSet: isMinuteSet,
        isInvalid,
      });

      this.components.second?.setState({
        value: timeKeeper.second,
        items: timeKeeper.ranges.seconds,
        isInfiniteScroll: true,
        isValueSet: isSecondSet,
        isInvalid,
      });

      this.components.millisecond?.setState({
        value: timeKeeper.millisecond,
        items: timeKeeper.ranges.milliseconds,
        isInfiniteScroll: true,
        isValueSet: isMillisecondSet,
        isInvalid,
      });

      // The AM/PM spinner is only available in 12hr mode
      this.components.dayPeriod?.setState({
        value: timeKeeper.dayPeriod,
        items: timeKeeper.ranges.dayPeriod,
        isInfiniteScroll: false,
        isValueSet: isDayPeriodSet,
        isInvalid,
      });
    },

    /**
     * Dispatch CustomEvent to pass the state of picker to the panel.
     */
    _dispatchState() {
      const { hour, minute, second, millisecond } = this.state.timeKeeper;
      const {
        isHourSet,
        isMinuteSet,
        isSecondSet,
        isMillisecondSet,
        isDayPeriodSet,
      } = this.state;
      // The panel is listening to window for postMessage event, so we
      // do postMessage to itself to send data to input boxes.
      window.postMessage(
        {
          name: "PickerPopupChanged",
          detail: {
            hour,
            minute,
            second,
            millisecond,
            isHourSet,
            isMinuteSet,
            isSecondSet,
            isMillisecondSet,
            isDayPeriodSet,
          },
        },
        "*"
      );
    },

    /**
     * Dispatch CustomEvent to ask the panel to close picker.
     */
    _closePopup() {
      // The panel is listening to window for postMessage event, so we
      // do postMessage to itself to close the panel without sending new data
      window.postMessage(
        {
          name: "ClosePopup",
        },
        "*"
      );
    },
    _attachEventListeners() {
      window.addEventListener("message", this);
      document.addEventListener("mousedown", this);
      document.addEventListener("keydown", this);
    },

    /**
     * Move the keyboard focus between spinners of the picker.
     *
     * @param {boolean} isReverse: Does the navigation expected to be following
     *                           the focus order (false) or not (true/isReverse)
     */
    focusNextSpinner(isReverse) {
      let focusedSpinner = document.activeElement;
      let spinners =
        focusedSpinner.parentNode.parentNode.querySelectorAll(".spinner");
      spinners = [...spinners];

      let next = isReverse
        ? spinners[spinners.indexOf(focusedSpinner) - 1]
        : spinners[spinners.indexOf(focusedSpinner) + 1];

      next?.focus();
    },

    /**
     * Handle events.
     *
     * @param  {Event} event
     */
    handleEvent(event) {
      switch (event.type) {
        case "message": {
          this.handleMessage(event);
          break;
        }
        case "mousedown": {
          // Use preventDefault to keep focus on input boxes
          event.preventDefault();
          event.target.setPointerCapture(event.pointerId);
          break;
        }
        case "keydown": {
          if (
            this.context.parentNode.id == "datetime-picker" &&
            !event.target.closest("#time-picker")
          ) {
            // The target was not a timepicker (likely a datepicker)
            break;
          }
          switch (event.key) {
            case "Enter":
            case " ": {
              // Update the value and close the picker panel
              event.stopPropagation();
              event.preventDefault();
              this._dispatchState();
              this._closePopup();
              break;
            }
            case "Escape": {
              // Close the time picker on Escape from within the panel
              event.stopPropagation();
              event.preventDefault();
              // TODO: Revert the input value to it's state before the timepicker was opened
              this._closePopup();
              break;
            }
            case "ArrowLeft":
            case "ArrowRight": {
              const isReverse = event.key == "ArrowLeft";
              this.focusNextSpinner(isReverse);
              break;
            }
          }
          break;
        }
      }
    },

    /**
     * Handle postMessage events.
     *
     * @param {Event} event
     */
    handleMessage(event) {
      switch (event.data.name) {
        case "PickerInit": {
          this.init(event.data.detail);
          break;
        }
        case "PickerPopupChanged": {
          // For datetime-local pickers, if the date is changed, notify the
          // timekeeper so it can provide updated valid ranges.
          if (this.props?.type != "datetime-local") {
            break;
          }
          if (
            event.data.detail?.year === undefined ||
            event.data.detail?.month === undefined ||
            event.data.detail?.day === undefined
          ) {
            break;
          }
          this.state.timeKeeper?.setState({
            year: event.data.detail.year,
            month: event.data.detail.month,
            day: event.data.detail.day,
          });
          this._setComponentStates();
          break;
        }
      }
    },

    /**
     * Update attributes, localizable IDs of spinners and their Prev/Next buttons:
     */
    _updateButtonIds() {
      let buttons = [
        [
          this.components.hour.elements.prev,
          "spinner-hour-previous",
          "time-spinner-hour-previous",
        ],
        [
          this.components.hour.elements.spinner,
          "spinner-hour",
          "time-spinner-hour-label",
        ],
        [
          this.components.hour.elements.next,
          "spinner-hour-next",
          "time-spinner-hour-next",
        ],
        [
          this.components.minute.elements.prev,
          "spinner-minute-previous",
          "time-spinner-minute-previous",
        ],
        [
          this.components.minute.elements.spinner,
          "spinner-minute",
          "time-spinner-minute-label",
        ],
        [
          this.components.minute.elements.next,
          "spinner-minute-next",
          "time-spinner-minute-next",
        ],
      ];

      if (this.components.second) {
        buttons = [
          ...buttons,
          [
            this.components.second.elements.prev,
            "spinner-second-previous",
            "time-spinner-second-previous",
          ],
          [
            this.components.second.elements.spinner,
            "spinner-second",
            "time-spinner-second-label",
          ],
          [
            this.components.second.elements.next,
            "spinner-second-next",
            "time-spinner-second-next",
          ],
        ];
      }

      if (this.components.millisecond) {
        buttons = [
          ...buttons,
          [
            this.components.millisecond.elements.prev,
            "spinner-millisecond-previous",
            "time-spinner-millisecond-previous",
          ],
          [
            this.components.millisecond.elements.spinner,
            "spinner-millisecond",
            "time-spinner-millisecond-label",
          ],
          [
            this.components.millisecond.elements.next,
            "spinner-millisecond-next",
            "time-spinner-millisecond-next",
          ],
        ];
      }

      // The AM/PM spinner is only available in 12hr mode
      if (this.components.dayPeriod) {
        buttons = [
          ...buttons,
          [
            this.components.dayPeriod.elements.prev,
            "spinner-time-previous",
            "time-spinner-day-period-previous",
          ],
          [
            this.components.dayPeriod.elements.spinner,
            "spinner-time",
            "time-spinner-day-period-label",
          ],
          [
            this.components.dayPeriod.elements.next,
            "spinner-time-next",
            "time-spinner-day-period-next",
          ],
        ];
      }

      for (const [btn, id, l10nId] of buttons) {
        btn.setAttribute("id", id);
        document.l10n.setAttributes(btn, l10nId);
      }
    },
  };
}

document.addEventListener("DOMContentLoaded", () => {
  // Create a TimePicker instance and prepare to be initialized
  // by the "PickerInit" message.
  new TimePicker(document.getElementById("time-picker"));
});
