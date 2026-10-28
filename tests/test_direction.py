from plugins.t100_direction import DIRECTION_CHOICES_AIRPORT, DIRECTION_CHOICES_ROUTE, count_word, cutoff, route_count_word, parse_dir, route_heading


def test_parse_dir_accepts_out_and_in():
    assert (parse_dir("out"), parse_dir("in"), parse_dir(None), parse_dir("")) == ("out", "in", "", "")


def test_parse_dir_rejects_unknown():
    assert parse_dir("OUT") == parse_dir("both") == parse_dir("x") == parse_dir("each") == ""


def test_words_and_headings():
    assert [count_word(d) for d in ("", "out", "in")] == ["Flights", "Departures", "Arrivals"]
    assert [route_heading("LAX", "LHR", d) for d in ("", "out", "in")] == ["LAX ↔ LHR", "LAX → LHR", "LHR → LAX"]


def test_cutoff_doubles_for_both():
    assert (cutoff(""), cutoff("out"), cutoff("in"), cutoff("", 365)) == (24, 12, 12, 730)


def test_choices():
    assert DIRECTION_CHOICES_ROUTE("LAX", "LHR") == [("", "LAX ↔ LHR"), ("out", "LAX → LHR"), ("in", "LHR → LAX")]
    assert DIRECTION_CHOICES_AIRPORT == [("", "Both directions"), ("out", "Departing"), ("in", "Arriving")]


def test_a_route_counts_departures_from_whichever_airport_leads():
    assert [route_count_word(d) for d in ("", "out", "in")] == ["Flights", "Departures", "Departures"]
