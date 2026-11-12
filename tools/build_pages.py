"""Build the static, crawlable pages for heightopus.com from static/data/questions.json.

Writes:
  static/how-to-play/index.html
  static/heights/index.html
  static/heights/<slug>/index.html   (one per question)
  static/404.html
  static/sitemap.xml

Run after editing questions:  python tools/build_pages.py   (dev.py runs it automatically)
No dependencies; output is deterministic so re-runs only change what really changed.
"""
import html
import json
import math
import os
import re
import shutil
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "static")
SITE = "https://heightopus.com"
UPDATED = "2026-11-12"  # bump when page content changes meaningfully
FT = 3.28084

ZONES = [
    (0, "Sunlit Shallows", "Warm, bright water and curious little fish."),
    (150, "Kelp Forest", "Swaying golden-green towers of kelp."),
    (600, "Coral Drop-off", "The reef tumbles away into deep blue."),
    (1500, "Shipwreck Graveyard", "Old hulls rest where the light fades."),
    (2600, "Twilight Zone", "The last of the sunlight gives out here."),
    (4000, "Midnight Zone", "Down here, only things that glow can be seen."),
    (6500, "The Abyss", "Cold, crushing and very, very quiet."),
    (9000, "Hadal Trench", "The deepest cracks in the whole planet."),
    (11000, "The Unknown", "Nobody has ever been this deep."),
]
BANDS = [
    ("Bullseye", "#ffd166", "within 3%", 100),
    ("Spot On", "#06d6a0", "within 8%", 75),
    ("Close", "#4cc9f0", "within 18%", 50),
    ("Ballpark", "#7b8cde", "within 40%", 25),
    ("Way Off", "#b5838d", "up to 2× off", 10),
    ("Lost at Sea", "#8a94a6", "more than 2× off", 0),
]
SCALE_REFS = [
    ("door", "a standard door", 2.03),
    ("doubledecker", "a London double-decker bus", 4.4),
    ("liberty", "the Statue of Liberty", 93),
    ("eiffel", "the Eiffel Tower", 330),
    ("everest", "Mount Everest", 8849),
]

e = lambda s: html.escape(str(s), quote=True)


# ---------------------------------------------------------------- formatting
def trim(x):
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return s


def nice(v):
    if v >= 1000:
        return f"{round(v):,}"
    if v >= 100:
        return str(round(v))
    if v >= 10:
        return trim(round(v, 1))
    return trim(round(v, 2))


def metric(m):
    if m >= 10000:
        return f"{nice(m / 1000)} km"
    if m < 1:
        return f"{nice(m * 100)} cm"
    return f"{nice(m)} m"


def imperial(m):
    if m >= 100000:
        return f"{nice(m / 1609.344)} miles"
    ft = m * FT
    if ft < 10:
        inches = round(m * 39.3701)
        f, i = divmod(inches, 12)
        return f"{f} ft {i} in" if f else f"{i} in"
    return f"{nice(ft)} ft"


def metric_words(m):
    if m >= 10000:
        return f"{nice(m / 1000)} kilometres"
    if m < 1:
        return f"{nice(m * 100)} centimetres"
    return f"{nice(m)} metres"


# ---------------------------------------------------------------- questions
def short_q(q):
    s = q.split(",")[0].strip().rstrip("?").strip()
    return s + "?"


def slugify(s):
    s = s.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s.encode("ascii", "ignore").decode()).strip("-")
    return s[:80].rstrip("-")


def load():
    with open(os.path.join(STATIC, "data", "questions.json"), encoding="utf-8") as f:
        qs = json.load(f)
    seen = set()
    for q in qs:
        q["short"] = short_q(q["q"])
        slug = slugify(q["short"]) or q["id"]
        if slug in seen:
            slug = f"{slug}-{q['id']}"
        seen.add(slug)
        q["slug"] = slug
        q["url"] = f"{SITE}/heights/{slug}/"
        q["path"] = f"/heights/{slug}/"
    return qs


