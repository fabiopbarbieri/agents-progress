"""Builds the README's HTML scenes from what scene.ts printed.

Usage: render.py <test output> <out dir>. Writes terminal.html, desktop-light.html
and desktop-dark.html to <out dir>; build.sh photographs them.
"""
import base64
import html
import json
import re
import sys

log, out = sys.argv[1], sys.argv[2]
# Each tree is one line: @@<name>@@<json>.
parts = re.split(r'@@([a-z-]+)@@', open(log).read())
d = {parts[i]: json.loads(parts[i + 1].split('\n', 1)[0]) for i in range(1, len(parts), 2)}

FONT_UI = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI','Noto Sans',sans-serif"
MONO = "'JetBrainsMono Nerd Font','JetBrains Mono','Cascadia Code','DejaVu Sans Mono',monospace"


# ---------- terminal: tree -> HTML in cells ----------
def term(n, inline=False):
    if n is None or n is True or n is False:
        return ''
    if isinstance(n, (str, int, float)):
        return html.escape(str(n))
    t, p, kids = n['type'], n.get('props', {}), n.get('children') or []
    if t == 'Text':
        st = []
        if p.get('color'):
            st.append(f"color:{p['color']}")
        if p.get('dimColor'):
            st.append('color:var(--dim)')
        if p.get('bold'):
            st.append('font-weight:700')
        inner = ''.join(term(k, True) for k in kids)
        if inline:
            return f'<span style="{";".join(st)}">{inner}</span>'
        cls = 'tx tr' if p.get('wrap') == 'truncate-end' else 'tx'
        return f'<div class="{cls}" style="{";".join(st)}">{inner}</div>'
    if t == 'Button':
        label = ''.join(term(k, True) for k in kids) if (p.get('plain') and kids) else html.escape(str(p.get('label', '')))
        if not p.get('plain'):
            label = f'[ {label} ]'
        cls = 'bt tr' if p.get('plain') else 'bt fr'
        return f'<div class="{cls}">{label}</div>'
    # Box
    st = ['display:flex', f"flex-direction:{p.get('flexDirection', 'row')}", 'min-width:0']
    if p.get('gap'):
        st.append(f"gap:{p['gap'] * (1 if p.get('flexDirection') == 'column' else 1)}{'lh' if p.get('flexDirection') == 'column' else 'ch'}")
    if p.get('justifyContent'):
        st.append(f"justify-content:{p['justifyContent'].replace('space-between', 'space-between')}")
    if 'flexShrink' in p:
        st.append(f"flex-shrink:{p['flexShrink']}")
    if p.get('width'):
        st.append(f"width:{p['width']}ch;flex-shrink:0")
    if p.get('paddingLeft'):
        st.append(f"padding-left:{p['paddingLeft']}ch")
    if p.get('marginBottom'):
        st.append(f"margin-bottom:{p['marginBottom']}lh")
    return f'<div style="{";".join(st)}">{"".join(term(k) for k in kids)}</div>'


PANE_COLS = 56
MAIN_COLS = 68
terminal_html = f"""<!doctype html><meta charset="utf-8"><style>
:root{{--bg:#16161a;--fg:#e8e6e3;--dim:#7e7c78;--line:#34343a}}
html,body{{margin:0;background:transparent}}
.win{{margin:28px;width:fit-content;background:var(--bg);color:var(--fg);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35),0 0 0 1px #2a2a30;overflow:hidden;font:15px/1.45 {MONO};font-variant-ligatures:none}}
.bar{{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#1d1d22;border-bottom:1px solid var(--line)}}
.bar i{{width:12px;height:12px;border-radius:50%;display:block}}
.bar span{{margin-left:auto;margin-right:auto;color:#8b8a86;font:12.5px {FONT_UI};transform:translateX(-30px)}}
.body{{display:flex;padding:14px 16px 16px}}
.main{{width:{MAIN_COLS}ch;display:flex;flex-direction:column;justify-content:flex-end;padding-right:2ch}}
.pane{{width:{PANE_COLS}ch;border:1px solid var(--line);border-radius:8px;padding:6px 1ch 2px;position:relative}}
.pane .ttl{{position:absolute;top:-0.75em;left:1.5ch;background:var(--bg);padding:0 .6ch;color:var(--dim)}}
.tx,.bt{{white-space:pre;min-width:0}}
.tr{{overflow:hidden;text-overflow:ellipsis}}
.fr{{flex-shrink:0}}
.prompt{{border:1px solid #4a4a52;border-radius:8px;padding:4px 1ch;margin-top:6px}}
.prompt b{{color:var(--fg)}}
.cur{{display:inline-block;width:1ch;background:#e8e6e3;color:#16161a}}
.hint{{color:var(--dim);padding:4px 1ch 0}}
.you{{color:var(--dim)}}
</style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>claude</span></div>
<div class="body"><div class="main">
<div class="you">&gt; Ship the CSV export: split it into tasks and</div>
<div class="you">&nbsp;&nbsp;hand them to subagents.</div>
<div style="height:1lh"></div>
<div>● Planned 5 tasks; 2 accepted, 2 at work.</div>
<div style="flex:1"></div>
<div style="padding:0 1ch">{term(d['band-terminal'])}</div>
<div class="prompt"><b>&gt;</b> <span class="cur">&nbsp;</span></div>
</div><div class="pane"><div class="ttl">Agents</div>{term(d['pane-terminal'])}</div></div></div>"""
open(f'{out}/terminal.html', 'w').write(terminal_html)


