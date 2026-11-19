/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef POST_UPDATE_ENVIRONMENT_H_
#define POST_UPDATE_ENVIRONMENT_H_

#include <windows.h>

#include "elevation_type.h"

/**
 * The environment of the post-update process.
 *
 * To prevent environment variables from affecting how the post-update process
 * and background tasks behave (bug 1903615), it runs with a minimal
 * environment. The run without elevation gets the user's default environment
 * rather than the environment inherited from the updater, so that any processes
 * it starts, such as the push notification helper, have the environment they
 * need to run normally (bug 2078262). In every other case, or if that
 * environment cannot be built, it gets an empty environment.
 */
class PostUpdateEnvironment final {
 public:
  explicit PostUpdateEnvironment(ElevationType aElevationType);
  ~PostUpdateEnvironment();

  // Non-copyable and non-movable
  PostUpdateEnvironment(const PostUpdateEnvironment&) = delete;
  PostUpdateEnvironment(PostUpdateEnvironment&&) = delete;
  PostUpdateEnvironment& operator=(const PostUpdateEnvironment&) = delete;
  PostUpdateEnvironment& operator=(PostUpdateEnvironment&&) = delete;

  LPVOID get() const;

 private:
  LPVOID mEnvironmentBlock;
};

#endif  // POST_UPDATE_ENVIRONMENT_H_
