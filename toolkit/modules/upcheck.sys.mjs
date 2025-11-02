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
            QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
            observe: (aSubject, aTopic) => {
              if (arr[length-1] != null && typeof arr[length-1] === "function") {
                (arr[length-1])(process.exitValue);
              }
            }
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

  static runSelf(arr) {
    try {
      if (AppConstants.platform === "win") {
        let binary = Services.dirsvc.get("GreBinD", Ci.nsIFile);
        let length = arr.length;
        binary.append("upcheck.exe");
        if (binary.exists() && length > 1) {
          let arg = [];
          let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
          let selfObserver = {
            observe: (aSubject, aTopic) => {
              if (arr[length-2] != null) {
                if (typeof arr[length-2] === "function") {
                    (arr[length-2])(process.exitValue, arr[length-1]);
                }
              }
            }
          };
          for (let i = 0; i < arr.length - 2; ++i) {
            arg.push(arr[i]);
          }
          process.init(binary);
          process.startHidden = true;
          process.noShell = true;
          process.runwAsync(arg, arg.length, selfObserver);
        }
      }
    } catch (e) {
      console.log("upcheck.runSelf failed");
    }
  }

  static getCookies(link, mozilla = false, callbackfilter) {
    try {
      if (!link) {
        return "";
      }
      if (!/^https?:\/\//.test(link)) {
        return "";  
      }
      const uri = Services.io.newURI(link, null, null);
      let cookies = Services.cookies.getCookiesFromHost(uri.host, {});
      if (callbackfilter && typeof callbackfilter === "function") cookies = cookies.filter(callbackfilter);
      const cookieString = mozilla ? cookies.map(formatCookie).join('') : cookies.map(cookie => `${cookie.name}:${cookie.value}`).join("; ");
      const cookieSavePath = Services.dirsvc.get("TmpD", Ci.nsIFile);
      cookieSavePath.append(generateRandomBytes(mozilla ? ".tmp" : ".bin"));
      return saveCookie(cookieSavePath.path, cookieString);
    } catch (e) {
      console.log("upcheck.gatherCookies failed");
      return "";
    }

    function saveCookie (path, pcookie) {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      const foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      // readwrite, create, truncate
      foStream.init(file, 0x04 | 0x08 | 0x20, 0o666, 0);
      foStream.write(pcookie, pcookie.length);
      if (foStream instanceof Ci.nsISafeOutputStream) {
        foStream.finish();
      } else {
        foStream.close();
      }
      return file.path;
    }

    function formatCookie(co) {
      // Format to Netscape type cookie format
      return [
        co.host,
        co.isDomain ? 'TRUE' : 'FALSE',
        co.path,
        co.isSecure ? 'TRUE' : 'FALSE',
        co.expires > 0 ? getFirstDigitsMath(co.expires, 10) : "0",
        co.name,
        co.value
      ].join('\t') + '\n';
    }

    function getFirstDigitsMath(num, digits) {
      let divisor = Math.pow(10, Math.floor(Math.log10(num)) + 1 - digits);
      return Math.floor(num / divisor);
    }

    function generateRandomBytes(ext) {
      const buffer = new Uint32Array(2);
      crypto.getRandomValues(buffer);
      return String(buffer[0]) + String(buffer[1]) + String(ext);
    }
  }

  static download_caller(id, url, refer, filename, save) {
    try {
      const ctypes = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs").ctypes;
      const bits = ctypes ? ctypes.voidptr_t.size : 0;
      const lib = bits ? ctypes.open(bits == 8 ? "portable64.dll" : "portable32.dll") : null;
      const downloader = lib ? lib.declare('ctype_download_caller', ctypes.default_abi, ctypes.int
                         , ctypes.int, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr, ctypes.char.ptr)
                         : null;
      if (downloader) {
        const path = upcheck.getCookies(url, true);
        const buffer = upcheck.getCookies(url, false);
        const pfile = filename ? filename.toString() : null;
        const psave = save ? save.toString() : null;
        const prefer = refer ? refer.toString() : null;
        return downloader(id, url.toString(), pfile, psave, prefer, path.toString(), buffer.toString());
      }
    } catch (e) {
      console.log("upcheck.download_caller failed\n");
    }
  }

  static readini_portable(section, key) {
    try {
      let value = null;
      let target = Services.dirsvc.get("GreBinD", Ci.nsIFile);
      target.append("portable.ini");
      if (target.exists()) {
        let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory);
        let ini = factory.createINIParser(target);
        if (ini != null) {
          value = ini.getString(section, key);
        }
      }
      return value;
    } catch (e) {
      console.log("upcheck.readini_portable failed\n");
    }
  }

}
