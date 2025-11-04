/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RemoteSettings } from "resource://services-settings/remote-settings.sys.mjs";

/**
 * This file contains functions that work on top of the RemoteSettings
 * Bucket for the IP Protection server list.
 */

/**
 * Selects a default location - for alpha this is only the US.
 *
 * @param {RemoteSettingsClient} bucket - The RemoteSettings bucket to use
 * @returns {{Country, City}} - The best country/city to use.
 */
export async function getDefaultLocation(
  bucket = RemoteSettings("vpn-serverlist")
) {
  const list = await bucket.get();
  /** @type {Country} */
  const usa = list.find(country => country.code === "US");
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
export async function selectServer(city) {
  if (!city) {
    return null;
  }
  const servers = city.servers.filter(server => !server.quarantined);
  if (servers.length === 1) {
    return servers[0];
  } else if (servers.length > 1) {
    return servers[Math.floor(Math.random() * servers.length)];
  }
  return null;
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
}

/**
 * Class representing a city.
 */
export class City {
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
}

/**
 * Class representing a country.
 */
export class Country {
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
}
