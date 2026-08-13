/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Base monitor schedule.
 */
export class Schedule {
  /**
   * @param {string} type - "interval", "daily", or "weekly"
   * @param {object} options - Schedule options, already normalized
   */
  constructor(type, options) {
    this.type = type;
    Object.assign(this, options);
  }

  /**
   * @param {object} schedule - Serialized schedule data.
   * @returns {Schedule}
   */
  static fromJSON(schedule) {
    if (!schedule || typeof schedule !== "object") {
      throw new Error("Monitor schedule is invalid.");
    }

    // if the schedule already has a getNextRunTime method, assume it's already a Schedule instance.
    if (typeof schedule.getNextRunTime === "function") {
      return schedule;
    }

    // create the appropriate subclass instance
    switch (schedule.type) {
      case "interval":
        return IntervalSchedule.fromJSON(schedule);
      case "daily":
        return DailySchedule.fromJSON(schedule);
      case "weekly":
        return WeeklySchedule.fromJSON(schedule);
      default:
        throw new Error("Monitor schedule type is invalid.");
    }
  }
}

/**
 * Monitor schedule that runs after a fixed interval.
 */
export class IntervalSchedule extends Schedule {
  /**
   * @param {number} hours - Interval in hours
   */
  constructor(hours) {
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error("Monitor interval schedule is invalid.");
    }

    super("interval", { hours });
  }

  /**
   * @param {object} schedule - Serialized interval schedule data.
   * @returns {IntervalSchedule}
   */
  static fromJSON(schedule) {
    return new IntervalSchedule(Number(schedule.hours));
  }

  getNextRunTime(lastRunTime) {
    const now = new Date();
    const lastRun = lastRunTime ? new Date(lastRunTime) : now;
    return new Date(lastRun.getTime() + this.hours * 60 * 60 * 1000);
  }
}

/**
 * Monitor schedule that runs once per day.
 */
export class DailySchedule extends Schedule {
  /**
   * @param {number} hour - Hour of the day (0-23)
   * @param {number} minute - Minute of the hour (0-59)
   */
  constructor(hour, minute) {
    validateClockHour(hour);
    validateClockMinute(minute);

    super("daily", { hour, minute });
  }

  /**
   * @param {object} schedule - Serialized daily schedule data.
   * @returns {DailySchedule}
   */
  static fromJSON(schedule) {
    return new DailySchedule(Number(schedule.hour), Number(schedule.minute));
  }

  getNextRunTime(lastRunTime) {
    const now = new Date();
    const lastRun = lastRunTime ? new Date(lastRunTime) : now;
    const next = new Date(lastRun);
    next.setHours(this.hour, this.minute, 0, 0);
    // Only skip to the next day when today's target time has already passed.
    if (next <= lastRun) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
}

/**
 * Monitor schedule that runs once per week.
 */
export class WeeklySchedule extends Schedule {
  /**
   * @param {number} weekday - Day of the week (0=Sunday, 6=Saturday)
   * @param {number} hour - Hour of the day (0-23)
   * @param {number} minute - Minute of the hour (0-59)
   */
  constructor(weekday, hour, minute) {
    validateWeekday(weekday);
    validateClockHour(hour);
    validateClockMinute(minute);

    super("weekly", { weekday, hour, minute });
  }

  /**
   * @param {object} schedule - Serialized weekly schedule data.
   * @returns {WeeklySchedule}
   */
  static fromJSON(schedule) {
    return new WeeklySchedule(
      Number(schedule.weekday),
      Number(schedule.hour),
      Number(schedule.minute)
    );
  }

  /**
   * @param {string} lastRunTime - ISO string of the last run time
   * @returns {Date} - The next run time as a Date object
   */
  getNextRunTime(lastRunTime) {
    const now = new Date();
    const lastRun = lastRunTime ? new Date(lastRunTime) : now;
    const next = new Date(lastRun);
    next.setHours(this.hour, this.minute, 0, 0);
    let daysAhead = (this.weekday - next.getDay() + 7) % 7;
    // When today is the target weekday, only skip a full week if the target
    // time has already passed.
    if (daysAhead === 0 && next <= lastRun) {
      daysAhead = 7;
    }
    next.setDate(next.getDate() + daysAhead);
    return next;
  }
}

// Helper functions for validating schedule parameters for clock times
function validateClockHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Monitor hour ${hour} is invalid.`);
  }
}

function validateClockMinute(minute) {
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Monitor minute ${minute} is invalid.`);
  }
}

function validateWeekday(weekday) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`Monitor weekday ${weekday} is invalid.`);
  }
}
