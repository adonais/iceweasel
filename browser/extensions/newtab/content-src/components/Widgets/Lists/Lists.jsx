/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

function Lists({ dispatch }) {
  const listsData = useSelector(state => state.ListsWidget);
  const { selected, lists } = listsData;
  const [newTask, setNewTask] = useState("");
  const inputRef = useRef(null);

  function saveTask() {
    const trimmedTask = newTask.trimEnd();
    // only add new task if it has a length, to avoid creating empty tasks
    if (trimmedTask) {
      const taskObject = {
        value: trimmedTask,
        completed: false,
        created: Date.now(),
        id: crypto.randomUUID(),
      };
      const updatedLists = {
        ...lists,
        [selected]: {
          ...lists[selected],
          tasks: [...lists[selected].tasks, taskObject],
        },
      };
      dispatch(
        ac.AlsoToMain({ type: at.WIDGETS_LISTS_UPDATE, data: updatedLists })
      );
      setNewTask("");
    }
  }

  function updateTask(e, selectedTask) {
    const selectedTasks = lists[selected].tasks;
    const updatedTask = { ...selectedTask, completed: e.target.checked };
    // find selected task and update completed property
    const updatedTasks = selectedTasks.map(task =>
      task.id === updatedTask.id ? updatedTask : task
    );
    const updatedLists = {
      ...lists,
      [selected]: {
        ...lists[selected],
        tasks: updatedTasks,
      },
    };
    dispatch(
      ac.AlsoToMain({ type: at.WIDGETS_LISTS_UPDATE, data: updatedLists })
    );
  }

  // useEffect to manage a click outside of the input
  useEffect(() => {
    function handleOutsideClick(e) {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        saveTask();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  });

  function handleKeyDown(e) {
    if (e.key === "Enter" && document.activeElement === inputRef.current) {
      saveTask();
    } else if (
      e.key === "Escape" &&
      document.activeElement === inputRef.current
    ) {
      // Clear out the input when esc is pressed
      setNewTask("");
    }
  }

  return lists ? (
    <article className="lists">
      <moz-select value={selected}>
        {Object.entries(lists).map(([key, list]) => (
          <moz-option key={key} value={key} label={list.label} />
        ))}
      </moz-select>
      <div className="add-task-container">
        <input
          ref={inputRef}
          onChange={e => setNewTask(e.target.value)}
          value={newTask}
          placeholder="Enter task"
          onKeyDown={handleKeyDown}
        />
      </div>
      {lists[selected]?.tasks.length >= 1 ? (
        <moz-reorderable-list itemSelector="fieldset .task-item">
          <fieldset>
            {lists[selected].tasks.map((task, idx) => {
              return (
                <label key={idx} className="task-item">
                  <input
                    type="checkbox"
                    onChange={e => updateTask(e, task)}
                    checked={task.completed}
                  />
                  <span>{task.value}</span>
                </label>
              );
            })}
          </fieldset>
        </moz-reorderable-list>
      ) : (
        <div>
          <p>The list is empty. For now 🦊</p>
        </div>
      )}
    </article>
  ) : null;
}

export { Lists };
