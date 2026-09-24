/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getExternalComponentInfo } from "../general/get-component-info.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const shouldSkipToken = ({
  overrideIdentifier,
  componentName,
  token,
}) => {
  if (
    !overrideIdentifier &&
    OVERRIDE_IDENTIFIERS.some(
      ({ id }) =>
        token.path.some(segment => segment.includes(id)) || token.override
    )
  ) {
    return true;
  }

  if (
    overrideIdentifier &&
    !(
      token.path.some(segment => segment.includes(overrideIdentifier)) ||
      token.original.value[overrideIdentifier] != null
    )
  ) {
    return true;
  }

  if (componentName === "box" && token.name.startsWith("box-shadow")) {
    return true;
  }

  if (!componentName && token.name.startsWith("box-shadow")) {
    return false;
  }

  if (
    componentName &&
    !(
      token.name.startsWith(`${componentName}-`) || token.name === componentName
    )
  ) {
    return true;
  }

  if (
    !componentName &&
    getExternalComponentInfo().some(
      ({ componentName: externalComponentName }) => {
        return (
          token.name.startsWith(`${externalComponentName}-`) ||
          token.name === externalComponentName
        );
      }
    )
  ) {
    return true;
  }

  return false;
};
