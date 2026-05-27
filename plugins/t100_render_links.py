# plugins/t100_render_links.py
from datasette import hookimpl
import markupsafe

@hookimpl
def render_cell(value, column, datasette):
    # If the column name is 'more_detail' and it looks like a path, render as a link
    if column == "more_detail" and isinstance(value, str) and value.startswith("/"):
        return markupsafe.Markup(
            f'<a href="{markupsafe.escape(value)}">View Details</a>'
        )
