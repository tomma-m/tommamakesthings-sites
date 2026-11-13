# Move the Sideline Hero site to sidelinehero.app

**Status 2026-11-13:** phases 1 and 2 DONE and live (cert `070feadd`, CloudFront `E2TT04WD2AYX92`, function `sidelinehero-rewrite`, site `59e938b`, support email on the site). Canonical tags (step 10) not added: the 301s cover it.

Written 2026-11-13. Tom bought `sidelinehero.app` at Cloudflare. Goal: the site lives at **https://sidelinehero.app**, and every old `https://sidelinehero.tommamakesthings.com/<path>` link keeps working forever as a 301 to the same path on the new domain.

**Why "forever":** shipped app builds (1.0 to 1.4) open `https://sidelinehero.tommamakesthings.com/terms` and `/privacy` from the Premium page (`src/features/premium/premiumCopy.ts`), and both stores, AdMob, Instagram posts and printed QR codes carry the old URL. Never delete the old hostname, its certificate or its DNS record.

## Decisions (defaults; change before step 1 if you want otherwise)

| Decision | Default |
|---|---|
| Canonical host | `sidelinehero.app` (apex). `www.sidelinehero.app` 301s to it. |
| Hosting | The **same** S3 bucket and CloudFront distribution. Add the new names to it; no second site, no change to the deploy workflow beyond the smoke test. |
| Cloudflare proxy | **Grey cloud (DNS only)**, as today. Cloudflare's proxy in front of CloudFront adds a second cache and breaks nothing we need. |
| Old hostname | Stays on the distribution, answered by a 301 to the new host, path and query kept. |
| Support email | Add `support@sidelinehero.app` with Cloudflare Email Routing (forwards to your inbox, free). Keep the old address working; switch what's published to the new one. |
| Bucket name | Leave `sidelinehero-tommamakesthings-site` as it is. It's never seen, and renaming means a migration for nothing. |

`.app` is on the browser HSTS preload list: it only ever loads over HTTPS. CloudFront already redirects HTTP to HTTPS, so that's fine, but the certificate must be live before the DNS record points anywhere.

## Phase 1 · Infrastructure (no app release, nothing public changes yet)

