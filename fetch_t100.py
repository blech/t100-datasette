import os
import zipfile
import io
import httpx
import sqlite_utils
from datetime import datetime, timedelta

DB_PATH = "t100.db"
BASE_URL = "https://www.bts.gov/sites/bts.dot.gov/files/docs/airline-data/international-segments/"
DOWNLOAD_DIR = "source_downloads/incoming"

def download_file(url, target_path):
    print(f"Downloading {url}...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    with httpx.Client(follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        if response.status_code == 200:
            with open(target_path, "wb") as f:
                f.write(response.content)
            return True
        else:
            print(f"Failed to download {url}: {response.status_code}")
            return False

def ingest_zip(zip_path):
    db = sqlite_utils.Database(DB_PATH)
    
    # Mapping from .asc header to database column names
    COLUMN_MAP = {
        "Carrier": "carrier",
        "Carrier_Entity": "carrier_entity",
        "Svc_Class": "class",
        "Aircraft_type": "aircraft_type",
        # Some are already correct or capitalized in DB
        "Aircraft_Group": "Aircraft_Group",
        "Aircraft_Config": "Aircraft_Config",
        "Wac": "Wac"
    }
    
    # Identify numeric columns for conversion
    NUMERIC_COLUMNS = {
        "year", "month", "departures_performed", "departures_scheduled", 
        "payload", "seats", "passengers", "freight", "mail", 
        "ramp_to_ramp", "air_time"
    }

    with zipfile.ZipFile(zip_path, "r") as z:
        for filename in z.namelist():
            if filename.endswith(".asc"):
                print(f"Ingesting {filename} from {zip_path}...")
                with z.open(filename) as f:
                    content = f.read().decode("utf-8")
                    import csv
                    reader = csv.DictReader(io.StringIO(content), delimiter="|")
                    
                    def rows():
                        count = 0
                        for row in reader:
                            new_row = {}
                            for k, v in row.items():
                                if k == "" or k is None:
                                    continue
                                
                                # Map column name if needed
                                db_col = COLUMN_MAP.get(k, k)
                                
                                # Convert to numeric if appropriate
                                if db_col in NUMERIC_COLUMNS and v:
                                    try:
                                        v = int(float(v))
                                    except ValueError:
                                        pass
                                
                                new_row[db_col] = v
                            
                            count += 1
                            if count % 10000 == 0:
                                print(f"  Processed {count} rows...")
                            yield new_row

                    db["t100"].upsert_all(
                        rows(),
                        pk=("year", "month", "origin", "dest", "carrier_entity", "aircraft_type", "class"),
                        alter=True,
                        batch_size=5000
                    )
                print(f"Finished ingesting {filename}")

def get_monthly_url(year, month):
    # Try common patterns for monthly files
    # Example: DB28SEG.FD.WAC.202108.202207.REL01.04JAN2023.zip
    # However, the user also gave a simpler pattern for the yearly bundle:
    # https://www.bts.gov/sites/bts.dot.gov/files/docs/airline-data/international-segments/db28seg.fd.wac.2021.2022.zip
    
    # Let's try to find the 2021-2022 bundle first as requested
    if year == 2021 and month == 2022:
        return f"{BASE_URL}db28seg.fd.wac.2021.2022.zip", "db28seg.fd.wac.2021.2022.zip"
    
    # For actual monthly records, we might need to be more creative if they don't follow a simple pattern.
    # The user said: "subsequent monthly records"
    # BTS often publishes monthly data with a delay.
    return None, None

import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description="Fetch and ingest T-100 data.")
    parser.add_argument("--url", help="URL of the ZIP bundle to download and ingest")
    parser.add_argument("--file", help="Path to a local ZIP bundle to ingest")
    args = parser.parse_args()

    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)

    if args.url:
        filename = args.url.split("/")[-1]
        target_path = os.path.join(DOWNLOAD_DIR, filename)
        if not os.path.exists(target_path):
            if download_file(args.url, target_path):
                ingest_zip(target_path)
        else:
            print(f"File already exists: {target_path}")
            ingest_zip(target_path)
    elif args.file:
        ingest_zip(args.file)
    else:
        # Default behavior: try the 2021-2022 bundle
        yearly_url = f"{BASE_URL}db28seg.fd.wac.2021.2022.zip"
        yearly_path = os.path.join(DOWNLOAD_DIR, "db28seg.fd.wac.2021.2022.zip")
        
        if not os.path.exists(yearly_path):
            print("No URL or file provided, and default 2021-2022 bundle not found.")
            print("Usage: python fetch_t100.py --url <URL> or --file <PATH>")
        else:
            print(f"Ingesting existing default bundle: {yearly_path}")
            ingest_zip(yearly_path)

if __name__ == "__main__":
    main()