# ---------------------------------------------------------------- layout
FONTS = '<link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/pixelify-sans-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/css/fonts.css">'


def page(*, title, desc, path, body, ld, robots="index, follow, max-image-preview:large", canonical=True):
    url = SITE + path
    ld_json = json.dumps(ld, ensure_ascii=False, indent=1).replace("</", "<\\/")
    canon = f'<link rel="canonical" href="{e(url)}">\n<meta property="og:url" content="{e(url)}">' if canonical else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="{robots}">
{canon}
<meta name="theme-color" content="#06101d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Heightopus">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{SITE}/img/og-1200x630.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{SITE}/img/og-1200x630.jpg">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
{FONTS}
<link rel="stylesheet" href="/css/pages.css">
<script type="application/ld+json">
{ld_json}
</script>
</head>
<body>
<header class="top">
  <a class="brand" href="/" aria-label="Heightopus home">Height<span>opus</span></a>
  <nav aria-label="Main">
    <a href="/heights/">All heights</a>
    <a href="/how-to-play/">How to play</a>
    <a class="btn small" href="/#/play">Dive in ↓</a>
  </nav>
</header>
<main class="wrap">
{body}
</main>
<footer class="foot">
  <a href="/">Heightopus</a><a href="/heights/">All heights</a><a href="/how-to-play/">How to play</a><a href="/#/party">Party rooms</a><a href="/privacy/">Privacy</a>
  <span>Made by <a href="https://mas0ng.com/projects/heightopus/">mas0ng.com</a></span>
</footer>
</body>
</html>
"""


def crumbs_ld(items):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(items)],
    }


def crumbs_html(items):
    parts = [f'<a href="{p}">{e(n)}</a>' for n, p in items[:-1]] + [f'<span aria-current="page">{e(items[-1][0])}</span>']
    return '<nav class="crumbs" aria-label="Breadcrumb">' + " / ".join(parts) + "</nav>"


PUBLISHER = {"@type": "Person", "@id": "https://mas0ng.com/#person", "name": "Mason Gibbs", "url": "https://mas0ng.com/"}
WEBSITE_REF = {"@id": f"{SITE}/#website"}


def cat_anchor(cat):
    return "cat-" + slugify(cat)


# ---------------------------------------------------------------- per-height pages
def scale_rows(q):
    m = q["m"]
    refs = [r for r in SCALE_REFS if r[0] != q["id"]]
    below = [r for r in refs if r[2] <= m * 1.05]
    above = [r for r in refs if r[2] > m * 1.05]
    chosen = (below[-1:] + above[:1]) if below else above[:2]
    chosen = [r for i, r in enumerate(chosen) if i == 0 or r[2] / m <= 20]  # keep the bars readable
    subj = re.match(r"^(?:about )?how (?:tall|high|deep) (?:is|was|are|were) (?:an? |the )?(.+?)\??$", q["short"], re.I)
    label = subj.group(1) if subj and len(subj.group(1)) <= 42 else "This height"
    rows = [(label, m)] + [(r[1], r[2]) for r in chosen]
    top = max(v for _, v in rows)
    out = []
    for label, v in rows:
        w = max(1.5, 100 * v / top)
        out.append(f'<div class="scale-row"><span>{e(label[:1].upper() + label[1:])} · {e(metric(v))}</span><div class="bar"><i style="width:{w:.1f}%"></i></div></div>')
    sentence = ""
    if chosen:
        ref = chosen[0]
        ratio = m / ref[2]
        if 0.85 <= ratio <= 1.15:
            sentence = f"That's roughly the same height as {ref[1]}."
        elif ratio > 1:
            times = f"{ratio:.1f}".rstrip("0").rstrip(".") if ratio < 10 else f"{round(ratio):,}"
            sentence = f"That's about {times} times the height of {ref[1]}."
        else:
            sentence = f"That's about {round(ratio * 100)}% of the height of {ref[1]}."
    return sentence, "".join(out)


def related(q, qs):
    same = [x for x in qs if x["cat"] == q["cat"] and x["id"] != q["id"]]
    same.sort(key=lambda x: abs(math.log(x["m"] / q["m"])))
    near = [x for x in qs if x["cat"] != q["cat"]]
    near.sort(key=lambda x: abs(math.log(x["m"] / q["m"])))
    return same[:8], near[:6]


def link_list(items):
    return '<ul class="links">' + "".join(f'<li><a href="{x["path"]}">{e(x["short"])}</a><span>{e(metric(x["m"]))}</span></li>' for x in items) + "</ul>"


def height_page(q, qs):
    m = q["m"]
    title = f'{q["short"]} {metric(m)} ({imperial(m)}) | Heightopus'
    desc = f'{q["q"]} The answer is {metric_words(m)} ({imperial(m)}). {q["fact"]}'
    if len(desc) > 158:
        desc = desc[:155].rsplit(" ", 1)[0] + "…"
    sentence, bars = scale_rows(q)
    same, near = related(q, qs)
    trail = [("Heightopus", "/"), ("All heights", "/heights/"), (q["cat"], f"/heights/#{cat_anchor(q['cat'])}"), (q["short"], q["path"])]
    body = f"""{crumbs_html(trail)}
