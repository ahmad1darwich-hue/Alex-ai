#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate premium service pages for usws.com.au using the approved homepage design.
Reuses the homepage CSS (extracted from index.html) so every page is visually consistent."""
import re, os, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "usws-site"
CDN = "https://cdn.jsdelivr.net/gh/ahmad1darwich-hue/Alex-ai@a40baa55691e5c03c5796d2edf3b8db71e619e7b/usws-assets/img"

# --- reuse the exact homepage CSS for a consistent look ---
home = (ROOT / "index.html").read_text(encoding="utf-8")
CSS = re.search(r"<style>(.*?)</style>", home, re.S).group(1)
EXTRA_CSS = """
/* interior page bits */
.crumb{font-size:13px;color:#cfe0d8;margin-bottom:6px}
.crumb a{color:#cfe0d8;text-decoration:none}.crumb a:hover{color:#fff}
.svchero .wrap{padding:48px 0 54px}
@media(min-width:900px){.svchero .wrap{padding:64px 0 72px}}
.prose{max-width:68ch}.prose p{margin-top:16px;font-size:16.5px}
.incl{display:grid;gap:10px 28px;margin-top:22px}
@media(min-width:620px){.incl{grid-template-columns:1fr 1fr}}
.incl .ck{margin-top:0}
.twocol{display:grid;gap:30px;align-items:center}
@media(min-width:900px){.twocol{grid-template-columns:1.05fr .95fr;gap:52px}}
.twocol .shot{border-radius:var(--r);overflow:hidden;aspect-ratio:4/3;border:1px solid var(--line);box-shadow:var(--sh)}
.twocol .shot img{width:100%;height:100%;object-fit:cover}
"""

GTAG = """<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18469296336"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-18469296336');
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href^="tel:"]'):null;if(!a)return;try{gtag('event','conversion',{'send_to':'AW-18469296336/k9FBCLr9gasdENCx7OZE','transport_type':'beacon'});}catch(_){}},true);</script>"""

STRIP = """<div class="strip"><div class="wrap">
<div>\U0001F4DE <a href="tel:+61434449997">0434 449 997</a><span class="x"> &nbsp;·&nbsp; 0414 922 246 &nbsp;·&nbsp; Northern Beaches · North Shore · Sydney-wide</span></div>
<div class="r"><span>NSW Lic. 293802C</span><span>Fully insured</span><span>Open 24/7</span></div>
</div></div>"""

HEADER = """<header><div class="wrap nav">
<a class="logo" href="/"><span class="mk">\U0001F33F</span><span><b>USWS</b><small>Urban Sydney Wide</small></span></a>
<nav class="nl"><a href="/#services">Services</a><a href="/#work">Our work</a><a href="/#process">Process</a><a href="/#areas">Areas</a><a href="/#faq">FAQ</a></nav>
<a class="hcall" href="tel:+61434449997">\U0001F4DE 0434 449 997</a>
<a class="btn btn-gold hquote" href="#quote">Free quote</a>
</div></header>"""

STICKY = """<div class="sticky">
<a class="btn btn-p" href="tel:+61434449997">\U0001F4DE Call now</a>
<a class="btn btn-gold" href="#quote">Free quote</a>
</div>"""

FORMJS = """<script>
document.getElementById('yr').textContent=new Date().getFullYear();
Array.prototype.forEach.call(document.querySelectorAll('form.qf'),function(f){
f.addEventListener('submit',function(e){
e.preventDefault();
var g=function(k){var el=f.querySelector('[name="'+k+'"]');return el?(el.value||'').trim():''};
var n=g('n'),p=g('p'),s=g('s'),sv=g('sv'),d=g('d'),m=f.querySelector('.sent');
if(!n||!p||!s){m.hidden=false;m.textContent='Please add your name, mobile and suburb so we can get back to you.';return;}
var t='Hi USWS, I would like a free quote.\\n\\nName: '+n+'\\nMobile: '+p+'\\nSuburb: '+s+'\\nService: '+sv+(d?('\\nDetails: '+d):'')+'\\n\\n(Feel free to attach photos of your space to this email.)';
try{gtag('event','generate_lead',{'send_to':'AW-18469296336'});}catch(_){}
window.location.href='mailto:info@usws.com.au?subject='+encodeURIComponent('Free quote request - '+s+' - '+sv)+'&body='+encodeURIComponent(t);
m.hidden=false;
m.innerHTML='Opening your email app… if it does not open, call us on <a href="tel:+61434449997">0434 449 997</a> or <a href="tel:+61414922246">0414 922 246</a>, or email <a href="mailto:info@usws.com.au">info@usws.com.au</a>.';
});
});
</script>"""

def footer(slug):
    return """<footer><div class="wrap">
<div class="fgrid">
<div>
<a class="logo" href="/"><span class="mk">\U0001F33F</span><span><b>USWS</b><small>Urban Sydney Wide Solutions</small></span></a>
<p style="margin-top:16px;max-width:40ch">Coastal landscape design &amp; construction for the Northern Beaches and North Shore — retaining walls, decking, paving, drainage, turf and full garden builds, Sydney-wide.</p>
</div>
<div><h4>Services</h4><div class="fl"><a href="/services/landscape-design">Landscape design &amp; construction</a><a href="/services/retaining-walls">Retaining walls</a><a href="/services/decking">Decking &amp; pergolas</a><a href="/services/paving">Paving &amp; driveways</a><a href="/services/turf">Turf &amp; lawns</a><a href="/services/drainage">Drainage &amp; stormwater</a></div></div>
<div><h4>Areas</h4><div class="fl"><a href="/areas/northern-beaches">Northern Beaches</a><a href="/areas/north-shore">North Shore</a><a href="/areas/hornsby">Hornsby</a><a href="/areas/ryde-and-macquarie">Ryde &amp; Macquarie</a><a href="/areas">All service areas</a></div></div>
<div><h4>Get in touch</h4><div class="fl"><a href="tel:+61434449997">\U0001F4DE 0434 449 997</a><a href="tel:+61414922246">\U0001F4DE 0414 922 246</a><a href="mailto:info@usws.com.au">✉️ info@usws.com.au</a><span>\U0001F552 Open 24 hours, 7 days</span></div></div>
</div>
<div class="cr">© <span id="yr"></span> Urban Sydney Wide Solutions · Landscaping · Decking · Concreting · Paving · Retaining Walls · Drainage · Turf · Northern Beaches · North Shore · Sydney-wide · NSW Lic. 293802C · ABN 20 386 532 878 · usws.com.au</div>
</div></footer>"""

def quote_card():
    return """<div class="fc flat" id="quote">
<h3>Get your free quote</h3>
<div class="s">Tell us a few details and we'll call you back to book a free site visit.</div>
<div class="badges"><span>Free site visit</span><span>Fixed-price quote</span><span>Reply within 1 business day</span></div>
<form class="frm qf" novalidate>
<div class="r2"><div><label>Name</label><input name="n" autocomplete="name"></div><div><label>Mobile</label><input name="p" type="tel" autocomplete="tel" inputmode="tel"></div></div>
<div class="r2"><div><label>Suburb</label><input name="s"></div><div><label>Service</label><select name="sv"><option>Landscape design &amp; construction</option><option>Retaining walls</option><option>Decking / pergola</option><option>Paving / driveway</option><option>Concreting</option><option>Drainage</option><option>Turf / lawn</option><option>Pool landscaping</option><option>Something else</option></select></div></div>
<button type="submit" class="btn btn-p btn-lg btn-block">Send quote request</button>
<div class="fnote">Opens your email app with your details ready. Prefer to talk? Call 0434 449 997.</div>
<div class="sent" hidden></div>
</form>
</div>"""

PROCESS = """<section class="sec cream" id="process"><div class="wrap">
<div class="hd"><span class="kick">How it works</span><h2>A clear path from first call to finished job</h2></div>
<div class="proc">
<div class="pc"><b>1</b><h4>Call or send details</h4><p>Tell us what you're after. We book a free on-site visit at a time that suits you.</p></div>
<div class="pc"><b>2</b><h4>Free site visit &amp; fixed quote</h4><p>We measure up, talk through materials and timing, and send a clear fixed-price quote in writing.</p></div>
<div class="pc"><b>3</b><h4>We build it properly</h4><p>Our own licensed team does the work on schedule, protects your property and keeps you updated.</p></div>
<div class="pc"><b>4</b><h4>Clean up &amp; hand over</h4><p>We leave the site clean, walk you through the finished space, and back it with our workmanship guarantee.</p></div>
</div>
</div></section>"""

# relate chips (other services)
ALL = [
    ("landscape-design","Landscape design"),
    ("retaining-walls","Retaining walls"),
    ("decking","Decking &amp; pergolas"),
    ("paving","Paving &amp; driveways"),
    ("concreting","Concreting"),
    ("turf","Turf &amp; lawns"),
    ("drainage","Drainage &amp; stormwater"),
    ("pool-landscaping","Pool landscaping"),
]

def related(slug):
    chips = "".join(f'<a href="/services/{s}">{n}</a>' for s,n in ALL if s!=slug)
    return chips

def page(sv):
    slug=sv["slug"]
    figs=[]
    for i,(img,alt,cap) in enumerate(sv["gallery"]):
        cls=' class="big"' if i==0 else ''
        figs.append('<figure%s><img loading="lazy" src="%s/%s" alt="%s"><figcaption>%s</figcaption></figure>'%(cls,CDN,img,html.escape(alt),cap))
    g="".join(figs)
    incl = "".join(f"<li>{x}</li>" for x in sv["included"])
    faqs = "".join(f"<details{' open' if i==0 else ''}><summary>{q}</summary><p>{a}</p></details>" for i,(q,a) in enumerate(sv["faqs"]))
    schema = ('{"@context":"https://schema.org","@type":"Service","serviceType":"%s","provider":{"@type":"LandscapingBusiness","name":"Urban Sydney Wide Solutions","telephone":"+61434449997","url":"https://usws.com.au"},"areaServed":[{"@type":"Place","name":"Northern Beaches"},{"@type":"Place","name":"North Shore"},{"@type":"City","name":"Sydney"}],"url":"https://usws.com.au/services/%s"}'
              % (sv["schema_type"], slug))
    bc = ('{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
          '{"@type":"ListItem","position":1,"name":"Home","item":"https://usws.com.au/"},'
          '{"@type":"ListItem","position":2,"name":"Services","item":"https://usws.com.au/#services"},'
          '{"@type":"ListItem","position":3,"name":"%s","item":"https://usws.com.au/services/%s"}]}' % (sv["name"], slug))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Google tag (gtag.js) — Google Ads conversion tracking -->
{GTAG}
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap">
<title>{sv["title"]}</title>
<meta name="description" content="{html.escape(sv["meta"])}">
<link rel="canonical" href="https://usws.com.au/services/{slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="{html.escape(sv["name"])} — Urban Sydney Wide Solutions">
<meta property="og:description" content="{html.escape(sv["meta"])}">
<meta property="og:url" content="https://usws.com.au/services/{slug}">
<meta property="og:image" content="{CDN}/{sv['hero']}">
<meta property="og:site_name" content="Urban Sydney Wide Solutions">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{schema}</script>
<script type="application/ld+json">{bc}</script>
<style>{CSS}{EXTRA_CSS}</style>
</head>
<body>
<span id="top"></span>
{STRIP}
{HEADER}

<section class="hero svchero" style="--heroimg:url('{CDN}/{sv['hero']}')"><div class="wrap hg">
<div>
<div class="crumb"><a href="/">Home</a> &rsaquo; <a href="/#services">Services</a> &rsaquo; {sv["name"]}</div>
<span class="pill">\U0001F30A Northern Beaches &amp; North Shore specialists</span>
<h1>{sv["h1"]}<em>{sv["h1sub"]}</em></h1>
<p class="sub">{sv["hero_sub"]}</p>
<div class="htrust"><span>✅ <b>20+ years</b> in Sydney</span><span>\U0001FAAA <b>NSW Lic.</b> 293802C</span><span>\U0001F6E1️ <b>Fully</b> insured</span></div>
<div class="hcta">
<a class="btn btn-gold btn-lg" href="tel:+61434449997">\U0001F4DE Call 0434 449 997</a>
<a class="btn btn-ghost btn-lg" href="#quote">Get a free quote</a>
</div>
</div>
{quote_card()}
</div></section>

<section class="sec"><div class="wrap">
<div class="twocol">
<div class="prose"><span class="kick">{sv["name"]}</span><h2>{sv["intro_h"]}</h2>{sv["intro"]}
<ul class="ck incl">{incl}</ul>
<div style="margin-top:26px"><a class="btn btn-p btn-lg" href="#quote">Get a free fixed-price quote</a></div>
</div>
<div class="shot"><img loading="lazy" src="{CDN}/{sv['shot']}" alt="{html.escape(sv['shot_alt'])}"></div>
</div>
</div></section>

<section class="sec cream"><div class="wrap">
<div class="hd"><span class="kick">Why a coastal specialist</span><h2>{sv["coastal_h"]}</h2></div>
<div class="split">
<div class="card"><div class="ic">\U0001F30A</div><h4>Built for coastal conditions</h4><p>{sv["coastal1"]}</p></div>
<div class="card"><div class="ic">\U0001F4D0</div><h4>Done properly, built to last</h4><p>{sv["coastal2"]}</p></div>
<div class="card"><div class="ic">\U0001F91D</div><h4>One accountable local team</h4><p>{sv["coastal3"]}</p></div>
</div>
</div></section>

<section class="sec" id="work"><div class="wrap">
<div class="hd"><span class="kick">Our work</span><h2>Recent {sv["gal_word"]} projects</h2><p class="lead">Built by our own team across the Northern Beaches, North Shore and Sydney.</p></div>
<div class="gal">{g}</div>
<div class="workcta"><a class="btn btn-p btn-lg" href="tel:+61434449997">\U0001F4DE Call 0434 449 997</a><a class="btn btn-o btn-lg" href="/gallery">View the full gallery →</a></div>
</div></section>

{PROCESS}

<section class="sec"><div class="wrap">
<div class="hd center"><span class="kick" style="justify-content:center">Good to know</span><h2>{sv["name"]} — common questions</h2></div>
<div class="faq">{faqs}</div>
</div></section>

<section class="sec cream"><div class="wrap">
<div class="hd"><span class="kick">More of what we do</span><h2>Other services</h2></div>
<div class="chips">{related(slug)}<a class="all" href="/#services">All services</a></div>
<p class="lead" style="margin-top:24px;font-size:15px;color:var(--muted)">Popular areas for {sv["gal_word"]}:</p>
<div class="chips"><a href="/areas/northern-beaches">Northern Beaches</a><a href="/areas/north-shore">North Shore</a><a href="/areas/manly">Manly</a><a href="/areas/dee-why">Dee Why</a><a href="/areas/mona-vale">Mona Vale</a><a href="/areas/mosman">Mosman</a><a href="/areas/chatswood">Chatswood</a><a href="/areas/frenchs-forest">Frenchs Forest</a><a class="all" href="/areas">All areas</a></div>
</div></section>

<section class="sec" id="contact"><div class="wrap">
<div class="cg">
<div>
<span class="kick">Get in touch</span>
<h2>Ready for a free quote?</h2>
<p class="lead">The fastest way is a quick call — we'll book your free on-site visit on the spot. Prefer to write? Send the form and we'll come back to you within one business day.</p>
<div class="callrow">
<a class="btn btn-p btn-lg" href="tel:+61434449997">\U0001F4DE Call 0434 449 997</a>
<a class="btn btn-o btn-lg" href="tel:+61414922246">\U0001F4DE Call 0414 922 246</a>
</div>
<div style="margin-top:18px">
<div class="cm"><span class="ic">✉️</span><div><div class="l">Email</div><a class="v" href="mailto:info@usws.com.au">info@usws.com.au</a></div></div>
<div class="cm"><span class="ic">\U0001F552</span><div><div class="l">Hours</div><div class="v">Open 24 hours, 7 days</div></div></div>
<div class="cm"><span class="ic">\U0001F4CD</span><div><div class="l">Service area</div><div class="v">Northern Beaches, North Shore &amp; Sydney metro</div></div></div>
</div>
</div>
<div class="fc flat">
<h3>Request a free quote</h3>
<div class="s">Fill in a few details and we'll get back to you within one business day.</div>
<form class="frm qf" novalidate>
<div class="r2"><div><label>Name</label><input name="n" autocomplete="name"></div><div><label>Mobile</label><input name="p" type="tel" autocomplete="tel" inputmode="tel"></div></div>
<div class="r2"><div><label>Suburb</label><input name="s"></div><div><label>Service</label><select name="sv"><option>{sv["name"]}</option><option>Landscape design &amp; construction</option><option>Retaining walls</option><option>Decking / pergola</option><option>Paving / driveway</option><option>Concreting</option><option>Drainage</option><option>Turf / lawn</option><option>Pool landscaping</option><option>Something else</option></select></div></div>
<div><label>Tell us about the project <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea name="d" placeholder="{html.escape(sv['placeholder'])}"></textarea></div>
<button type="submit" class="btn btn-p btn-lg btn-block">Send quote request</button>
<div class="fnote">Opens your email app with your details ready — you can attach photos there.</div>
<div class="sent" hidden></div>
</form>
</div>
</div>
</div></section>

{footer(slug)}
{STICKY}
{FORMJS}
</body>
</html>"""

# give the service hero its own background image via the --heroimg var
EXTRA_CSS += "\n.svchero::before{background:var(--heroimg) center/cover no-repeat}"

exec(open(pathlib.Path(__file__).resolve().parent / "services_data.py", encoding="utf-8").read())

out = ROOT / "services"
out.mkdir(exist_ok=True)
for sv in SERVICES:
    (out / (sv["slug"]+".html")).write_text(page(sv), encoding="utf-8")
    print("wrote services/"+sv["slug"]+".html")
print("done:", len(SERVICES), "service pages")
