# Sideline Hero site redesign

**Date:** 2026-10-02
**Site:** `sites/sidelinehero` → https://sidelinehero.tommamakesthings.com
**Branch:** `sidelinehero-redesign`, on top of `sidelinehero-freemium` (`100037b`: freemium privacy policy, Terms page, FAQ pricing answer)
**Approved mockup:** `.superpowers/brainstorm/64962-1790918376/content/full-page-v2.html` (local only, git-ignored)

## Goal

Make the marketing site look modern and appealing, without it reading like a generic AI-made landing page.

Decisions already made with Tom:

1. **Keep the brand.** Same colours and the same three fonts as the app (Anton, Saira, Hanken Grotesk).
2. **Scope:** the homepage gets a new layout. FAQ, Privacy, Terms, Support and 404 share the new header, footer and type, and keep their current structure and content.
3. **Hero:** a centred headline over a fan of three phones (mockup option B).
4. **Features:** the game-day story, with a sticky phone whose screenshot changes as the steps scroll past (option C).
5. **Content sits in a capped-width container.** Background bands still run the full width.
6. **No generic patterns.** Every visual element comes from the app's own design system (`sideline-hero/docs/Design/README.md`, "Signature motifs"):
   - broadcast tag blocks, never pills
   - ruled stat-sheet rows under a 2px ink rule
   - rounded-square bib chips
   - Anton numerals for clocks
   - the Plan tab's sub-window timeline
   - concentric chalk arcs

   None of these: pill badges, icon-square cards, gradient blobs, glows, or "01/02" step numbers.
7. **Written for the freemium app** (Tom, 2026-10-02, replacing the earlier "ship before freemium off `main`" decision). The site says the app is free with ads and offers optional in-app purchases that remove ads and add new premium features as they're released. It's built on `sidelinehero-freemium`, so the privacy policy, Terms and FAQ on the same deploy already describe ads and Premium. When it deploys is decided under Rollout.

## Non-goals

- No change to the copy apart from the new strings listed under "New copy". Existing paragraphs are kept word for word.
- No FAQ search and no collapsing questions. The FAQ, Privacy and Terms content and their build logic stay as they are.
- No framework, bundler or new npm dependency. The site stays plain HTML, CSS and one small script.
- No third-party requests. `scripts/check-third-party.sh` must still pass.
- No dark mode. The brand is a light theme, and the dark bands are part of the design.
- Store badges stay unlinked until launch (existing rule).

## Layout tokens

These are added to `src/css/tokens.css`. The existing tokens stay.

