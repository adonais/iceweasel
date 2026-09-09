/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_TASKSCHEDULER_RUST_SRC_WINBACKGROUNDTASKREGISTRAR_H_
#define TOOLKIT_COMPONENTS_TASKSCHEDULER_RUST_SRC_WINBACKGROUNDTASKREGISTRAR_H_

#include "ErrorList.h"
#include "nsID.h"

extern "C" {
nsresult taskscheduler_new_win_background_task_registrar(REFNSIID iid,
                                                         void** result);
};

#endif  // TOOLKIT_COMPONENTS_TASKSCHEDULER_RUST_SRC_WINBACKGROUNDTASKREGISTRAR_H_
