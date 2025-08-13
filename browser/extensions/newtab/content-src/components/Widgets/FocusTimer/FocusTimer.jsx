/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useState, useEffect, useRef } from "react";

function FocusTimer() {
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let interval;
    if (isRunning && timer > 0) {
      interval = setInterval(() => {
        setTimer(previousValue => {
          if (previousValue <= 1) {
            clearInterval(interval);
            setIsRunning(false);
            return 0;
          }
          return previousValue - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timer]);

  // set timer function
  const setTimerMinutes = e => {
    e.preventDefault();
    const minutes = inputRef.current.value;
    const minutesInt = parseInt(minutes, 10);

    if (minutesInt > 0) {
      setTimer(minutesInt * 60); // change set minutes to seconds
    }
  };

  // Pause timer function
  const toggleTimer = () => {
    if (timer > 0) {
      setIsRunning(previousValue => !previousValue); // using an updater function for an accurate state update
    }
  };

  // reset timer function
  const resetTimer = () => {
    setIsRunning(false);
    setTimer(0);
  };

  const formatTime = seconds => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  };

  return (
    <article className="focus-timer-wrapper">
      <p>Focus timer widget</p>
      <form onSubmit={setTimerMinutes}>
        <label htmlFor="countdown"></label>
        <input type="number" id="countdown" ref={inputRef} />
        <button type="submit">Set minutes</button>
      </form>
      <div className="timer-buttons">
        <button onClick={toggleTimer}>{isRunning ? "Pause" : "Play"}</button>
        <button onClick={resetTimer}>Reset</button>
      </div>
      Time left: {formatTime(timer)}
    </article>
  );
}

export { FocusTimer };
