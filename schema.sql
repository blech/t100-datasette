-- Generated from build_database.py (create_schema + create_indexes). Regenerate rather than edit by hand.

CREATE TABLE "aircraft_family" (
   [aircraft_type] TEXT PRIMARY KEY, [name] TEXT, [family] TEXT, [subfamily] TEXT, [aircraft_class] TEXT, [fallback] INTEGER
) WITHOUT ROWID;

CREATE TABLE "aircraft_group_band_year" (
   [year] INTEGER, [aircraft_group] TEXT, [distance_band] INTEGER, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [aircraft_group], [distance_band], [domestic], [service_class])
) WITHOUT ROWID;

CREATE TABLE "aircraft_types" (
   [ac_typeid] TEXT, [ac_group] TEXT, [ssd_name] TEXT, [manufacturer] TEXT,
   [name] TEXT, [short_name] TEXT, [begin_date] TEXT
);

CREATE TABLE "airport_names" (
   [code] TEXT PRIMARY KEY, [name] TEXT
) WITHOUT ROWID;

CREATE TABLE "airport_overrides" (
   [code] TEXT PRIMARY KEY, [name] TEXT, [city] TEXT, [country] TEXT,
   [latitude] REAL, [longitude] REAL
);

CREATE TABLE "airport_year_totals" (
   [year] INTEGER, [origin] TEXT, [origin_city_name] TEXT, [origin_wac] INTEGER,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [origin])
) WITHOUT ROWID;

CREATE TABLE "carrier_group" (
   [airline_id] TEXT PRIMARY KEY, [group_id] TEXT, [group_name] TEXT
) WITHOUT ROWID;

CREATE TABLE "carrier_group_year" (
   [year] INTEGER, [group_id] TEXT, [group_name] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [group_id], [domestic], [service_class])
) WITHOUT ROWID;

CREATE TABLE "carrier_route_year" (
   [group_id] TEXT, [year] INTEGER, [origin] TEXT, [dest] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER, [first_month] INTEGER, [last_month] INTEGER,
   PRIMARY KEY ([group_id], [year], [origin], [dest])
) WITHOUT ROWID;

CREATE TABLE "carriers" (
   [airline_id] TEXT, [carrier] TEXT, [carrier_entity] TEXT, [name] TEXT,
   [unique_carrier] TEXT, [unique_carrier_entity] TEXT, [unique_carrier_name] TEXT,
   [wac] TEXT, [carrier_group] TEXT, [carrier_group_new] TEXT, [region] TEXT,
   [start_date_source] TEXT, [thru_date_source] TEXT
);

CREATE TABLE "family_detail_year" (
   [family] TEXT, [year] INTEGER, [subfamily] TEXT, [group_id] TEXT, [group_name] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([family], [year], [subfamily], [group_id], [domestic], [service_class])
) WITHOUT ROWID;

CREATE TABLE "family_year" (
   [year] INTEGER, [family] TEXT, [aircraft_class] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [family], [domestic], [service_class])
) WITHOUT ROWID;

CREATE TABLE "openflights_airports" (
   "id" INTEGER, "name" TEXT, "city" TEXT, "country" TEXT, "iata_code" TEXT,
   "icao_code" TEXT, "latitude" REAL, "longitude" REAL, "altitude" REAL,
   "timezone" TEXT, "dst" TEXT, "tz" TEXT, "type" TEXT, "source" TEXT
);

CREATE TABLE "t100_domestic" (
   [year] INTEGER,
   [month] INTEGER,
   [origin] TEXT,
   [origin_city_market_id] TEXT,
   [origin_wac] INTEGER,
   [origin_city_name] TEXT,
   [dest] TEXT,
   [dest_city_market_id] TEXT,
   [dest_wac] INTEGER,
   [dest_city_name] TEXT,
   [carrier] TEXT REFERENCES [carriers]([carrier]),
   [carrier_entity] TEXT REFERENCES [carriers]([unique_carrier_entity]),
   [carrier_group] TEXT,
   [distance] INTEGER,
   [class] TEXT,
   [aircraft_group] TEXT,
   [aircraft_type] TEXT REFERENCES [aircraft_types]([ac_typeid]),
   [aircraft_config] TEXT,
   [departures_performed] INTEGER,
   [departures_scheduled] INTEGER,
   [payload] INTEGER,
   [seats] INTEGER,
   [passengers] INTEGER,
   [freight] INTEGER,
   [mail] INTEGER,
   [ramp_to_ramp] INTEGER,
   [air_time] INTEGER,
   [wac] INTEGER
);

CREATE TABLE "t100_international" (
   [year] INTEGER,
   [month] INTEGER,
   [origin] TEXT,
   [origin_city_market_id] TEXT,
   [origin_wac] INTEGER,
   [origin_city_name] TEXT,
   [dest] TEXT,
   [dest_city_market_id] TEXT,
   [dest_wac] INTEGER,
   [dest_city_name] TEXT,
   [carrier] TEXT REFERENCES [carriers]([carrier]),
   [carrier_entity] TEXT REFERENCES [carriers]([unique_carrier_entity]),
   [carrier_group] TEXT,
   [distance] INTEGER,
   [class] TEXT,
   [aircraft_group] TEXT,
   [aircraft_type] TEXT REFERENCES [aircraft_types]([ac_typeid]),
   [aircraft_config] TEXT,
   [departures_performed] INTEGER,
   [departures_scheduled] INTEGER,
   [payload] INTEGER,
   [seats] INTEGER,
   [passengers] INTEGER,
   [freight] INTEGER,
   [mail] INTEGER,
   [ramp_to_ramp] INTEGER,
   [air_time] INTEGER,
   [wac] INTEGER
);

CREATE INDEX idx_aircraft_types_ac_typeid ON aircraft_types (ac_typeid);

CREATE INDEX idx_carriers_carrier_entity ON carriers (carrier_entity);

CREATE INDEX idx_openflights_airports_iata ON openflights_airports (iata_code);

CREATE INDEX idx_t100_domestic_origin_date_dest ON t100_domestic (origin, year, month, dest);

CREATE INDEX idx_t100_domestic_origin_dest_year ON t100_domestic (origin, dest, year);

CREATE INDEX idx_t100_domestic_pk_nonunique ON t100_domestic (year, month, origin, dest, carrier_entity, aircraft_type, class);

CREATE INDEX idx_t100_international_origin_date_dest ON t100_international (origin, year, month, dest);

CREATE INDEX idx_t100_international_origin_dest_year ON t100_international (origin, dest, year);

CREATE INDEX idx_t100_international_pk_nonunique ON t100_international (year, month, origin, dest, carrier_entity, aircraft_type, class);

CREATE VIEW t100 AS SELECT 0 AS domestic, year, month, origin, origin_city_market_id, origin_wac, origin_city_name, dest, dest_city_market_id, dest_wac, dest_city_name, carrier, carrier_entity, carrier_group, distance, class, aircraft_group, aircraft_type, aircraft_config, departures_performed, departures_scheduled, payload, seats, passengers, freight, mail, ramp_to_ramp, air_time, wac FROM t100_international UNION ALL SELECT 1, year, month, origin, origin_city_market_id, origin_wac, origin_city_name, dest, dest_city_market_id, dest_wac, dest_city_name, carrier, carrier_entity, carrier_group, distance, class, aircraft_group, aircraft_type, aircraft_config, departures_performed, departures_scheduled, payload, seats, passengers, freight, mail, ramp_to_ramp, air_time, wac FROM t100_domestic;
