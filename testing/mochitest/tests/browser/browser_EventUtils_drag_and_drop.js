/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function test_cancelled_drag() {
  const source = document.createElement("div");
  source.textContent = "Drag source";
  source.draggable = true;
  document.documentElement.appendChild(source);
  registerCleanupFunction(() => source.remove());

  let dragStarts = 0;
  let clicks = 0;
  source.addEventListener("dragstart", event => {
    event.preventDefault();
    dragStarts++;
  });
  source.addEventListener("click", () => clicks++);

  await EventUtils.synthesizePlainDragAndDrop({
    srcElement: source,
    stepX: 9,
    stepY: 0,
    expectCancelDragStart: true,
  });

  is(dragStarts, 1, "The drag was cancelled at dragstart");
  is(clicks, 1, "Cancelling the drag generated a click");
});
