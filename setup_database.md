```sh
sqlite-utils insert t100.db openflights_airports airports.txt --csv
```

```sh
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.1990.2000.asc --delimiter "|"
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2001.2010.asc --delimiter "|"
sqlite-utils insert t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2011.2020.asc --delimiter "|"
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/IQ/ardisdata/t100/products/db28/bulkdownload/db28seg.fd.wac.2021.2022.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202301.202312.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202401.202412.asc
sqlite-utils insert --delimiter "|" t100.db t100 source_downloads/years/db28seg.fd.wac.202501.202512.asc
```

```sh
sqlite-utils insert t100.db carriers T_CARRIER_DECODE.csv --csv
sqlite-utils insert t100.db aircraft_types T_AIRCRAFT_TYPES_lower.csv --csv
```
