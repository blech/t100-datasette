CREATE TABLE IF NOT EXISTS "carriers" (
   [airline_id] TEXT,
   [carrier] TEXT,
   [carrier_entity] TEXT,
   [name] TEXT,
   [unique_carrier] TEXT,
   [unique_carrier_entity] TEXT,
   [unique_carrier_name] TEXT,
   [wac] TEXT,
   [carrier_group] TEXT,
   [carrier_group_new] TEXT,
   [region] TEXT,
   [start_date_source] TEXT,
   [thru_date_source] TEXT
);
CREATE TABLE IF NOT EXISTS "aircraft_types" (
   [ac_typeid] TEXT,
   [ac_group] TEXT,
   [ssd_name] TEXT,
   [manufacturer] TEXT,
   [name] TEXT,
   [short_name] TEXT,
   [begin_date] DATE
);
CREATE TABLE IF NOT EXISTS "t100" (
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
   [wac] INTEGER,
   [none] TEXT
);
CREATE INDEX idx_t100_pk_nonunique ON t100 (year, month, origin, dest, carrier_entity, aircraft_type, class);
CREATE INDEX idx_t100_origin_date_dest
ON t100 (origin, year, month, dest);
CREATE TABLE [openflights_airports] (
   "id" INTEGER,
   "name" TEXT,
   "city" TEXT,
   "country" TEXT,
   "iata_code" TEXT,
   "icao_code" TEXT,
   "latitude" REAL,
   "longitude" REAL,
   "altitude" REAL,
   "timezone" TEXT,
   "dst" TEXT,
   "tz" TEXT,
   "type" TEXT,
   "source" TEXT
);
CREATE INDEX idx_openflights_airports_iata
ON openflights_airports (iata_code);
