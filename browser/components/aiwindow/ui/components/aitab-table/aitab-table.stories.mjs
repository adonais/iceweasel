/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-table.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AITab Table",
  component: "aitab-table",
  argTypes: {
    heading: { control: "text" },
    description: { control: "text" },
    columns: { control: "object" },
    rows: { control: "object" },
  },
  parameters: {
    fluent: `
ai-tab-table-rating = { $value } / { $max }
    `,
  },
};

const Template = ({ heading, description, columns, rows }) => html`
  <aitab-table
    .heading=${heading}
    .description=${description}
    .columns=${columns}
    .rows=${rows}
  ></aitab-table>
`;

const STAY_COLUMNS = [
  { key: "name", label: "Name", type: "text", role: "title" },
  {
    key: "price",
    label: "Price",
    type: "currency",
    currency: "USD",
    suffix: " / night",
  },
  { key: "rating", label: "Rating", type: "rating", max: 5 },
  { key: "reviews", label: "Reviews", type: "number" },
];

const STAY_ROWS = [
  {
    name: "Nijima Escape",
    price: 109,
    rating: 3.9,
    reviews: 520,
    href: "https://www.booking.com/hotel/jp/nijima-escape.html",
  },
  {
    name: "Yado Marubun",
    price: 215,
    rating: 4.9,
    reviews: 3124,
    href: "https://www.tripadvisor.com/Hotel_Review-yado-marubun",
  },
  {
    name: "Kegetsutei Ryokan",
    price: 225,
    rating: 4.5,
    reviews: 1441,
    href: "https://www.japanican.com/en/hotel/detail/kegetsutei",
  },
  {
    name: "Hotel Kanazawa Korinbo Annex",
    price: 168,
    rating: 4.2,
    reviews: 886,
    href: "https://www.hotels.com/ho/kanazawa-korinbo-annex",
  },
  {
    name: "Higashiyama Machiya (whole house)",
    price: 142,
    rating: 4.8,
    reviews: 97,
    href: "https://www.airbnb.com/rooms/higashiyama-machiya",
  },
];

export const WhereToStay = Template.bind({});
WhereToStay.args = {
  heading: "Where to stay",
  description: "Five options gathered from your open tabs",
  columns: STAY_COLUMNS,
  rows: STAY_ROWS,
};

export const WithSubtitle = Template.bind({});
WithSubtitle.args = {
  heading: "Where to stay",
  description: "Neighbourhood shown under each name",
  columns: [
    STAY_COLUMNS[0],
    { key: "area", type: "text", role: "subtitle" },
    ...STAY_COLUMNS.slice(1),
  ],
  rows: STAY_ROWS.map((row, index) => ({
    ...row,
    area: ["Higashiyama", "Nagamachi", "Kenrokuen", "Korinbo", "Higashiyama"][
      index
    ],
  })),
};

export const TwoColumns = Template.bind({});
TwoColumns.args = {
  heading: "Installer quotes",
  columns: [
    { key: "name", label: "Installer", type: "text", role: "title" },
    { key: "price", label: "Quote", type: "currency" },
  ],
  rows: [
    { name: "Bright Build", price: 31200, href: "https://brightbuild.example" },
    { name: "Sunward Solar", price: 28950 },
    { name: "Northfield Energy", price: 33475.5 },
  ],
};

export const SixColumns = Template.bind({});
SixColumns.args = {
  heading: "Laptops under $1,500",
  description: "Six attributes stretch the layout to its widest",
  columns: [
    { key: "name", label: "Model", type: "text", role: "title" },
    { key: "price", label: "Price", type: "currency" },
    { key: "weight", label: "Weight", type: "number", suffix: " kg" },
    { key: "battery", label: "Battery", type: "number", suffix: " h" },
    { key: "rating", label: "Rating", type: "rating", max: 10 },
    { key: "released", label: "Released", type: "date" },
  ],
  rows: [
    {
      name: "Framework Laptop 13",
      price: 1049,
      weight: 1.3,
      battery: 11,
      rating: 8.5,
      released: "2025-08-12",
      href: "https://frame.work/products/laptop13",
    },
    {
      name: "ThinkPad X1 Carbon Gen 13",
      price: 1449,
      weight: 0.99,
      battery: 14,
      rating: 9.1,
      released: "2025-03-04",
      href: "https://www.lenovo.com/thinkpad-x1-carbon",
    },
  ],
};

export const LongText = Template.bind({});
LongText.args = {
  heading: "Long values wrap inside their column",
  columns: [
    { key: "name", label: "Name", type: "text", role: "title" },
    { key: "notes", label: "Notes", type: "text" },
    { key: "price", label: "Price", type: "currency" },
  ],
  rows: [
    {
      name: "The Grand Continental Riverside Hotel and Conference Centre at Harbourfront Quay",
      notes:
        "Breakfast included, late checkout on request, free cancellation up to 48 hours before arrival, pets allowed on the ground floor only.",
      price: 289,
      href: "https://www.example.com/grand-continental",
    },
    {
      name: "Pod",
      notes:
        "Supercalifragilisticexpialidocious-unbrokenwordthatmustwrapsomewhere",
      price: 45,
    },
  ],
};