<article class="card answer">
  <p class="eyebrow">{e(q["cat"])}</p>
  <h1>{e(q["q"])}</h1>
  <p class="value">{e(metric(m))}<small>{e(imperial(m))}</small></p>
  <p class="lede"><strong>Answer:</strong> {e(metric_words(m))}, or about {e(imperial(m))}. {e(sentence)}</p>
  <p class="fact"><strong>Did you know?</strong> {e(q["fact"])}</p>
  <div class="scale" aria-label="Height comparison">{bars}</div>
</article>
<section class="card cta">
  <div><h2>Could you have guessed it?</h2><p>Heightopus asks ten height questions every day. Type your best guess; the closer you get, the deeper your pixel octopus dives.</p></div>
  <a class="btn" href="/#/play">Try today's dive ↓</a>
</section>
<section class="card">
  <h2>More {e(q["cat"].lower())} heights</h2>
  {link_list(same)}
</section>
<section class="card">
  <h2>Similar heights</h2>
  {link_list(near)}
</section>"""
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage", "@id": q["url"] + "#page", "url": q["url"], "name": title, "description": desc,
                "inLanguage": "en", "dateModified": UPDATED, "isPartOf": WEBSITE_REF, "author": PUBLISHER,
                "about": {"@type": "Thing", "name": q["short"].rstrip("?")},
                "breadcrumb": {"@id": q["url"] + "#breadcrumb"},
                "primaryImageOfPage": {"@type": "ImageObject", "contentUrl": f"{SITE}/img/og-1200x630.jpg", "width": 1200, "height": 630},
            },
            {**crumbs_ld(trail), "@id": q["url"] + "#breadcrumb"},
        ],
    }
    return page(title=title, desc=desc, path=q["path"], body=body, ld=ld)


# ---------------------------------------------------------------- index + how to play + 404
def heights_index(qs):
    cats = OrderedDict()
    for q in sorted(qs, key=lambda x: (x["cat"], x["short"])):
        cats.setdefault(q["cat"], []).append(q)
    n = len(qs)
    title = f"How Tall Is It? {n} Heights of Famous Landmarks, Animals and People | Heightopus"
    desc = f"Look up the heights of {n} famous things: skyscrapers, landmarks, mountains, animals, athletes and more, in metres and feet, each with a fun fact."
    chips = "".join(f'<li><a href="#{cat_anchor(c)}">{e(c)} ({len(v)})</a></li>' for c, v in cats.items())
    sections = "".join(
        f'<section class="card" id="{cat_anchor(c)}"><h2>{e(c)}</h2>{link_list(v)}</section>' for c, v in cats.items()
    )
    trail = [("Heightopus", "/"), ("All heights", "/heights/")]
    body = f"""{crumbs_html(trail)}
