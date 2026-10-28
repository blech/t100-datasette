import html
import sqlite3

from build_database import rebuild_carrier_group_year, rebuild_carrier_groups
from plugins.t100_globe import monthly, reporting_2002
from tests.helpers import add_segments, get
from tests.test_rollups import add_carriers, flight


# (airline_id, name, Jan-Sep 2002, Oct-Dec 2002, 2003): domestic all-cargo departures, as REPORTING_2002_SQL gives them
def test_only_airlines_whose_flying_jumps_and_stays_get_the_note():
    found = reporting_2002([
        ("20107", "Federal Express Corporation", 0, 74331, 281093),  # none before, then a lot
        ("19874", "Air Transport International", 1, 1766, 6620),    # almost none before
        ("20095", "World Airways Inc.", 358, 335, 517),              # a busy fourth quarter, back down in 2003
        ("20190", "Southern Air Inc.", 88, 281, 109),                # up at the end of 2002, not in 2003
        ("20339", "L.A.B. Flying Service Inc.", 0, 13, 103),         # too few flights to show (4 a month)
        ("20304", "Custom Air Transport", 0, 0, 2400),               # none in 2002 at all: started in 2003
        ("unknown", None, 0, 500, 2000),                             # no page to put it on
    ])
    assert sorted(found) == ["19874", "20107"]
    assert found["20107"] == {"name": "Federal Express", "before": 0, "after": 74331 / 3}


def test_monthly_rates_read_in_a_sentence():
    assert [monthly(r) for r in (0, 1 / 9, 59, 24777)] == ["none", "almost none", "about 59", "about 24,800"]


def seed(db_path):
    add_carriers(db_path, ("20107", "FX", "Federal Express Corporation"), ("19790", "DL", "Delta Air Lines Inc."), ("19386", "NW", "Northwest Airlines Inc."))
    cargo = lambda carrier, year, month, deps: flight("MEM", "IND", year, deps=deps, pax=0, seats=0, freight=deps * 1000, carrier_entity=carrier, month=month, **{"class": "G"})
    add_segments(db_path, "t100_domestic", [
        cargo("FX", 2002, 10, 300), cargo("FX", 2003, 3, 1200),                                 # FedEx: appears in October 2002
        cargo("NW", 2002, 2, 1), cargo("NW", 2002, 11, 200), cargo("NW", 2003, 5, 800),         # Northwest, in Delta's group
        flight("ATL", "LAX", 2002, deps=900, carrier_entity="DL", month=4, **{"class": "F"}),  # Delta's passenger flying
    ])
    conn = sqlite3.connect(db_path)
    rebuild_carrier_groups(conn)
    rebuild_carrier_group_year(conn)
    conn.close()


def test_the_note_names_the_airlines_on_the_page_that_show_the_change(ds, db_path):
    seed(db_path)
    fedex = html.unescape(get(ds, "/airlines/20107").text)
    assert 'id="reporting-note" hidden' in fedex
    assert "Federal Express went from none to about 100 a month at the end of 2002" in fedex and 'href="/about#breaks"' in fedex
    delta = html.unescape(get(ds, "/airlines/delta").text)  # the group names its member
    assert "Northwest Airlines went from almost none to about 67 a month" in delta  # in whole numbers
    assert "reporting-note" in get(ds, "/airlines/19386").text  # and so does the member's own page
    assert "reporting-note" not in get(ds, "/airlines/19790").text  # Delta Air Lines itself shows no change
    assert "reporting-note" not in get(ds, "/airlines/20107/changes").text  # only the over-time page has the chart


def test_ups_gets_its_note_written_by_hand(ds, db_path):
    add_carriers(db_path, ("19917", "5X", "United Parcel Service"))
    add_segments(db_path, "t100_domestic", [flight("SDF", "ONT", 2001, deps=9000, pax=0, seats=0, freight=10**8, carrier_entity="5X", month=1, **{"class": "G"})])
    conn = sqlite3.connect(db_path)
    rebuild_carrier_groups(conn)
    rebuild_carrier_group_year(conn)
    conn.close()
    page = html.unescape(get(ds, "/airlines/19917").text)
    assert 'id="reporting-note" hidden>UPS freight tonnage grew after January 2001, which appears to be early compliance' in page
    assert "only had to report" not in page  # its data don't show the October 2002 change
