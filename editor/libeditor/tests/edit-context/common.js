"use strict";

function stringifyRect(r) {
  return `{left: ${r.left}, top: ${r.top}, width: ${r.width}, height: ${r.height}}`;
}

function isRectApprox(got, expected, message) {
  ok(
    ["left", "top", "width", "height"].every(
      coord => Math.abs(got[coord] - expected[coord]) <= 1
    ),
    `${message}: got ${stringifyRect(got)}, expected approximately ${stringifyRect(expected)}`
  );
}

// QueryTextRect(Array) events return rects relative to the top-level viewport,
// but EditContext rects are relative to the element's document's viewport.
// So we need to add the offset of the frameElement to those for comparison.
function convertToRootRelativeRect(rect) {
  let topOffset = 0;
  let leftOffset = 0;
  for (let win = window; win.frameElement; win = win.parent) {
    topOffset += win.frameElement.offsetTop + win.frameElement.clientTop;
    leftOffset += win.frameElement.offsetLeft + win.frameElement.clientLeft;
  }
  return {
    top: rect.top + topOffset,
    left: rect.left + leftOffset,
    width: rect.width,
    height: rect.height,
  };
}

function checkRect(gotFromContentQuery, expected, message) {
  isRectApprox(
    gotFromContentQuery,
    convertToRootRelativeRect(expected),
    message
  );
}
