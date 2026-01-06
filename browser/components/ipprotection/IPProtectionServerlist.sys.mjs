/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains functions that work on top of the RemoteSettings
 * Bucket for the IP Protection server list.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPStartupCache: "resource:///modules/ipprotection/IPPStartupCache.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
});

/**
 *
 */
export class IProtocol {
  name = "";
  static construct(data) {
    switch (data.name) {
      case "masque":
        return new MasqueProtocol(data);
      case "connect":
        return new ConnectProtocol(data);
      default:
        throw new Error("Unknown protocol: " + data.name);
    }
  }
}

/**
 *
 */
export class MasqueProtocol extends IProtocol {
  name = "masque";
  host = "";
  port = 0;
  templateString = "";
  constructor(data) {
    super();
    this.host = data.host || "";
    this.port = data.port || 0;
    this.templateString = data.templateString || "";
  }
}

/**
 *
 */
export class ConnectProtocol extends IProtocol {
  name = "connect";
  host = "";
  port = 0;
  scheme = "https";
  constructor(data) {
    super();
    this.host = data.host || "";
    this.port = data.port || 0;
    this.scheme = data.scheme || "https";
  }
}

/**
 * Class representing a server.
 */
export class Server {
  /**
   * Port of the server
   *
   * @type {number}
   */
  port = 443;
  /**
   * Hostname of the server
   *
   * @type {string}
   */
  hostname = "";
  /**
   * If true the server is quarantined
   * and should not be used
   *
   * @type {boolean}
   */
  quarantined = false;

  /**
   * List of supported protocols
   *
   * @type {Array<MasqueProtocol|ConnectProtocol>}
   */
  protocols = [];

  constructor(data) {
    this.port = data.port || 443;
    this.hostname = data.hostname || "";
    this.quarantined = !!data.quarantined;
    this.protocols = (data.protocols || []).map(p => IProtocol.construct(p));

    // Default to connect if no protocols are specified
    if (this.protocols.length === 0) {
      this.protocols = [
        new ConnectProtocol({
          name: "connect",
          host: this.hostname,
          port: this.port,
        }),
      ];
    }
  }
}

/**
 * Class representing a city.
 */
class City {
  /**
   * Fallback name for the city if not available
   *
   * @type {string}
   */
  name = "";
  /**
   * A stable identifier for the city
   * (Usually a Wikidata ID)
   *
   * @type {string}
   */
  code = "";
  /**
   * List of servers in this city
   *
   * @type {Server[]}
   */
  servers = [];

  constructor(data) {
    this.name = data.name || "";
    this.code = data.code || "";
    this.servers = (data.servers || []).map(s => new Server(s));
  }
}

/**
 * Class representing a country.
 */
class Country {
  /**
   * Fallback name for the country if not available
   *
   * @type {string}
   */
  name;
  /**
   * A stable identifier for the country
   * Usually a ISO 3166-1 alpha-2 code
   *
   * @type {string}
   */
  code;

  /**
   * List of cities in this country
   *
   * @type {City[]}
   */
  cities;

  constructor(data) {
    this.name = data.name || "";
    this.code = data.code || "";
    this.cities = (data.cities || []).map(c => new City(c));
  }
}

/**
 *
 */
class IPProtectionServerlistSingleton {
  #list = null;
  #runningPromise = null;
  #bucket = null;

  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);
    this.#list = IPProtectionServerlistSingleton.#dataToList(
      lazy.IPPStartupCache.locationList
    );
  }

  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  async initOnStartupCompleted() {
    this.bucket.on("sync", async () => {
      await this.maybeFetchList(true);
    });
  }

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  #handleEvent(_event) {
    if (lazy.IPProtectionService.state === lazy.IPProtectionStates.READY) {
      this.maybeFetchList();
    }
  }

  maybeFetchList(forceUpdate = false) {
    if (this.#list.length !== 0 && !forceUpdate) {
      return Promise.resolve();
    }

    if (this.#runningPromise) {
      return this.#runningPromise;
    }

    const fetchList = async () => {
      this.#list = IPProtectionServerlistSingleton.#dataToList(
        await this.bucket.get()
      );

      lazy.IPPStartupCache.storeLocationList(this.#list);
    };

    this.#runningPromise = fetchList().finally(
      () => (this.#runningPromise = null)
    );

    return this.#runningPromise;
  }

  /**
   * Selects a default location - for alpha this is only the US.
   *
   * @returns {{Country, City}} - The best country/city to use.
   */
  getDefaultLocation() {
    /** @type {Country} */
    const usa = this.#list.find(country => country.code === "US");
    if (!usa) {
      return null;
    }

    const city = usa.cities.find(c => c.servers.length);
    return {
      city,
      country: usa,
    };
  }

  /**
   * Given a city, it selects an available server.
   *
   * @param {City?} city
   * @returns {Server|null}
   */
  selectServer(city) {
    if (!city) {
      return null;
    }

    const servers = city.servers.filter(server => !server.quarantined);
    if (servers.length === 1) {
      return servers[0];
    }

    if (servers.length > 1) {
      return servers[Math.floor(Math.random() * servers.length)];
    }

    return null;
  }

  get hasList() {
    return this.#list.length !== 0;
  }

  get bucket() {
    if (!this.#bucket) {
      this.#bucket = lazy.RemoteSettings("vpn-serverlist");
    }
    return this.#bucket;
  }

  static #dataToList(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list.map(c => new Country(c));
  }
}

const IPProtectionServerlist = new IPProtectionServerlistSingleton();

export { IPProtectionServerlist };