<section class="card">
  <h1>How tall is it? {n} heights, answered</h1>
  <p class="muted">Every question from Heightopus, with its answer in metres and feet and a fun fact. Pick a category, or test yourself first with <a href="/#/play">today's ten questions</a>.</p>
  <ul class="cats">{chips}</ul>
</section>
{sections}"""
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage", "@id": f"{SITE}/heights/#page", "url": f"{SITE}/heights/", "name": title, "description": desc,
                "inLanguage": "en", "dateModified": UPDATED, "isPartOf": WEBSITE_REF, "author": PUBLISHER,
                "breadcrumb": {"@id": f"{SITE}/heights/#breadcrumb"},
                "mainEntity": {
                    "@type": "ItemList", "numberOfItems": n,
                    "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": q["url"], "name": q["short"]} for i, q in enumerate(qs)],
                },
            },
            {**crumbs_ld(trail), "@id": f"{SITE}/heights/#breadcrumb"},
        ],
    }
    return page(title=title, desc=desc, path="/heights/", body=body, ld=ld)


FAQ = [
    ("Is Heightopus free?", "Yes. There's no sign-up, no account and nothing to install. It runs in any modern browser on phones, tablets, Chromebooks and computers."),
    ("When do new questions arrive?", "Every day at midnight, your local time. Everyone gets the same ten questions on the same day, so you can compare results with friends."),
    ("Can I use feet instead of metres?", "Yes. Use the m / ft switch next to the answer box, or type a unit with your number, like 300ft, 1.2k or 8.8km."),
    ("How do party rooms work?", "Press Party, choose Host a room and share the four-letter code or invite link. Between 2 and 12 people answer the same question at the same time, and the closest guesses dive deepest."),
    ("Where do the heights come from?", "Each answer uses a widely published figure. Some heights change over time or depend on how they're measured, so every question says exactly what is being measured."),
    ("Is my data stored?", "Your streak, best depth and settings are saved in your own browser. When you finish a daily, only your total score is sent, anonymously, to work out how you compare with everyone else that day."),
]


def how_to_play():
    title = "How to Play Heightopus: Rules, Scoring and Ocean Zones"
    desc = "Learn how Heightopus works: guess heights in metres or feet, score points for being close, dive through nine ocean zones and play live with friends."
    bands = "".join(f'<tr><th scope="row"><span class="dot" style="background:{c}"></span>{e(n)}</th><td>{e(r)}</td><td>{p}</td></tr>' for n, c, r, p in BANDS)
    zones = "".join(
        f"<tr><th scope=\"row\">{e(name)}</th><td>{f'{start:,} m' if i == len(ZONES) - 1 else f'{start:,}–{ZONES[i + 1][0]:,} m'}{'+' if i == len(ZONES) - 1 else ''}</td><td class=\"muted\">{e(sub)}</td></tr>"
        for i, (start, name, sub) in enumerate(ZONES)
    )
    faq = "".join(f"<details><summary>{e(qq)}</summary><p>{e(a)}</p></details>" for qq, a in FAQ)
    trail = [("Heightopus", "/"), ("How to play", "/how-to-play/")]
    body = f"""{crumbs_html(trail)}
<section class="card">
  <h1>How to play Heightopus</h1>
  <p class="muted">Heightopus asks how tall things are. Guess close and your little pixel octopus dives deeper into the ocean.</p>
  <ol>
    <li>Press <strong>Dive in</strong> for today's ten questions, or <strong>Unlimited</strong> for a random set.</li>
    <li>Each question asks how tall, or how high, something is. You have 30 seconds to type your guess.</li>
    <li>Use metres or feet with the m / ft switch, or type units like <code>300ft</code>, <code>1.2k</code> or <code>8.8km</code>.</li>
    <li>See the real answer, how close you were and a fun fact, then watch your octopus dive.</li>
    <li>Later questions count more: ×1, ×1, ×2, ×2, ×2, ×3, ×3, ×3, ×4, ×4.</li>
  </ol>
  <a class="btn" href="/#/play">Start today's dive ↓</a>
