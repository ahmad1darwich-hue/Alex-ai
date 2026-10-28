#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enrich all USWS suburb pages with region-flavoured, varied local content + FAQ.
Replaces the templated <div class="prose"> and adds a mini-FAQ. Region is read from each
page's breadcrumb. Content varies by a hash of the slug so pages aren't near-duplicates."""
import re, os, glob, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "usws-site"
REGION_PAGES = {'northern-beaches','north-shore','eastern-suburbs','inner-west','inner-city',
 'the-hills','ryde-and-macquarie','parramatta','hornsby','sutherland-shire','st-george',
 'canterbury-bankstown','liverpool','western-sydney','penrith','campbelltown','index'}

# map region (as it appears in breadcrumb) -> flavour key
REGION_FLAVOUR = {
 'Northern Beaches':'coastal','Sutherland Shire':'coastal',
 'Eastern Suburbs':'coastal_urban',
 'North Shore':'leafy','Hornsby':'bush',
 'The Hills':'family',
 'Western Sydney':'growth','Penrith':'growth','Campbelltown':'growth',
 'Inner West':'urban','Inner City':'urban',
 'Ryde &amp; Macquarie':'general','Parramatta':'general','St George':'general',
 'Canterbury-Bankstown':'general','Liverpool':'general',
}

RFAQ_STYLE = ('<style>.rfaq{max-width:780px;margin:22px 0 0;display:grid;gap:10px}'
 '.rfaq details{background:#fff;border:1px solid var(--line);border-radius:14px;padding:0 18px}'
 '.rfaq summary{cursor:pointer;list-style:none;padding:15px 0;font-weight:600;color:var(--ink);display:flex;justify-content:space-between;gap:12px}'
 '.rfaq summary::-webkit-details-marker{display:none}.rfaq summary::after{content:"+";color:var(--green);font-size:22px;font-weight:400}'
 '.rfaq details[open] summary::after{content:"–"}.rfaq details p{padding:0 0 15px;font-size:15px}'
 '.prose ul{padding-left:20px;margin:12px 0 0;display:grid;gap:6px}.prose li{font-size:15px}</style>')

# value paragraph variants (shared)
VALUE = [
 "One licensed team handles the whole job in {s} — no juggling trades. You get a free on-site visit, a clear fixed written price, clean workmanship and a finish built to Australian standards. We're licensed (NSW Lic. 293802C), fully insured, and you can reach us any time on 0434 449 997.",
 "Our {s} customers choose us because we do the whole job properly — a free on-site quote, one clear fixed price, tidy workmanship and a result that lasts. Licensed (NSW Lic. 293802C), fully insured, built to Australian standards (ABN 20 386 532 878), and reachable any time on 0434 449 997.",
 "From the first call to handover, one local licensed crew does it all in {s} — designed, built and finished to one fixed price. Free on-site visit, clean work, and a workmanship guarantee. NSW Lic. 293802C, fully insured, ABN 20 386 532 878. Call 0434 449 997 any time.",
]

FLAV = {
 'coastal':{
  'open':[
   "Building a garden in {s} means building for the coast. Salt spray, sandy soils and exposed, often sloping blocks are hard on cheap materials and the wrong plants — so we build {s} outdoor spaces with marine-grade fixings, salt-tolerant planting and sandstone or block retaining made to last near the water.",
   "{s} homes deserve outdoor spaces that handle the beaches. We design and build decks, paving, retaining walls, turf and full gardens across {s} and the wider {r} — all built for coastal conditions, from the materials right through to the planting.",
   "From sloping coastal blocks to pool surrounds and easy-care gardens, we build outdoor spaces in {s} that cope with salt, sand and sun. One local licensed team handles the whole job across {s} and {r}.",
  ],
  'bullets':["Sloping and coastal blocks: sandstone, block and timber retaining, steps and terracing",
   "Merbau and hardwood decks, pool surrounds and entertaining areas","Travertine and sandstone paving that stays cool and non-slip underfoot",
   "Salt- and wind-tolerant planting, natural and synthetic turf","Proper drainage for sandy and sloping sites — no run-off or pooling"],
  'faq':[("Do you work on sloping coastal blocks in {s}?","Yes — retaining, terracing, steps and drainage on sloping and sandy blocks are a big part of our work here, quoted as a fixed price after a free on-site visit."),
   ("Will the materials handle the salt air?","Yes. We use marine-grade fixings and finishes chosen for coastal exposure, so decks, screens and paving near the water don't rust, fret or fail early."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 },
 'coastal_urban':{
  'open':[
   "{s} blocks are often compact, coastal and full of character — terraces, courtyards, sloping sites and pool surrounds close to the water. We design and build {s} outdoor spaces that make the most of tight space, with salt-tolerant planting and finishes built for the Eastern Suburbs.",
   "In {s}, every metre counts and the sea air is unforgiving. We build courtyards, paving, decks, screens and pool surrounds across {s} and {r} using materials made for coastal, compact blocks — and planting that thrives near the coast.",
   "Whether it's a courtyard, a pool surround or a full rear-garden rebuild, we help {s} homeowners turn tight, coastal blocks into polished outdoor spaces — one licensed team, one fixed price.",
  ],
  'bullets':["Courtyards, paving and compact low-maintenance gardens","Pool surrounds, coping and poolside landscaping","Privacy screens, decks and entertaining areas for tight blocks",
   "Sandstone and travertine paving, decorative concrete","Salt-tolerant planting and proper drainage for coastal sites"],
  'faq':[("Can you landscape a small {s} courtyard or terrace?","Absolutely — compact courtyards, terraces and side returns are some of our most common Eastern Suburbs jobs. We make small spaces feel bigger and easier to maintain."),
   ("Do you do pool surrounds in {s}?","Yes — coping, paving, decking and poolside planting, built with non-slip, salt-resistant finishes and designed as one finished space."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit; the written fixed-price quote usually follows within one business day.")],
 },
 'leafy':{
  'open':[
   "The North Shore is leafy, established and often built on slopes and sandstone — mature trees, heritage gardens and tight access. We build {s} outdoor spaces that respect the setting: sandstone retaining and terracing, courtyards and driveways, and planting chosen for the shade.",
   "{s} gardens tend to be established and green, on blocks that slope and sit on sandstone. We design and build decks, paving, retaining, turf and full gardens across {s} and {r}, working cleanly around mature trees and existing planting.",
   "From sandstone terracing to shaded courtyards and classic driveways, we build outdoor spaces in {s} that suit the leafy North Shore look — tidy work that fits the street and lasts.",
  ],
  'bullets':["Sandstone and block retaining, terracing and steps for sloping blocks","Decks, pergolas and courtyards that work around mature trees",
   "Driveways and paving in sandstone, travertine and decorative concrete","Shade-tolerant planting, natural and synthetic turf","Drainage done properly on sloping, sandstone sites"],
  'faq':[("Can you work around established trees in {s}?","Yes — we build carefully around mature trees and existing gardens, protect the site as we go, and leave it clean. It's a big part of working on the North Shore."),
   ("Do you build retaining and terracing on sloping {s} blocks?","Yes — sandstone, block and timber retaining, steps and terracing on sloping and sandstone blocks are core to our North Shore work, quoted after a free site visit."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 },
 'bush':{
  'open':[
   "{s} and the Upper North Shore sit among the bush — big leafy blocks, sandstone shelves and sloping sites that back onto reserves. We build {s} outdoor spaces that work with that setting: sandstone and block retaining, decks among the trees, and drainage done properly for bush and clay blocks.",
   "Bush blocks in {s} are rewarding but tricky — slopes, sandstone, big trees and clay that holds water. We design and build retaining, decks, paving, turf and gardens across {s} and {r} to suit the conditions, not fight them.",
   "From sloping bush blocks to shaded entertaining areas, we build outdoor spaces in {s} that respect the trees and the terrain — one local licensed team, one clear fixed price.",
  ],
  'bullets':["Sandstone and block retaining, terracing and steps for sloping bush blocks","Drainage built properly for clay and bush sites — no soggy yards",
   "Merbau and hardwood decks and pergolas among the trees","Driveways, paving and concreting for long, leafy blocks","Shade- and clay-tolerant planting, natural and synthetic turf"],
  'faq':[("Do you work on sloping and bush blocks in {s}?","Yes — retaining, terracing, steps and proper drainage on sloping and bushland blocks are a core part of what we do here, quoted as a fixed price after a free site visit."),
   ("Can you build around established trees?","Yes. We work carefully around mature trees and existing gardens, protect the site, and leave it clean — important on {s}'s leafy blocks."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 },
 'family':{
  'open':[
   "{s} and The Hills are family territory — bigger blocks, newer homes and pools, with the backyard as the main living space. We build {s} outdoor areas to match: low-maintenance family yards, pool surrounds and alfresco areas, durable driveways and clean modern landscaping.",
   "In {s}, the backyard is where families live. We design and build pool surrounds, alfresco areas, lawns, driveways and full gardens across {s} and {r} — durable, low-maintenance and built to add real value to a Hills home.",
   "From a bare new-build block to a full backyard makeover, we help {s} families get the outdoor space they actually use — one licensed team, one fixed price, built to last.",
  ],
  'bullets':["Family backyards, alfresco areas and low-maintenance gardens","Pool surrounds, coping, paving and poolside landscaping",
   "New-build landscaping — driveways, turf, retaining and gardens from a bare block","Proper drainage and base prep for heavy Hills clay soil","Decks, pergolas and outdoor entertaining areas"],
  'faq':[("Do you do pool surrounds and alfresco areas in {s}?","Yes — pool landscaping, coping, paving, decks and outdoor entertaining areas are some of our most popular jobs in The Hills, designed and built as one finished space."),
   ("Can you landscape a new-build home in {s}?","Yes — full landscaping for new builds is a core job for us: driveways, turf, retaining, paving and gardens, from a bare block to a finished yard."),
   ("My {s} block has heavy clay — is that a problem?","No, but it has to be built for. We set up proper drainage and base prep for clay soil so lawns, paving and retaining hold up and the yard doesn't waterlog.")],
 },
 'growth':{
  'open':[
   "{s} is growing fast, with new estates and family homes going up across {r}. We help {s} homeowners turn a bare or tired block into a finished outdoor space — driveways, turf, retaining, paving and gardens, all for one clear fixed price.",
   "New builds and growing families in {s} need outdoor spaces built from scratch. We design and build driveways, lawns, retaining, paving, decks and full gardens across {s} and {r} — done properly, on schedule, and guaranteed.",
   "From a bare new-estate block to a full backyard, we help {s} families get a finished, low-maintenance outdoor space — one licensed team handling the whole job for one fixed price.",
  ],
  'bullets':["New-build landscaping — driveways, turf, retaining and gardens from a bare block","Concrete driveways, decorative concrete and paving",
   "Retaining walls and proper drainage for clay and new-estate blocks","Low-maintenance family lawns and gardens, natural and synthetic turf","Decks, pergolas and outdoor entertaining areas"],
  'faq':[("Can you landscape a new-build or new-estate home in {s}?","Yes — that's a lot of what we do out here: driveways, turf, retaining, paving and gardens, from a bare block to a finished yard, for one fixed price."),
   ("Do you fix drainage and clay-soil problems in {s}?","Yes — poor drainage and heavy clay are common on new-estate blocks. We set up proper falls, ag-lines and base prep so the yard doesn't waterlog."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 },
 'urban':{
  'open':[
   "{s} is all terraces, courtyards and compact inner-city blocks where every metre counts. We design and build {s} outdoor spaces that make small spaces work — courtyard gardens, paving, screens, decks and low-maintenance planting.",
   "Inner-city blocks in {s} are tight, and often heritage. We build courtyards, paving, decks, screens and small gardens across {s} and {r} that make the most of the space and suit the character of the street.",
   "From a bare courtyard to a polished rear garden, we help {s} homeowners turn small, tricky inner-city blocks into usable outdoor spaces — one licensed team, one fixed price.",
  ],
  'bullets':["Courtyard gardens and compact, low-maintenance planting","Paving, decking and privacy screens for tight blocks",
   "Sandstone and travertine paving, decorative concrete","Rooftop and small-space turf, natural and synthetic","Drainage and levels sorted properly on tight inner-city sites"],
  'faq':[("Can you landscape a small {s} courtyard or terrace?","Absolutely — compact courtyards, terraces and side returns are some of our most common inner-city jobs. We make small spaces feel bigger and easier to look after."),
   ("Is access a problem on tight {s} blocks?","Rarely — we're used to working with limited access, protecting the property and keeping the site clean in built-up streets."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit; the written fixed-price quote usually follows within one business day.")],
 },
 'general':{
  'open':[
   "Looking for a reliable landscaper in {s}? Urban Sydney Wide Solutions designs, builds and maintains outdoor spaces for homes and businesses across {s} and {r} — decking, paving, concreting, retaining walls, turf and full garden makeovers, built properly and guaranteed.",
   "{s} homeowners come to us for the whole outdoor job in one place. We build decks, driveways, paving, retaining walls, turf and full gardens across {s} and {r} — one licensed team, one fixed price, clean work that lasts.",
   "From a single garden bed to a complete backyard rebuild, we help {s} homes and businesses get outdoor spaces that work and last — designed, built and finished by one local licensed crew.",
  ],
  'bullets':["Full landscape design and construction, garden beds and feature gardens","Decks, pergolas, privacy screens and outdoor entertaining areas",
   "Driveways, paving and decorative concrete","Retaining walls, drainage and site prep","Natural and synthetic turf, new lawns and makeovers"],
  'faq':[("What outdoor work do you do in {s}?","The whole job — landscaping, decking, concreting, paving, retaining walls, drainage and turf — all by one licensed team, so there's no juggling trades."),
   ("Do you do commercial work in {s}?","Yes — homes and businesses, from a single garden to larger commercial landscaping, paving and concreting projects."),
   ("How soon can you quote in {s}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 },
}

def pick(lst, slug, salt=0):
    return lst[(sum(ord(c) for c in slug)+salt) % len(lst)]

PROSE_RE = re.compile(r'<div class="prose">.*?</div>', re.S)

def build_block(slug, suburb, region):
    fl = FLAV[REGION_FLAVOUR.get(region, 'general')]
    s = suburb
    rr = region
    op = pick(fl['open'], slug, 0).format(s=s, r=rr)
    val = pick(VALUE, slug, 3).format(s=s)
    bullets = "".join("<li>%s</li>" % b for b in fl['bullets'])
    prose = '<div class="prose"><p>%s</p><p>%s</p><ul>%s</ul></div>' % (op, val, bullets)
    faqs = list(fl['faq'])
    # rotate faq order a little for variety
    r0 = (sum(ord(c) for c in slug)) % len(faqs)
    faqs = faqs[r0:] + faqs[:r0]
    faq_html = "".join('<details%s><summary>%s</summary><p>%s</p></details>'
                       % (' open' if i==0 else '', q.format(s=s), a.format(s=s))
                       for i,(q,a) in enumerate(faqs))
    faq_block = ('<h3 style="margin-top:28px;font-size:20px">Common questions &mdash; %s</h3>'
                 '<div class="rfaq">%s</div>' % (html.escape(suburb), faq_html))
    return RFAQ_STYLE + prose + faq_block

def main():
    files = sorted(glob.glob(str(ROOT / 'areas' / '*.html')))
    done = 0; skipped = []
    for f in files:
        slug = os.path.basename(f)[:-5]
        if slug in REGION_PAGES:
            continue
        h = open(f, encoding='utf-8').read()
        if 'class="rfaq"' in h:
            skipped.append(slug+'(already)'); continue
        bc = re.search(r'<div class="bc">(.*?)</div>', h, re.S)
        parts = [p.strip() for p in re.sub('<[^>]+>','',bc.group(1)).split('›')] if bc else []
        if len(parts) < 4:
            skipped.append(slug+'(no-region)'); continue
        region = parts[2]; suburb = parts[-1]
        if not PROSE_RE.search(h):
            skipped.append(slug+'(no-prose)'); continue
        block = build_block(slug, suburb, region)
        h2 = PROSE_RE.sub(lambda m: block, h, count=1)
        open(f, 'w', encoding='utf-8').write(h2)
        done += 1
    print("enriched:", done)
    if skipped: print("skipped:", skipped)

main()
