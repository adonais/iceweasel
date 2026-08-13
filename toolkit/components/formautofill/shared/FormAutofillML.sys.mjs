/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createEngine,
  FEATURES,
} from "chrome://global/content/ml/EngineProcess.sys.mjs";

import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";

const FORM_AUTOFILL_FEATURE_ID = "formfill-classification";
const ML_TASKNAME = "text-classification";

const FormFill_Config = {
  timeoutMS: 2 * 60 * 1000, // 2 minutes
  taskName: ML_TASKNAME,
  featureId: FORM_AUTOFILL_FEATURE_ID,
  engineId: FEATURES[FORM_AUTOFILL_FEATURE_ID].engineId,
  backend: "best-onnx",
  modelId: "mozilla/tinybert-address-autofill",
  numThreads: 2,
};

export class FormAutofillML {
  #engine;

  async detectFields(fieldDetails) {
    if (!this.#engine || this.#engine.engineStatus == "closed") {
      try {
        let initEnginePromise = createEngine(FormFill_Config);

        // If the ML engine has never been used before, it likely hasn't been
        // downloaded, so initialize but don't try to get the result.
        if (!FormAutofillUtils.isMLUsedAlready) {
          initEnginePromise
            .then(engine => {
              this.#engine = engine;
              FormAutofillUtils.setMLUsedAlready();
            })
            .catch(() => {});
          return;
        }
        this.#engine = await initEnginePromise;
      } catch (ex) {
        return;
      }
    }

    // Create a list of fields that have tokens and don't already have
    // a field name assigned and set that as fdList. The inputData array
    // will contain a list of the tokens, one for each field to identify.
    let fdList = [],
      inputData = [];
    fieldDetails.map(fd => {
      if (!fd.fieldName && fd.mlData) {
        fdList.push(fd);
        inputData.push(fd.mlData);
      }
    });

    if (!inputData.length) {
      return; // No fields to identify.
    }

    const request = {
      args: [inputData],
      options: { pooling: "mean", normalize: true },
    };

    let result = await this.#engine.run(request);

    for (let r = 0; r < result.length; r++) {
      let fd = fdList[r];

      let fieldName = result[r].label;
      if (fieldName && fieldName != "other") {
        fd.fieldName = fieldName;
      }

      fd.reason = "ml";
    }
  }
}
