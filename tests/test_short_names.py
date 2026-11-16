import json
import shutil
import subprocess
from pathlib import Path

import pytest

from plugins.t100_globe import short_name

NAMES = [
    "Concesionaria Vuela Compania De Aviacion SA de CV (Volaris)",
    "Hyannis Air Service, Inc. dba Cape Air",
    "Delta Air Lines Inc.",
    "Southwest Airlines Co.",
    "Trans States Airlines d/b/a United Express",
    "Aerovias de Mexico, S.A. de C.V.",
    "Alaska Airlines Inc. f/k/a Something Else",
    "Compass Airlines (subsidiary of Foo)",
    "Federal Express Corporation (incl. Others)",
    "Deutsche Lufthansa AG",
    "Some Very Long International Airline Name Incorporated",
    "",
]


def test_a_short_name_drops_legal_endings_and_takes_the_trade_name():
    assert short_name("Concesionaria Vuela Compania De Aviacion SA de CV (Volaris)") == "Volaris"
    assert short_name("Hyannis Air Service, Inc. dba Cape Air") == "Cape Air"
    assert short_name("Delta Air Lines Inc.") == "Delta Air Lines"


@pytest.mark.skipif(not shutil.which("node"), reason="needs node")
def test_the_python_short_name_agrees_with_the_one_the_charts_use():
    root = Path(__file__).resolve().parent.parent
    script = (f"import {{ shortName }} from '{root}/static/charts/src/names.js';"
              f"console.log(JSON.stringify({json.dumps(NAMES)}.map(shortName)))")
    out = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, text=True, check=True).stdout
    assert [short_name(n) for n in NAMES] == json.loads(out)
