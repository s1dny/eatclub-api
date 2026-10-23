import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Client, createClient } from "@libsql/client";

export const DB_PATH = resolve(process.env.EATCLUB_DB ?? new URL("../../data/eatclub.db", import.meta.url).pathname);

export function open(path = DB_PATH): Client {
  mkdirSync(dirname(path), { recursive: true });
  return createClient({ url: `file:${path}` });
}

/** Keep in sync with the schema section of skills/eatclub/references/api.md. */
export const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE regions (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL,
  timezone TEXT NOT NULL, venue_count INTEGER
);

CREATE TABLE venues (
  slug TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL REFERENCES regions(slug),
  description TEXT, bio TEXT,
  address TEXT, suburb TEXT, state TEXT, postcode TEXT,
  latitude REAL NOT NULL, longitude REAL NOT NULL,
  timezone TEXT NOT NULL,
  phone TEXT, website TEXT,
  rating REAL, food_rating REAL, atmosphere_rating REAL, num_ratings INTEGER,
  max_discount_pct INTEGER,
  dining_type TEXT, cost TEXT,
  venue_types TEXT, occasions TEXT, food_labels TEXT, tags TEXT,
  offers_dine_in INTEGER, offers_takeaway INTEGER, offers_delivery INTEGER,
  sells_out_early INTEGER, cover_charge INTEGER, is_new INTEGER, excluded_item_count INTEGER,
  image TEXT, other_images TEXT,
  url TEXT NOT NULL, app_link TEXT, pdf_menu TEXT,
  has_detail INTEGER NOT NULL DEFAULT 0,
  web_json TEXT, app_json TEXT
);
CREATE INDEX venues_geo ON venues(latitude, longitude);

CREATE TABLE venue_cuisines (slug TEXT NOT NULL REFERENCES venues(slug), cuisine TEXT NOT NULL, PRIMARY KEY (slug, cuisine));
CREATE INDEX venue_cuisines_cuisine ON venue_cuisines(cuisine);

CREATE TABLE hours (
  slug TEXT NOT NULL REFERENCES venues(slug), day INTEGER NOT NULL,
  open_min INTEGER NOT NULL, close_min INTEGER NOT NULL, kitchen_close_min INTEGER
);
CREATE INDEX hours_slug ON hours(slug, day);

CREATE TABLE deals (
  deal_id TEXT NOT NULL,
  slug TEXT NOT NULL REFERENCES venues(slug),
  day INTEGER NOT NULL,
  start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  all_day INTEGER NOT NULL,
  discount TEXT NOT NULL, discount_pct INTEGER,
  type TEXT NOT NULL,
  is_stunt INTEGER NOT NULL
);
CREATE INDEX deals_slug ON deals(slug, day);
CREATE INDEX deals_day ON deals(day, start_min, end_min);
CREATE INDEX deals_id ON deals(deal_id);

CREATE TABLE live_deals (
  deal_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL REFERENCES venues(slug),
  date TEXT NOT NULL,
  discount TEXT, start_min INTEGER, end_min INTEGER,
  qty_left INTEGER, qty_total INTEGER,
  max_party_size INTEGER,
  subheading TEXT, terms TEXT, drinks_only_terms TEXT, important_info TEXT,
  new_customers_only INTEGER, lightning INTEGER, dine_in_only INTEGER, takeaway_only INTEGER, sells_out_early INTEGER,
  last_booked_at TEXT,
  fetched_at TEXT NOT NULL,
  raw TEXT NOT NULL
);
CREATE INDEX live_deals_slug ON live_deals(slug);

CREATE TABLE discount_exclusions (
  slug TEXT NOT NULL REFERENCES venues(slug), date TEXT NOT NULL,
  category TEXT, description TEXT, applicable_days TEXT, items TEXT,
  raw TEXT NOT NULL
);
CREATE INDEX discount_exclusions_slug ON discount_exclusions(slug);

CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL REFERENCES venues(slug),
  menu_type TEXT NOT NULL,
  menu_title TEXT,
  menu_start_min INTEGER, menu_end_min INTEGER,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price REAL,
  no_discount INTEGER NOT NULL,
  popularity REAL,
  image TEXT,
  options TEXT
);
CREATE INDEX menu_items_slug ON menu_items(slug);
CREATE VIRTUAL TABLE menu_fts USING fts5(title, description, category, content='menu_items', content_rowid='id', tokenize='porter unicode61');

CREATE TABLE reviews (
  slug TEXT NOT NULL REFERENCES venues(slug),
  date TEXT, stars INTEGER, message TEXT, reviewer TEXT, deal_used TEXT
);
CREATE INDEX reviews_slug ON reviews(slug);

CREATE TABLE walk_times (slug TEXT PRIMARY KEY REFERENCES venues(slug), minutes REAL NOT NULL, meters REAL NOT NULL);
`;
