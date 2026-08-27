/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

export function createSource(name, code) {
  name = name.replace(/\..*$/, "");
  return {
    source: code || `function ${name}() {\n  return ${name} \n}`,
    contentType: "text/javascript",
  };
}

export const mockCommandClient = {
  setBreakpoint: async () => {},
  removeBreakpoint: _id => Promise.resolve(),
  threadFront: async () => {},
  getFrameScopes: async () => {},
  getFrames: async () => [],
  evaluateExpressions: async () => {},
  getSourceActorBreakpointPositions: async () => ({}),
  getSourceActorBreakableLines: async () => [],
};