</section>
<section class="card">
  <h2>Scoring</h2>
  <p class="muted">Being 10% too high counts the same as being 10% too low.</p>
  <table><thead><tr><th scope="col">Band</th><th scope="col">How close</th><th scope="col">Points</th></tr></thead><tbody>{bands}</tbody></table>
  <p class="muted" style="margin-top:12px">A perfect day scores 2,500 points and takes your octopus all the way down to Challenger Deep, 10,935 metres below the surface.</p>
</section>
<section class="card">
  <h2>The ocean zones</h2>
  <table><thead><tr><th scope="col">Zone</th><th scope="col">Depth</th><th scope="col">What you'll see</th></tr></thead><tbody>{zones}</tbody></table>
  <p class="muted" style="margin-top:12px">On the way down, the depth gauge marks real places: the deepest scuba dive (332 m), a sperm whale's dive (2,250 m), the Titanic wreck (3,800 m) and Challenger Deep (10,935 m).</p>
</section>
<section class="card">
  <h2>Party rooms</h2>
  <p>Press <strong>Party</strong>, choose <strong>Host a room</strong> and share the four-letter code or invite link. The host picks 5 or 10 questions and 15, 20 or 30 seconds per question. Everyone answers at once, nobody sees the other guesses until time's up, and every player's octopus dives side by side, with each person's depth shown on the gauge.</p>
  <a class="btn aqua" href="/#/party">Host a room</a>
</section>
<section class="card">
  <h2>Questions and answers</h2>
  {faq}
</section>
<section class="card">
  <h2>Practise with real heights</h2>
  <p class="muted">Browse every question and answer in <a href="/heights/">the full list of heights</a>.</p>
</section>"""
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage", "@id": f"{SITE}/how-to-play/#page", "url": f"{SITE}/how-to-play/", "name": title, "description": desc,
                "inLanguage": "en", "dateModified": UPDATED, "isPartOf": WEBSITE_REF, "author": PUBLISHER,
                "breadcrumb": {"@id": f"{SITE}/how-to-play/#breadcrumb"},
            },
            {**crumbs_ld(trail), "@id": f"{SITE}/how-to-play/#breadcrumb"},
            {
                "@type": "FAQPage", "@id": f"{SITE}/how-to-play/#faq",
                "mainEntity": [{"@type": "Question", "name": qq, "acceptedAnswer": {"@type": "Answer", "text": a}} for qq, a in FAQ],
            },
        ],
    }
    return page(title=title, desc=desc, path="/how-to-play/", body=body, ld=ld)


def not_found():
    body = """<section class="card">
  <h1>That page sank without a trace</h1>
  <p class="muted">We couldn't find what you were looking for. It may have moved, or the link may be mistyped.</p>
  <p><a class="btn" href="/">Back to Heightopus</a> &nbsp; <a href="/heights/">Browse all heights</a></p>
</section>"""
    ld = {"@context": "https://schema.org", "@type": "WebPage", "name": "Page not found | Heightopus"}
    return page(title="Page not found | Heightopus", desc="This page could not be found.", path="/404", body=body, ld=ld, robots="noindex, follow", canonical=False)


PRIVACY_UPDATED = "12 November 2026"
STORAGE = [
    ("ho_daily_…", "Today's questions, your answers and whether you've finished, so you can carry on if you close the page."),
    ("ho_stats", "Your streak, best depth and number of dives."),
    ("ho_unit, ho_mute", "Whether you use metres or feet, and whether sound is on."),
    ("ho_name, ho_color", "The nickname and colour you choose for party rooms."),
    ("ho_token", "A random code that lets a party room recognise you if you reconnect. It isn't linked to who you are."),
]


def privacy():
    title = "Privacy Notice | Heightopus"
    desc = "How Heightopus handles your information: no accounts, no ads, no tracking. What little is processed, why, how long it's kept and your rights under UK GDPR."
    storage = "".join(f"<tr><th scope=\"row\"><code>{e(k)}</code></th><td>{e(v)}</td></tr>" for k, v in STORAGE)
    trail = [("Heightopus", "/"), ("Privacy", "/privacy/")]
    body = f"""{crumbs_html(trail)}
