import re

from tests.helpers import get
from tests.test_views_pages import delta


def test_each_matrix_page_puts_the_colour_key_beside_the_colour_choice(ds, db_path):
    delta(db_path)
    for path in ["/airports/over-time", "/airlines/over-time", "/aircraft/over-time", "/airlines/delta/routes", "/airlines/delta/aircraft", "/airports/SFO/destinations"]:
        html = get(ds, path).text
        row = re.search(r'<div class="key-row">(.*?)</div>\s*<p class="note" id="scale-note"', html, re.S)
        assert row, path
        assert re.findall(r'id="(matrix-scale|matrix-key)"', row.group(1)) == ["matrix-scale", "matrix-key"], path
        # the key comes before the note that explains it, and both before the matrix
        assert html.index('id="matrix-key"') < html.index('id="scale-note"') < html.index('id="matrix"'), path
