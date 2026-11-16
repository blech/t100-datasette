# plugins/t100_render_links.py
import re

from datasette import hookimpl
import markupsafe

# carrier_logo.logo holds a path under static/icons/, e.g. airline-logos/AAL.png or soaring-symbols/DAL.svg
_LOGO_RE = re.compile(r"^(airline-logos(-custom)?|soaring-symbols)/[A-Za-z0-9_]+\.(png|svg)$")


@hookimpl
def render_cell(value, column, datasette):
    # If the column name is 'more_detail' and it looks like a path, render as a link
    if column == "more_detail" and isinstance(value, str) and value.startswith("/"):
        return markupsafe.Markup(
            f'<a href="{markupsafe.escape(value)}">View Details</a>'
        )
    # The logo column shows the image itself (served from this project's static/ dir)
    if column == "logo" and isinstance(value, str) and _LOGO_RE.match(value):
        src = markupsafe.escape(datasette.urls.path(f"static/icons/{value}"))
        return markupsafe.Markup(
            f'<img src="{src}" alt="" loading="lazy" '
            'style="height:28px;width:56px;object-fit:contain">'
        )
