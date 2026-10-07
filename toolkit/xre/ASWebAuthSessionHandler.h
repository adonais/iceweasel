/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ASWebAuthSessionHandler_h
#define ASWebAuthSessionHandler_h

void RegisterASWebAuthSessionHandler();
void RegisterASWebAuthSessionObservers();

// True when macOS launched this process to handle an
// ASWebAuthenticationSession request. Only meaningful in the process macOS
// launched, so it must be read before any relaunch.
bool WasLaunchedByAuthenticationServices();

#endif  // ASWebAuthSessionHandler_h