<section class="card">
  <h1>Privacy notice</h1>
  <p class="muted">Last updated {PRIVACY_UPDATED}.</p>
  <h2>The short version</h2>
  <ul>
    <li>You don't need an account, and we never ask for your name, email or age.</li>
    <li>There are no ads, no analytics and no tracking cookies.</li>
    <li>Your progress and settings stay on your own device.</li>
    <li>If you finish a daily, only your score is sent, with nothing that says who you are.</li>
    <li>In a party room, the other players see the nickname you pick and your guesses. Don't use your real name.</li>
    <li>Like every website, our host (Cloudflare) briefly handles your IP address to deliver the pages and keep them safe.</li>
  </ul>
</section>
<section class="card">
  <h2>Who we are</h2>
  <p>Heightopus is made and run by Mason Gibbs (<a href="https://mas0ng.com/projects/heightopus/">mas0ng.com</a>), who is the data controller for the information described here. Questions or requests: <a href="mailto:mason@mas0ng.com?subject=Heightopus%20privacy">mason@mas0ng.com</a>.</p>
</section>
<section class="card">
  <h2>What we process, and why</h2>
  <table>
    <thead><tr><th scope="col">Information</th><th scope="col">Why</th><th scope="col">How long</th></tr></thead>
    <tbody>
      <tr><th scope="row">Your IP address and basic request details (browser type, time, page requested)</th><td>Cloudflare, our hosting provider, needs these to deliver the site and the party rooms and to protect them from abuse. Lawful basis: legitimate interests in running a working, secure service.</td><td>Handled in transit. Cloudflare may keep short-lived security and diagnostic logs under its own retention rules. We don't keep request logs.</td></tr>
      <tr><th scope="row">Your total score when you finish a daily</th><td>To show how deep you went compared with other people that day. Only the score is stored, added to an anonymous count for that day; no name, IP address or identifier is stored with it.</td><td>Kept as anonymous totals.</td></tr>
      <tr><th scope="row">In party rooms: your nickname, colour, guesses and a random reconnect code</th><td>To run the room you joined: showing players to each other, scoring rounds and letting you rejoin if your connection drops. Lawful basis: legitimate interests in providing the feature you chose to use.</td><td>Only while the room is in use. Rooms delete themselves automatically, usually within an hour of the last person leaving.</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-top:12px">We don't sell or share your information, use it for advertising, build profiles, or make automated decisions about you.</p>
</section>
<section class="card">
  <h2>What's stored on your device</h2>
  <p>Heightopus saves a few small items in your browser's local storage so it works the way you expect. They never leave your device unless stated above, and we don't set cookies. Because they're needed for the features you use, no consent banner is required under the UK's PECR rules. Clearing this site's data in your browser removes them all.</p>
  <table><thead><tr><th scope="col">Item</th><th scope="col">What it's for</th></tr></thead><tbody>{storage}</tbody></table>
  <p class="muted" style="margin-top:12px">Cloudflare may set a strictly necessary security cookie in some situations, for example to tell people apart from bots.</p>
</section>
<section class="card">
  <h2>Who else is involved</h2>
  <ul>
    <li><strong>Cloudflare</strong> hosts the site, runs the party rooms and stores the anonymous daily totals, acting on our behalf. Cloudflare may process data outside the UK; it does so under approved legal safeguards such as standard contractual clauses. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</li>
    <li><strong>Other players</strong> in a party room see your nickname, colour and guesses.</li>
    <li><strong>Sharing.</strong> If you press Post on X or WhatsApp, your result text is passed to that service, and its own privacy policy applies. Nothing is sent unless you choose to share.</li>
  </ul>
  <p class="muted">Our fonts and images are served from heightopus.com itself, so loading a page doesn't contact Google or other third parties.</p>
