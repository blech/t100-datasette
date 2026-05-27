# Setting Up t100.db

## Database Initialisation

Use the provided schema.sql to initialize an empty SQLite database

```sh
sqlite3 t100.db < schema.sql
```

Next, fetch the source data from the Bureau of Transportation Statistics pages. If you want lots of data quickly, the three bottom links are for decadal data - [https://www.bts.gov/sites/bts.dot.gov/files/docs/airline-data/international-segments/db28seg.fd.wac.1990.2000.zip](1990-2000), 2001-2010, and 2911-2020. Note that unzipping these will generate a nest of folders with the data right at the bottom.

Alternatively, if you want recent data, download the January - December data for the years 2025, 2024, and 2023.

Something that caught me out- the data is provided monthly, but contains the entire previous year. In other words, only one file per year is needed.

In order to use the saved queries as defined here, the header rows will need to be modified (for the multi-year files) or added (for the monthly releases).

```sh
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.1990.2000.asc --delimiter "|"
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2001.2010.asc --delimiter "|"
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2011.2020.asc --delimiter "|"
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2021.2022.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202301.202312.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202401.202412.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202501.202512.asc
```

Two further tables are populated from the [https://www.transtats.bts.gov/Tables.asp?QO_VQ=IMI&QO_anzr=N8vn6v10%FDf722146%FDgnoyr5&QO_fu146_anzr=N8vn6v10%FDf722146%FDgnoyr5](Aviation Support Tables) - AircraftTypes and Carrier Decode. Again, the headers should be modified- to all lower case generally, and to rename `CARRIER_NAME` to `name` for T_CARRIER_DECODE.csv and `LONG_NAME` to `name` for T_AIRCRAFT_TYPES.csv (although maybe `SSD_NAME` would be better?)

```sh
sqlite-utils insert t100.db carriers source_downloads/T_CARRIER_DECODE.csv --csv
sqlite-utils insert t100.db aircraft_types source_downloads/T_AIRCRAFT_TYPES.csv --csv
```

Finally, I used the [OpenFlights airport data](https://openflights.org/data.php) to get geographic data on airports. (I've just realised that there's also airport data in the Aviation Support Tables; I might change to using that later, but for now, this is working fine.) Once again, the headers will need to be added.

```sh
sqlite-utils insert t100.db openflights_airports airports.txt --csv
```
