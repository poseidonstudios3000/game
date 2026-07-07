# Simple Utility Websites (Image/Video Compression & Conversion): Strategy Notes

Research into the business viability of building a site in the "simple utility tool"
niche — image compression, format conversion, PDF tools, background removal, etc. —
occupied today by TinyPNG, Squoosh, CloudConvert, iLoveIMG, Convertio, Remove.bg,
FreeConvert, TinyWow, and similar.

Three questions: (1) how hard is it to build, (2) can a new site win on SEO/GEO
against entrenched incumbents, (3) can it be monetized.

---

## 1. Technical difficulty

**Image/PDF/simple-format tools: low difficulty, effectively free to host.**

- Google's Squoosh proved the reference architecture: native C/C++ codecs (MozJPEG,
  OxiPNG, WebP, AVIF) compiled to WebAssembly via Emscripten, run entirely client-side
  in Web Workers — images never leave the browser, zero server compute.
- [jSquash](https://github.com/jamsinclair/jSquash) packages those exact codecs
  (MozJPEG, WebP, AVIF, resize, Oxipng) as ready-to-use npm packages. An indie
  developer can `npm install` production-grade compression/conversion instead of
  building a codec toolchain from scratch. Licensing is a non-issue: the wrapper is
  Apache-2.0 and the underlying codecs are BSD/MIT-family — no GPL encumbrance (unlike
  older tools such as pngquant/libimagequant), no royalty cost for commercial use.
- Tradeoff: WASM-in-browser is slower than native. Sharp (Node binding to libvips) is
  **8.3x faster than wasm-vips for JPEG, 3.6x for PNG, 2.2x for WebP**
  ([sharp docs](https://sharp.pixelplumbing.com/performance/)). Many production tools
  run hybrid: client-side WASM for the "instant, private, nothing-uploaded" consumer
  tool, server-side Sharp/libvips for batch or API workloads.

**Video is a different, harder problem.**

- ffmpeg.wasm hits a hard architectural ceiling: WASM sandboxing blocks GPU/hardware
  encoder access and constrains multi-threading — roughly **40fps at 720p vs. ~500fps
  for native server-side FFmpeg** on the same hardware. A real video conversion/
  compression product cannot go fully client-side; it needs server-side compute.
- That flips the cost model: server-side video processing means real, ongoing infra
  cost — compute plus egress bandwidth for large files. Storage/CDN choice matters a
  lot here (zero-egress object storage like Cloudflare R2 vs. traditional S3-style
  egress pricing can differ by tens of thousands of dollars/month at volume).

**Bottom line:** an image/PDF/format-conversion tool is a days-to-weeks build for a
competent developer and is nearly free to run. A video tool is a real infrastructure
business with recurring costs — don't start there on a zero budget; add it once
revenue exists to fund the compute.

---

## 2. SEO / GEO competitiveness

**Head-term SEO: not realistically winnable from zero, at least not quickly.**

The generic-keyword SERP ("compress image online", "convert mp4 to mov", "png to
jpg") is an oligopoly of a handful of very high-authority sites:

| Site | Domain Rating | Scale |
|---|---|---|
| CloudConvert | 82 | 11.6K referring domains |
| Convertio | ~80 | — |
| FreeConvert | 76 | ~11.3M visits/month |

*(Ahrefs/Semrush estimates.)* These three alone rank top-10 for the same head terms.
A brand-new domain has no realistic path to outrank DR75-85+ sites with tens of
thousands of referring domains on head terms in the near term — that's the honest,
non-sugar-coated part.

**The real path in: long-tail + niching + a distribution hook, not head-term SEO.**

- **Programmatic long-tail pages** are the proven mechanism outside this niche too:
  Wise generates 4M+ organic visits/month from ~15K templated currency-pair landing
  pages; Zapier runs 25,000+ templated "Connect App A to App B" pages. The direct
  analogue here is a combinatorial "convert X to Y" page for every format pair you
  support — winning thousands of low-competition long-tail queries instead of 5
  hyper-competitive head terms.
- **Niching + bundling under one domain** is the recent proof point: TinyWow (PDF/
  image/AI-text tools bundled together) reached ~5M monthly visitors by consolidating
  backlinks and topical authority under one domain rather than fragmenting across
  single-purpose sites — the same structural logic practitioners on indie-maker forums
  recommend (umbrella multi-tool site > many disconnected single-tool sites).
- **Important nuance:** TinyWow's traffic is ~74% direct and only ~14% from Google —
  it grew mainly through brand/word-of-mouth/social distribution, not pure organic
  ranking. **SEO alone rarely wins this space anymore; you need a distribution hook**
  (Show HN / Reddit / Product Hunt launch, or a genuinely differentiable angle like
  "100% private, nothing ever uploaded") that also generates the backlinks SEO needs.

**GEO (AI answer-engine visibility) — where the real 2026 opportunity is, and where
it isn't:**

- **llms.txt is largely a dead end.** Google stated outright (June 2026) that it is
  *not* a ranking/visibility input for Search, AI Overviews, or AI Mode. An
  independent Ahrefs study of 137,210 domains found only ~28% even publish one, and
  **97% of published files get zero AI-crawler requests**. It's cheap to add but
  don't expect it to move any needle.
- **What does work:** AI engines (ChatGPT, Perplexity, Google AI Overviews) mostly
  don't generate "best free tool" answers from scratch — they synthesize from and
  cite existing high-authority comparison/listicle articles. One placement in a
  well-ranking "best free image compressors" roundup can cascade into citations
  across multiple AI engines at once. This is already happening: a March 2026 TechPP
  piece, "This Free Google Tool Replaced TinyPNG for Me," is exactly the comparison
  content now unseating an entrenched incumbent in AI-driven discovery.
- **Structured data** (schema.org `SoftwareApplication`/`WebApplication` markup) is
  Google's official recommendation for making tool pages machine-readable, and Bing
  has confirmed it also helps LLMs parse page content — cheap, worth doing.
- Traditional SEO fundamentals still underpin most AI-engine output (Google AI
  Overviews largely inherit organic ranking signals; ChatGPT favors comprehensive,
  well-sourced pages; Perplexity favors recent, citation-rich content) — GEO is an
  additional layer on top of SEO, not a shortcut around it.

**Bottom line:** Ranking #1 for "compress image online" against TinyPNG/CloudConvert-
tier incumbents isn't realistic soon. Winning via long-tail combinatorial pages,
niching into an underserved format/workflow, and earning placement in comparison
content that AI engines cite from — that's realistic, with 2025-2026 precedent
(TinyWow, and the indie launches below).

---

## 3. Monetization

Real, currently-operating models in this exact niche:

| Model | Example | Mechanics |
|---|---|---|
| Freemium → paid API/B2B | TinyPNG/Tinify | 500 free compressions/month via API, then paid credit tiers — the free web tool is a lead-gen funnel for the API business |
| Pay-per-use | remove.bg | ~$0.20/image after a free trial, plus subscription packs |
| Credit-based pay-as-you-go | CloudConvert | Conversion-minute credits sold to consumer and API/B2B customers alike |
| Display ads | generic | Viable on the free consumer tool, but see caveat below |
| Acquisition | Kaleido (remove.bg, Unscreen) → Canva, 2021 | Profitable from day one, **never raised outside funding**, served 100M+ users — proof a narrow, well-executed tool can become a real acquisition target without VC money |

**Ad revenue reality check:** general AdSense RPMs run roughly $1-$20 depending
heavily on niche/country/audience, with finance/insurance-tier niches ($15-$30+) far
above what a generic image/PDF-tool audience commands. Expect low-to-mid single-digit
$ RPM realistically — ads work as a secondary layer, not a standalone plan, unless
traffic volume is very large.

**Freemium conversion reality check:** industry-wide self-serve freemium converts
roughly 2-5% of free users to paid (average ~3-4%, full range 1-10%+ depending on
vertical). Real, but you need real volume (tens of thousands of monthly actives)
before the percentage becomes meaningful revenue.

**Realistic revenue spread, solo maker vs. established player** (Indie Hackers /
third-party estimates):

- A client-side image compressor reported **~$200/mo** after early organic traction —
  realistic year-one outcome for a solo maker without a viral moment.
- A "simple PDF tool" case study reported **$10K MRR**.
- iLovePDF (an established, small-team freemium player) is estimated at roughly
  **$1.4M/year** (third-party estimate, not disclosed financials).

The $1M+/year outcomes belong to sites with years of accumulated SEO/backlink moat or
genuine product differentiation — not something a zero-budget solo project should
expect in year one.

**Recommendation, ranked by effort vs. payoff for someone starting from zero:**

1. **Freemium API/B2B** (highest payoff per unit effort). Build the free web tool as
   the marketing funnel; monetize developers who need the same capability
   programmatically. This is literally the TinyPNG/CloudConvert playbook, and it
   sidesteps the hardest SEO fight — developers find you via docs/GitHub/dev-community
   word of mouth, a far less competitive channel than "compress image online."
2. **Niche pay-per-use targeting an underserved segment.** Pixian.ai's approach:
   price at 5¢/image, ~7x cheaper than remove.bg's subscription, marketed directly at
   developers annoyed by remove.bg's pricing. Competing on a specific pain point
   (pricing model, privacy, a missing format) is lower effort than out-marketing an
   incumbent on raw traffic.
3. **Display ads on the free tool** — lowest effort to turn on, lowest payoff per
   user given unremarkable RPMs for this traffic type. Layer on top of #1 or #2, not
   as a standalone plan.
4. **Pure consumer freemium subscription** (no watermark/batch/no-ads tier, à la
   Smallpdf/iLoveIMG) — works at incumbent scale but needs the traffic/SEO moat this
   report says is hardest to win from zero. Treat as a later upgrade once real traffic
   exists, not a starting strategy.

---

## Synthesis / recommendation

| Question | Verdict |
|---|---|
| Technical difficulty (image/PDF) | **Low.** Days-to-weeks, near-zero hosting cost using WASM codecs (jSquash/Squoosh-derived), permissively licensed. |
| Technical difficulty (video) | **Moderate-high** and ongoing cost. Requires server-side FFmpeg; don't start here on zero budget. |
| SEO on head terms | **Not realistic soon** against DR75-85+, tens-of-thousands-of-referring-domains incumbents. |
| SEO/GEO via long-tail + niche + listicle placement | **Realistic**, with recent precedent (TinyWow, Pixian.ai, TinyCompressor) — but requires a distribution hook (HN/Reddit/Product Hunt, or genuine differentiation), not keyword-targeting alone. |
| Monetization | **Works**, proven multiple ways — but big outcomes ($1M+/yr) take years of compounding SEO/brand or a real product edge; realistic year-one solo outcome is $0-few hundred/mo. |

**If starting from zero:** pick one narrow, currently underserved conversion/
compression niche (not "compress any image" — something specific, e.g. HEIC→JPG for
iPhone users, AVIF conversion, or a compliance-driven PDF workflow). Build it 100%
client-side (privacy angle doubles as differentiation and keeps hosting cost near
zero). Launch on Show HN/Reddit/Product Hunt for the initial backlink and traffic
bump. Add programmatic long-tail pages for every format pair supported. Ship a paid
API tier from day one even before anyone buys it. Treat display ads as a bonus, not
the plan. Avoid video processing until there's revenue to fund the server costs it
requires.

---

## Sources

- [jSquash (GitHub)](https://github.com/jamsinclair/jSquash) — WASM codec bundles, licensing
- [sharp performance docs](https://sharp.pixelplumbing.com/performance/) — server-side vs. WASM benchmarks
- [Why FFmpeg.wasm Fails to Leverage GPU Acceleration](https://dayverse.id/en/articles/why-ffmpeg-wasm-fails-leverage-gpu-acceleration/)
- [libvips for WebAssembly](https://www.libvips.org/2020/09/01/libvips-for-webassembly.html)
- [Cloudflare R2 pricing](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/)
- Ahrefs website-analytics pages: [CloudConvert](https://ahrefstop.com/websites/cloudconvert.com), [FreeConvert](https://ahrefs.com/websites/freeconvert.com), [Convertio](https://ahrefs.com/websites/convertio.co)
- [Programmatic SEO Examples (Wise, Zapier)](https://seomatic.ai/blog/programmatic-seo-examples)
- [TinyWow overview (Semrush)](https://www.semrush.com/website/tinywow.com/overview/)
- [We Analyzed 137K Sites: 97% of llms.txt Files Never Get Read (Ahrefs)](https://ahrefs.com/blog/llmstxt-study/)
- [Google Says llms.txt Will Not Help Rankings (TechWyse, June 2026)](https://www.techwyse.com/news/ai-search/google-llms-txt-no-ranking-benefit-june-2026)
- [5 GEO Strategies To Make AI Search Engines Recommend Your Brand In 2026 (Search Engine Journal)](https://www.searchenginejournal.com/geo-strategies-ai-visibility-geoptie-spa/568644/)
- [This Free Google Tool Replaced TinyPNG for Me (TechPP)](https://techpp.com/2026/03/11/squoosh-vs-tinypng/)
- [SoftwareApplication structured data (Google Search Central)](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Tinify API Pricing](https://tinify.com/pricing/api)
- [remove.bg Pricing](https://www.remove.bg/pricing)
- [CloudConvert Pricing](https://cloudconvert.com/pricing)
- [Canva acquires Kaleido (TechCrunch)](https://techcrunch.com/2021/02/24/canva-acquires-background-removal-specialists-kaleido/)
- [iLovePDF revenue estimate (Growjo)](https://growjo.com/company/iLovePDF)
- Indie Hackers: [image compressor build/revenue story](https://www.indiehackers.com/post/how-i-built-a-privacy-first-image-compressor-that-hits-lcp-2-0s-on-mobile-a3861bff70), [simple PDF tool $10K MRR](https://www.indiehackers.com/post/this-week-in-micro-saas-simple-pdf-tool-10k-mrr-revenue-and-more-9ab80ccbb5), [iLoveIMG revenue page](https://www.indiehackers.com/product/iloveimg/revenue)
- Show HN launches: [remove.bg (original)](https://news.ycombinator.com/item?id=18697601), [Pixian.ai](https://news.ycombinator.com/item?id=36064639), [TinyCompressor](https://news.ycombinator.com/item?id=46076830), [Imgsquash](https://news.ycombinator.com/item?id=20024448)
- [Highest Paying AdSense Niches 2026 (Adstimate)](https://adstimate.com/blog/highest-paying-adsense-niches.html)
- [SaaS Freemium Conversion Rates: 2026 Report (First Page Sage)](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/)
