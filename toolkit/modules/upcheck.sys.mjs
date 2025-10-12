import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

export class upcheck {

  static run(arr) {
    try {
      if (AppConstants.platform === "win") {
        const upck = "upcheck.exe";
        let exe = Services.dirsvc.get("GreBinD", Ci.nsIFile);
        let cfile = Services.dirsvc.get("UChrm", Ci.nsIFile);
        exe.append(upck);
        if (exe.exists()) {
          let process = Cc["@mozilla.org/process/util;1"]
                         .createInstance(Ci.nsIProcess);
          let arg = ["-lua"];
          arg.push(Services.appinfo.processID);
          arg.push(encodeURIComponent(cfile.path));
          for (let i = 0; i < arr.length; ++i) {
            if (arr[i] != null) {
              arg.push(encodeURIComponent(arr[i]));
            }
          }
          process.init(exe);
          process.startHidden = true;
          process.noShell = true;
          process.run(false, arg, arg.length);
        }
      }
    } catch (e) {
      console.log("upcheck.run failed");
    }
  }

  static runAsync(arr) {
    try {
      if (AppConstants.platform === "win") {
        const upck = "upcheck.exe";
        let exe = Services.dirsvc.get("GreBinD", Ci.nsIFile);
        let cfile = Services.dirsvc.get("UChrm", Ci.nsIFile);
        let length = arr.length;
        exe.append(upck);
        if (exe.exists() && length > 0) {
          let process = Cc["@mozilla.org/process/util;1"]
                         .createInstance(Ci.nsIProcess);
          let upcheckObserver = {
            observe: function myobserve(aSubject, aTopic) {
              if (arr[length-1] != null && typeof arr[length-1] === "function") {
                (arr[length-1])(process.exitValue);
              }
            },
            QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
          };
          let arg = ["-lua"];
          arg.push(Services.appinfo.processID);
          arg.push(encodeURIComponent(cfile.path));
          for (let i = 0; i < arr.length - 1; ++i) {
            arg.push(encodeURIComponent(arr[i]));
          }
          process.init(exe);
          process.startHidden = true;
          process.noShell = true;
          process.runAsync(arg, arg.length, upcheckObserver);
        }
      }
    } catch (e) {
      console.log("upcheck.runAsync failed");
    }
  }

}
