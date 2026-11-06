import re, sys
for name in sys.argv[1:]:
    p = f"templates/{name}.html"; s = open(p).read()
    head = re.search(r'<head>\n(.*?)</head>', s, re.S).group(1)
    title = re.search(r'<title>(.*?) · T-100</title>', head).group(1)
    styles, rest = [], []
    for l in head.splitlines():
        if re.search(r'charset|viewport|<title>|/static/common/base.css|/static/nav/style.css|nav/main.js', l): continue
        (styles if l.strip().startswith('<link rel="stylesheet"') else rest).append(l)
    body = re.search(r'<body([^>]*)>', s).group(1)
    main = re.search(r'<main([^>]*)>\s*\{% include "_nav.html" %\}\n(.*?)\s*\{% include "_footer.html" %\}\s*</main>(.*?)</body>', s, re.S)
    attrs, content, post = main.groups()
    assert not attrs.strip(), (name, attrs)
    out = '{% extends "t100_base.html" %}\n\n{% block title %}' + title + '{% endblock %}\n'
    out += '{% block styles %}\n' + '\n'.join(styles) + '\n{% endblock %}\n'
    if any(l.strip() for l in rest): out += '{% block head %}\n' + '\n'.join(rest).strip('\n') + '\n{% endblock %}\n'
    if body.strip(): out += '{% block body_attrs %}' + body + '{% endblock %}\n'
    out += '\n{% block content %}\n' + content.strip('\n') + '\n{% endblock %}\n'
    if post.strip(): out += '\n{% block scripts %}\n' + post.strip('\n') + '\n{% endblock %}\n'
    open(p, 'w').write(out)