# ---------- desktop: the mod's SVGs as images, light or dark ----------
DARK = re.compile(r'@media \(prefers-color-scheme: dark\)\{((?:[^{}]*\{[^{}]*\})*)\}')


def themed(svg, dark):
    svg = DARK.sub((lambda m: m.group(1)) if dark else '', svg)
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()


def desk(n, dark):
    if n is None or isinstance(n, bool):
        return ''
    if isinstance(n, (str, int, float)):
        return html.escape(str(n))
    t, p, kids = n['type'], n.get('props', {}), n.get('children') or []
    if t == 'Svg':
        return f'<img src="{themed(p["source"], dark)}" width="{p["width"]}" height="{p["height"]}" alt="">'
    if t == 'Text':
        return f'<div class="dt{" dim" if p.get("dimColor") else ""}">{"".join(desk(k, dark) for k in kids)}</div>'
    if t == 'Button':
        return f'<button>{html.escape(str(p.get("label", "")))}</button>'
    st = f"display:flex;flex-direction:{p.get('flexDirection', 'row')};align-items:{p.get('alignItems', 'stretch')};gap:{p.get('gap', 0) * 8}px"
    return f'<div style="{st}">{"".join(desk(k, dark) for k in kids)}</div>'


for dark in (False, True):
    c = dict(bg='#1f1e1d', panel='#1a1918', fg='#ececec', dim='#9a9a96', line='#3a3936', btn='#30302e', page='#141413') if dark else dict(
        bg='#faf9f5', panel='#ffffff', fg='#1f1f1f', dim='#7a7974', line='#e6e4dd', btn='#f0eee6', page='#ffffff')
    page = f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;background:transparent}}
.win{{margin:28px;width:fit-content;background:{c['bg']};color:{c['fg']};border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,{.4 if dark else .14}),0 0 0 1px {c['line']};overflow:hidden;font:13px/1.4 {FONT_UI}}}
.body{{display:flex}}
.main{{width:760px;padding:22px 24px;display:flex;flex-direction:column}}
.pane{{width:440px;padding:18px 20px;background:{c['panel']};border-left:1px solid {c['line']};display:flex;flex-direction:column;gap:6px}}
.pane h3{{margin:0 0 6px;font-size:13px;font-weight:600;color:{c['dim']}}}
.dt{{padding:8px 0 2px;font-size:12px}} .dim{{color:{c['dim']}}}
button{{all:unset;font:12px {FONT_UI};color:{c['dim']};padding:3px 9px;border-radius:6px;background:{c['btn']};align-self:flex-start}}
.msg{{max-width:520px;padding:10px 14px;border-radius:12px;background:{c['btn']};align-self:flex-end;margin-bottom:14px}}
.say{{color:{c['fg']};margin-bottom:8px}}
.input{{border:1px solid {c['line']};border-radius:14px;background:{c['panel']};height:64px;margin-top:10px;padding:12px 16px;color:{c['dim']}}}
</style><div class="win"><div class="body"><div class="main">
<div class="msg">Ship the CSV export: split it into tasks and hand them to subagents.</div>
<div class="say">Planned 5 tasks; 2 accepted, 2 at work.</div>
<div style="flex:1"></div>
{desk(d['band-desktop'], dark)}
<div class="input">Reply…</div>
</div><div class="pane"><h3>Agents</h3>{desk(d['pane-desktop'], dark)}</div></div></div>"""
    open(f'{out}/desktop-{"dark" if dark else "light"}.html', 'w').write(page)
print('ok')