| Token | Value | Use |
|---|---|---|
| `--container` | `1120px` | max content width |
| `--measure` | `40rem` | max width of running text |
| `--gutter` | `clamp(16px, 4vw, 32px)` | container side padding |
| `--dark` | `#14100B` | dark bands (app's dark-theme background) |
| `--dark-surface` | `#1E1811` | clock box on a dark band |
| `--dark-rule` | `#2E2619` | borders on a dark band |
| `--dark-ink` | `#F3EADB` | headings on a dark band |
| `--dark-body` | `#CFC4B2` | body text on a dark band (11.0:1) |
| `--dark-kicker` | `#F4B27A` | kickers on a dark band (10.4:1) |
| `--tint` | `#FCE7D5` | "window open" row (muted text on it 5.0:1) |
| `--amber-tag` | `#9A5C00` | amber broadcast tag (white text 5.4:1; the app's `#C77700` is only 3.5:1) |

**Contrast rules (all measured):**
- Orange tags use `--orange-cta` `#C2510A` as the background (white text 4.69:1), never `--orange` (3.29:1).
- The Done tag is ink on `--rule`.
- The Upcoming tag is a `--muted` outline (4.85:1 on canvas). The app's faint `#A79C8A` is never used for text (2.18:1).
- State is never shown by opacity alone, because that drops text below AA.

## Page structure (homepage, top to bottom)

`.wrap` is replaced by a `.container` class (max `--container`, side padding `--gutter`). Full-width bands are plain sections with a `.container` inside.

1. **Header** (`layout.html`, every page)
   - Ink rounded-square tile with an orange basketball glyph (inline SVG), then "Sideline Hero" in Anton.
   - Links: How it works (`/#how-it-works`), FAQ, Support.
   - An ink "Coming soon" broadcast tag. It's text, not a link.
   - A 2px ink bottom rule.
   - Sticky to the top of the screen, with the canvas colour behind it. No blur.

2. **Hero**
   - Centred. Ink tag "Coming soon · iPhone and Android", the existing h1 "Coach the game, not the subs.", the existing lede, and both store badges.
   - Below: three phones in a fan (shot-2 left, shot-3 centre and raised, shot-5 right, tilted ±7°), sitting on three concentric chalk-arc circles drawn in `--rule`.
   - A score-bug overlay near the centre phone: amber tag "Window open" next to an ink block reading "00:40" in Anton. Decorative, `aria-hidden`.

3. **The problem** (dark band)
   - Two columns: a game-clock box (kicker "Game clock" / "Q2", Anton "06:12"), then the existing first paragraph as a large Anton statement, with "Someone needs to come off." in orange.
   - The rest of the existing two paragraphs as body text in `--dark-body`.
   - The clock counts down once a second while it's on screen (see Behaviour).

4. **How it works** (`id="how-it-works"`)
   - Section head: Anton "How a game goes" over a 2px ink rule, with the kicker "Auto-plan · equal minutes" on the right.
   - Two columns: a timeline of four steps on the left, and a sticky phone on the right.
   - Each step looks like a sub window from the app's Plan tab: a time rail (kicker plus Anton time), a dot, a status tag, then the existing h2 and full existing paragraph.

   | Step | Time rail | Screenshot | Existing heading |
   |---|---|---|---|
   | 1 | `Pre-game` / `PRE` | shot-2 | Plan before the game starts |
   | 2 | `Q1` / `04:00` | shot-3 | Follow along live |
   | 3 | `Full time` / `00:00` | shot-5 | Track stats without a statistician |
   | 4 | `Season` / `G12` | shot-1 | See the season, not just the game |

   - Step states, styled like the Plan tab:
     - **Done:** ink-on-rule tag, filled muted dot, heading in `--muted`.
     - **Window open:** orange tag, orange dot, `--tint` row.
     - **Next:** ink outline tag, ink outline dot.
     - **Upcoming:** muted outline tag, muted outline dot.

5. **Built for youth basketball** (stat sheet)
   - A real `<table>` with a 2px ink rule under its header row. The header is "Built for youth basketball".
   - Each row has a bib chip, a label with a muted note, and a value tag on the right.
   - Rows use the **freemium copy** from `sidelinehero-freemium`'s `index.html`, plus a Premium row. The Premium wording is the app's own `PREMIUM_BENEFITS` string (`sideline-hero/src/features/premium/premiumCopy.ts`), word for word. That file's rule applies here too: never name an unbuilt feature, and this sentence is the only future-value wording. No prices on the site, because they're set per store and region.

   | Bib | Label | Note | Value |
   |---|---|---|---|
   | 5 | Rosters | flexible game formats | Anton "5 to 12" |
   | 0 | Game day works offline | plan and run a game with no connection | ink tag "Offline" |
   | 0 | No account | no login, no password | ink tag "None" |
   | 0 | Your team data stays on your device | no analytics, no tracking | ink tag "None" |
   | $ | Free to download | the free version shows ads | orange tag "Free" |
   | P | Premium, an optional in-app purchase | No ads, plus new premium features as they're released. Yearly subscription or one-time lifetime purchase. | ink tag "Optional" |

   - The existing "Built for youth basketball" paragraph is dropped. Its facts become the table heading and the rosters row. Tom approved this in the mockup review.
   - `shot-4.png` is no longer used. The file stays in `img/`.

6. **Full time** (dark band): kicker "Full time", an Anton line (see New copy) on the left, and both store badges on the right.

7. **Footer** (`layout.html`): a 2px ink top rule, "Sideline Hero · made by tommamakesthings." in muted text, and links to Privacy, Terms, FAQ and Support (the freemium branch's footer already has Terms).

**Inner pages:** same header and footer, content in a `--measure`-wide column inside the container. Headings get the new type scale. The FAQ table of contents and topics move from a card to ruled rows: each group heading sits over a 2px ink rule, and questions are separated by hairlines, like the app's Help screen. The privacy page keeps its separate site-policy panel. Support's email card becomes a ruled block. 404 keeps its text.

## Responsive behaviour

The breakpoint is `720px`. Everything is laid out mobile-first.

- **Header:** wordmark plus the three links. The "Coming soon" tag is hidden under 720px so the row fits at 360px.
- **Hero:** h1 `clamp(2.75rem, 9vw, 4.75rem)`. The fan scales: phone widths in `vw` with a cap, tilt reduced to ±5° under 720px.
- **Problem band:** the clock box sits above the text.
- **How it works:** one column. No sticky phone. Each step shows its own screenshot inline under its text, at max 260px wide. Status tags are static.
- **Stat sheet:** stays a table. The note drops onto its own line.
- **Full time band:** stacks, with the badges under the line.

## Behaviour (`src/js/site.js`)

This is one plain script, loaded with `<script src="/js/site.js" defer>`, under 100 lines, and it only runs on the homepage (it exits early when the elements aren't there). `build.mjs` copies the `js` directory next to `css`, `fonts` and `img`.

1. **Story steps.** An `IntersectionObserver` on the four steps marks the step nearest the middle of the screen as active. Earlier steps become Done, the active step becomes Window open, the next one becomes Next, and the rest become Upcoming. It sets `data-state` on each step and swaps the sticky phone's screenshot with a crossfade between two stacked `<img>`s. The screenshots are already on the page (each step's inline image), so nothing new is downloaded.
2. **Game clock.** An `IntersectionObserver` starts a 1-second countdown from 06:12 while the clock is on screen and stops it when it's off. At 00:00 it holds.
3. **Reduced motion.** When `prefers-reduced-motion: reduce` is set, the clock doesn't tick and the phone swaps without the crossfade. Step states still update, because that's state and not motion.
4. **No JavaScript.** The page is complete without the script. Steps render in the mockup's static states (Done, Window open, Next, Upcoming). On desktop the sticky phone shows shot-3, and every step's inline screenshot stays available through the mobile layout.

**Accessibility:**
- Status tags and the clock are decorative: `aria-hidden="true"`, and the clock has no live region.
- The step headings stay real `h2`s in order.
- Keyboard focus is visible on every link: a 2px `--orange` outline (3.29:1, above the 3:1 non-text minimum).
- Images keep their current alt text and get `width`/`height` (840×1818) to stop layout shift. Everything below the hero gets `loading="lazy"`.

## New copy (approved by Tom 2026-10-02: the "Proposed" column)

These follow the voice rules: plain words, no slogans, no em or en dashes.

| Where | Proposed | Plainer alternative |
|---|---|---|
| Hero tag | Coming soon · iPhone and Android | Coming soon |
| Header tag | Coming soon | (same) |
| How it works heading | How a game goes | How it works |
| How it works kicker | Auto-plan · equal minutes | (drop) |
| Stat sheet rows | as in the table above (freemium branch copy, split into label and note) | n/a |
| Price rows (NEW, not yet approved) | "Free to download" · "the free version shows ads" · "Premium, an optional in-app purchase" · "Yearly subscription or one-time lifetime purchase." (the benefits sentence is the app's own, unchanged) | n/a |
| Full time line | Ready for your next game. | Coming soon to iPhone and Android. |
| Decorative | "Window open", "00:40", "Game clock", "Q2", "06:12", step time rails | n/a |

## Files touched

| File | Change |
|---|---|
| `sites/sidelinehero/src/css/tokens.css` | add layout and dark tokens above |
| `sites/sidelinehero/src/css/site.css` | rewrite: container, header, footer, type scale, tags, bib chip, ruled rows; homepage sections; inner-page and FAQ ruled styles; responsive rules |
| `sites/sidelinehero/src/layout.html` | new header and footer, `.container`, script tag |
| `sites/sidelinehero/src/index.html` | new homepage markup (copy unchanged apart from the New copy table) |
| `sites/sidelinehero/src/js/site.js` | new |
| `sites/sidelinehero/src/support.html`, `404.html` | swap classes only (`card` → ruled block, etc.) |
| `build.mjs` | copy `js/`. FAQ markup: `card faq-contents` → ruled contents block |
| `.gitignore` | add `.superpowers/` |

The privacy and terms Markdown, `faqs-*.json`, the FAQ build logic and the scripts don't change.

## Testing

- `node --test scripts/faqs.test.mjs` passes. `node build.mjs sidelinehero` succeeds. `./scripts/check-third-party.sh` passes against the new `dist/`.
- **Visual check** of the built site, served locally, in Chrome at 360, 768, 1280 and 1920 px: every page, the sticky header, story step changes and the screenshot swap while scrolling, the clock ticking and stopping.
- **Reduced motion** (DevTools emulation): the clock stays still and the phone swaps without a crossfade.
- **JavaScript off:** the homepage is complete and readable.
- **Keyboard only:** tab through the header, body links and footer, with focus visible everywhere.
- **No horizontal scroll** at 360px on any page.
- Contrast pairs as listed under Layout tokens.

## Rollout

1. Build locally and share the URL with Tom for review on desktop and phone (LAN).
2. Tom approves → commit on `sidelinehero-redesign`.
3. **Deploy timing is Tom's call** (open question below). Going live means merging into `main` and pushing, which publishes the redesign *and* everything on `sidelinehero-freemium` at once: the ads and Premium privacy policy, the new `/terms` page and the FAQ pricing answer. GitHub Actions builds, gates on `check-third-party`, syncs to S3, invalidates CloudFront, and runs `smoke.sh`. Watch the run, then load `/`, `/terms` and `/privacy` live.

**Open question for Tom:** deploy as soon as the redesign is approved, or hold until the store launch? A point in favour of now: the freemium app builds already in testers' hands link to `https://sidelinehero.tommamakesthings.com/terms` from the Premium card, and that URL is a 404 on the live site today (checked 2026-10-02).