- [x] **1. Certificate.** ACM in **us-east-1**: request one certificate for `sidelinehero.app` and `www.sidelinehero.app`, DNS validation. Add the two validation CNAMEs in Cloudflare (`sidelinehero.app` zone, grey cloud). Wait for *Issued*.
- [x] **2. Check for an existing CloudFront Function.** `/privacy` serves without `.html`, so either a viewer-request function rewrites clean URLs or the build uploads extensionless files. Look at the distribution's behaviour → *Function associations*. If a viewer-request function exists, the redirect in step 3 goes **into that same function** (one per event per distribution); if none, step 3 creates one.
- [x] **3. Redirect in the function.** At the top of the viewer-request handler: if the `host` header isn't `sidelinehero.app`, return a 301 with `location: https://sidelinehero.app` + the URI + the query string (rebuild it from `request.querystring`). Otherwise fall through to the existing clean-URL rewrite. Test in the console's Test tab with three hosts: the old subdomain, `www.sidelinehero.app` (both 301, path kept) and `sidelinehero.app` (rewrite as today). Publish only after that.
- [x] **4. Distribution settings.** Add `sidelinehero.app` and `www.sidelinehero.app` to *Alternate domain names*. Switch the certificate to one that covers **all three** names (either re-issue step 1's cert with `sidelinehero.tommamakesthings.com` added, or a new one with all three). The old name must stay covered or old links break with a certificate error.
- [x] **5. DNS.** In the `sidelinehero.app` zone: apex `CNAME @ → d2vqjk4yncpywq.cloudfront.net` (Cloudflare flattens it) and `CNAME www → d2vqjk4yncpywq.cloudfront.net`, both **grey cloud**. Leave the `tommamakesthings.com` record alone.
- [x] **6. Check by hand.**
  - `curl -sI https://sidelinehero.app/` → 200
  - `curl -sI https://sidelinehero.app/privacy` → 200
  - `curl -sI https://www.sidelinehero.app/faq` → 301 to `https://sidelinehero.app/faq`
  - `curl -sI "https://sidelinehero.tommamakesthings.com/terms?x=1"` → 301 to `https://sidelinehero.app/terms?x=1`
  - `curl -sI https://sidelinehero.app/app-ads.txt` → 200
- [x] **7. Email.** Cloudflare → `sidelinehero.app` → Email Routing: enable (it adds MX and SPF records), add `support@sidelinehero.app` forwarding to your inbox, verify the destination, send a test.

## Phase 2 · Website repo (one PR, deploys on merge)

- [x] **8.** `scripts/smoke.sh`: `BASE="https://sidelinehero.app"`, and add checks that the old host and `www` return 301 to the right place (path kept).
- [x] **9.** `scripts/check-third-party.sh`: allow the new host as first-party (the old one only as a redirect target in links, if anything still links to it).
- [x] **10.** Replace the domain in the site text: `privacy-site.md` ("This section covers …"), `support.html` (email → `support@sidelinehero.app`), README's Live line. Add `<link rel="canonical">` and `og:url` on every page with the new host if the layout has them (add them if not).
- [x] **11.** Build, tests, third-party gate, merge (deploy), then `./scripts/smoke.sh` against the live site.

## Phase 3 · App repo (rides in a release)

- [ ] **12.** `src/features/premium/premiumCopy.ts`: `TERMS_URL` and `PRIVACY_URL` to `https://sidelinehero.app/terms` and `/privacy` (a test pins them). Fits **Tue 17 Nov** (no native change). Old builds keep working through the 301.
- [ ] **13.** Docs: `docs/app-store-copy.md` (URLs, contact email, the "Terms of Use:" line in the description), `docs/privacy-policy.md`, `docs/submission-checklist.md`, CLAUDE.md's privacy-policy URL. Leave dated records (`store-forms-1.0.0.md`, plans, specs) as history.
- [ ] **14.** FAQ: if any answer names the domain or the email, change it in `faqs.json`, then `sync-faqs` into the site repo.

## Phase 4 · Stores, ads and accounts (after phase 1 is live)

| # | Where | Field | Needs a new version? |
|---|---|---|---|
| - [ ] 15 | App Store Connect | Privacy Policy URL (App Privacy) | **Yes** (checked 13 Nov: "To make changes to the privacy policy, create a new app version"): 19 Nov |
| - [ ] 16 | App Store Connect | Support URL, Marketing URL, and the "Terms of Use: …" line at the end of the description | **Yes**: do it on the 19 Nov version with the description and keyword changes |
| - [ ] 17 | App Store Connect | App Review contact email / notes, if they show the old address | No |
| - [ ] 18 | Play Console | Store settings → Website, Email; App content → Privacy policy | No |
| - [ ] 19 | AdMob | Nothing to type: it reads `app-ads.txt` from the developer website the stores list. After 15–18, AdMob → Apps → each app → app-ads.txt → *Check for updates*. The new apex domain should verify more easily than the old subdomain did. Keep `app-ads.txt` served on both hosts (the redirect covers the old one). |
| - [ ] 20 | RevenueCat | Nothing (no website field used). |
| - [ ] 21 | Instagram | Bio link → `https://sidelinehero.app`. |
| - [ ] 22 | Google Search Console | Add a Domain property for `sidelinehero.app` (TXT record in Cloudflare). If the old subdomain was a property, use *Change of address* to the new one. |

## Phase 5 · Marketing assets and loose ends

- [ ] **23.** Instagram slides not yet posted that print the old domain: posts 6 and 9 (`post-06-tips/src/post.html`, `post-09-privacy/src/post.html`; also check the end cards of reels 7 and 10). Change the domain and re-render before posting. Posts already up are fine (the old URL redirects). Also `instagram-plan.md`.
- [ ] **24.** Memory and docs that describe "push main = live at sidelinehero.tommamakesthings.com" (README, memory notes): update.
- [ ] **25.** One week later: check AdMob shows app-ads.txt verified for both apps, Search Console sees the new domain, and the CloudFront logs or a few `curl`s show the old host still redirecting.

## Order and timing

1. Phase 1 any time (about an hour, most of it waiting for the certificate). Nothing changes for visitors until step 5.
2. Phase 2 straight after, same day.
3. Phase 3 step 12 in the 17 Nov release; the rest of phase 3 with it.
4. Phase 4: Play, the Instagram bio and the iOS contact email the day phase 2 is live; every iOS URL (Privacy Policy, Support, Marketing, the description's Terms line) with the 19 Nov submission.
5. Phase 5 before the next Instagram post that has a footer.

## Rollback

Remove the two `sidelinehero.app` DNS records (or the alternate names) and republish the function without the redirect: the old domain serves the site again exactly as before. Nothing in phases 1 or 2 deletes anything.