</section>
<section class="card">
  <h2>Young people</h2>
  <p>Heightopus is suitable for all ages and is designed to collect as little as possible. There are no accounts, chats, ads or tracking, and nothing is shown publicly. Party nicknames are only seen by people in the same room, so pick a fun one rather than your real name.</p>
</section>
<section class="card">
  <h2>Your rights</h2>
  <p>Under UK data protection law you can ask to see, correct or delete personal information about you, object to how it's used, or ask us to limit its use. Because we don't hold accounts or link anything to you, there's usually nothing we can find. Your on-device data is in your control, and party room data is deleted automatically. If you have a request or concern, email <a href="mailto:mason@mas0ng.com?subject=Heightopus%20privacy">mason@mas0ng.com</a>.</p>
  <p>You can also complain to the Information Commissioner's Office (ICO): <a href="https://ico.org.uk/make-a-complaint/" rel="noopener">ico.org.uk/make-a-complaint</a>, or call 0303 123 1113.</p>
</section>
<section class="card">
  <h2>Changes</h2>
  <p>If this notice changes, we'll update the date at the top. Security issues can be reported through our <a href="https://github.com/mas0ng/heightopus/blob/main/SECURITY.md" rel="noopener">security policy</a>.</p>
</section>"""
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": f"{SITE}/privacy/#page", "url": f"{SITE}/privacy/", "name": title, "description": desc,
             "inLanguage": "en", "dateModified": UPDATED, "isPartOf": WEBSITE_REF, "author": PUBLISHER,
             "breadcrumb": {"@id": f"{SITE}/privacy/#breadcrumb"}},
            {**crumbs_ld(trail), "@id": f"{SITE}/privacy/#breadcrumb"},
        ],
    }
    return page(title=title, desc=desc, path="/privacy/", body=body, ld=ld)


def sitemap(qs):
    urls = [
        (f"{SITE}/", ["/img/og-1200x630.jpg", "/img/screenshot-home.jpg", "/img/screenshot-dive.jpg", "/img/screenshot-party.jpg"]),
        (f"{SITE}/how-to-play/", []),
        (f"{SITE}/heights/", []),
        (f"{SITE}/privacy/", []),
    ] + [(q["url"], []) for q in qs]
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for loc, imgs in urls:
        out.append(f"  <url>\n    <loc>{e(loc)}</loc>\n    <lastmod>{UPDATED}</lastmod>")
        out += [f"    <image:image><image:loc>{SITE}{i}</image:loc></image:image>" for i in imgs]
        out.append("  </url>")
    out.append("</urlset>\n")
    return "\n".join(out)


def write(rel, text):
    path = os.path.join(STATIC, *rel.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def main():
    qs = load()
    heights_dir = os.path.join(STATIC, "heights")
    if os.path.isdir(heights_dir):
        # Remove pages for questions that no longer exist (generated output only).
        keep = {q["slug"] for q in qs}
        for name in os.listdir(heights_dir):
            path = os.path.join(heights_dir, name)
            if os.path.isdir(path) and name not in keep:
                shutil.rmtree(path, ignore_errors=True)
    for q in qs:
        write(f"heights/{q['slug']}/index.html", height_page(q, qs))
    write("heights/index.html", heights_index(qs))
    write("how-to-play/index.html", how_to_play())
    write("privacy/index.html", privacy())
    write("404.html", not_found())
    write("sitemap.xml", sitemap(qs))
    print(f"Built {len(qs)} height pages, the heights index, how-to-play, privacy, 404 and a sitemap with {len(qs) + 4} URLs.")


if __name__ == "__main__":
    main()
