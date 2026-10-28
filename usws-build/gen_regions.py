#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enrich thin region landing pages with an article-correct region-level prose + FAQ
section, inserted after the hero. Skips region pages that already have a FAQ
(class="rfaq"), e.g. Northern Beaches, North Shore, Hornsby."""
import re, os, sys, html, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gen_suburbs import FLAV, RFAQ_STYLE  # bullets + style only

ROOT = pathlib.Path(__file__).resolve().parent.parent / "usws-site"

# slug -> (display name, area phrase for "across __"/"in __", flavour)
REGIONS = {
 'eastern-suburbs':('Eastern Suburbs','the Eastern Suburbs','coastal_urban'),
 'inner-west':('Inner West','the Inner West','urban'),
 'inner-city':('Inner City','the Inner City','urban'),
 'the-hills':('The Hills','The Hills','family'),
 'ryde-and-macquarie':('Ryde & Macquarie','Ryde & Macquarie','general'),
 'parramatta':('Parramatta','Parramatta','general'),
 'sutherland-shire':('Sutherland Shire','the Sutherland Shire','coastal'),
 'st-george':('St George','the St George area','general'),
 'canterbury-bankstown':('Canterbury-Bankstown','Canterbury-Bankstown','general'),
 'liverpool':('Liverpool','Liverpool','general'),
 'western-sydney':('Western Sydney','Western Sydney','growth'),
 'penrith':('Penrith','Penrith','growth'),
 'campbelltown':('Campbelltown','Campbelltown','growth'),
 'north-shore':('North Shore','the North Shore','leafy'),
}

REGION_OPEN = {
 'coastal':"Across {area}, most of our work is coastal — sloping blocks, sandstone, sandy soils and salt air, from {subs} and beyond. We design and build decks, paving, retaining walls, turf and full gardens throughout {area}, with marine-grade fixings, salt-tolerant planting and materials made to last near the water.",
 'coastal_urban':"Landscaping in {area} means working with compact, characterful blocks and coastal conditions — terraces, courtyards, pool surrounds and sloping sites, from {subs} down to the water. We build outdoor spaces across {area} that make the most of tight space, with finishes and planting made for the coast.",
 'urban':"Across {area}, it's terraces, courtyards and compact blocks where every metre counts — from {subs} and beyond. We design and build courtyards, paving, decks, screens and small gardens throughout {area}, making tight inner-city spaces work and suit the character of each street.",
 'family':"Across {area}, the backyard is where families live — bigger blocks, newer homes and pools, from {subs} and beyond. We build low-maintenance family yards, pool surrounds and alfresco areas, driveways and full gardens throughout {area}, built to last and to add real value.",
 'growth':"{area} is growing fast, with new estates and family homes across {subs} and beyond. We help homeowners turn bare or tired blocks into finished outdoor spaces — driveways, turf, retaining, paving and gardens — right across {area}, for one clear fixed price.",
 'leafy':"Across {area}, gardens are established, leafy and set on sloping, sandstone blocks — from {subs} and beyond. We build sandstone retaining and terracing, courtyards, driveways, decks and planting that suit {area}, working cleanly around established trees.",
 'general':"We're a local landscaping team right across {area} — from {subs} and beyond. Decking, paving, concreting, retaining walls, drainage and turf for homes and businesses, all handled by one licensed crew for one clear fixed price.",
}

REGION_VALUE = ("One licensed team handles the whole job across {area} — no juggling trades. "
 "You get a free on-site visit, a clear fixed written price, clean workmanship and a finish built to "
 "Australian standards. We're licensed (NSW Lic. 293802C), fully insured, and reachable any time on 0434 449 997.")

REGION_FAQ = {
 'coastal':[("Do you work on sloping and coastal blocks in {area}?","Yes — retaining, terracing, steps and drainage on sloping and sandy blocks are a big part of our work across {area}, quoted as a fixed price after a free on-site visit."),
  ("Will the materials handle the salt air?","Yes. We use marine-grade fixings and finishes chosen for coastal exposure, so decks, screens and paving near the water don't rust, fret or fail early."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 'coastal_urban':[("Can you landscape a small courtyard or terrace in {area}?","Absolutely — compact courtyards, terraces and side returns are some of our most common jobs across {area}. We make small spaces feel bigger and easier to maintain."),
  ("Do you do pool surrounds in {area}?","Yes — coping, paving, decking and poolside planting, built with non-slip, salt-resistant finishes and designed as one finished space."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit; the written fixed-price quote usually follows within one business day.")],
 'urban':[("Can you landscape a small courtyard or terrace in {area}?","Absolutely — compact courtyards, terraces and side returns are some of our most common jobs across {area}. We make small inner-city spaces feel bigger and easier to look after."),
  ("Is access a problem on tight inner-city blocks?","Rarely — we're used to working with limited access, protecting the property and keeping the site clean in built-up streets."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit; the written fixed-price quote usually follows within one business day.")],
 'family':[("Do you do pool surrounds and alfresco areas in {area}?","Yes — pool landscaping, coping, paving, decks and outdoor entertaining areas are some of our most popular jobs across {area}, designed and built as one finished space."),
  ("Can you landscape a new-build home in {area}?","Yes — full landscaping for new builds is a core job: driveways, turf, retaining, paving and gardens, from a bare block to a finished yard."),
  ("Is heavy clay soil a problem in {area}?","No, but it has to be built for. We set up proper drainage and base prep for clay soil so lawns, paving and retaining hold up and yards don't waterlog.")],
 'growth':[("Can you landscape a new-build or new-estate home in {area}?","Yes — that's a lot of what we do: driveways, turf, retaining, paving and gardens, from a bare block to a finished yard, for one fixed price."),
  ("Do you fix drainage and clay-soil problems in {area}?","Yes — poor drainage and heavy clay are common on new-estate blocks. We set up proper falls, ag-lines and base prep so yards don't waterlog."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
 'leafy':[("Can you work around established trees?","Yes — we build carefully around mature trees and existing gardens, protect the site as we go, and leave it clean."),
  ("Do you build retaining and terracing on sloping blocks in {area}?","Yes — sandstone, block and timber retaining, steps and terracing on sloping and sandstone blocks are core to our work across {area}."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit; the written fixed-price quote usually follows within one business day.")],
 'general':[("What outdoor work do you do in {area}?","The whole job — landscaping, decking, concreting, paving, retaining walls, drainage and turf — all by one licensed team, so there's no juggling trades."),
  ("Do you do commercial work in {area}?","Yes — homes and businesses, from a single garden to larger commercial landscaping, paving and concreting projects."),
  ("How soon can you quote in {area}?","Call 0434 449 997 and we'll book a free on-site visit to suit you; the written fixed-price quote usually follows within one business day.")],
}

HERO_RE = re.compile(r'(<section class="hero">.*?</section>)', re.S)

def subs_from_chips(h):
    m = re.search(r'<div class="chips">(.*?)</div>', h, re.S)
    if not m: return ""
    names = re.findall(r'>([^<>]+)</a>', m.group(1))
    names = [n.strip() for n in names if n.strip() and 'All ' not in n and '→' not in n]
    return ", ".join(names[:4])

def build_section(name, area, flavour, subs):
    op = REGION_OPEN[flavour].format(area=area, subs=subs or area)
    val = REGION_VALUE.format(area=area)
    bullets = "".join("<li>%s</li>" % b for b in FLAV[flavour]['bullets'])
    prose = '<div class="prose"><p>%s</p><p>%s</p><ul>%s</ul></div>' % (op, val, bullets)
    faqs = REGION_FAQ[flavour]
    faq_html = "".join('<details%s><summary>%s</summary><p>%s</p></details>'
                       % (' open' if i==0 else '', q.format(area=area), a.format(area=area))
                       for i,(q,a) in enumerate(faqs))
    return ('\n<section class="sec"><div class="wrap">%s'
            '<span class="kick">%s landscapers</span>'
            '<h2 class="sh2">Landscaping across %s</h2>%s'
            '<h3 style="margin-top:28px;font-size:20px">Common questions &mdash; %s</h3>'
            '<div class="rfaq">%s</div></div></section>'
            % (RFAQ_STYLE, html.escape(name), html.escape(area), prose, html.escape(name), faq_html))

def main():
    done=[]; skipped=[]
    for slug,(name,area,flavour) in REGIONS.items():
        f = ROOT / 'areas' / (slug+'.html')
        if not f.exists(): skipped.append(slug+'(missing)'); continue
        h = f.read_text(encoding='utf-8')
        if 'class="rfaq"' in h: skipped.append(slug+'(already)'); continue
        if not HERO_RE.search(h): skipped.append(slug+'(no-hero)'); continue
        section = build_section(name, area, flavour, subs_from_chips(h))
        f.write_text(HERO_RE.sub(lambda m: m.group(1)+section, h, count=1), encoding='utf-8')
        done.append(slug)
    print("enriched regions:", len(done), done)
    if skipped: print("skipped:", skipped)

main()
