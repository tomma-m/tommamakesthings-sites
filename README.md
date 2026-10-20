# tommamakesthings-sites

Static sites for `tommamakesthings.com` subdomains. One directory per site under
`sites/`.

## Live

- `sites/sidelinehero` → https://sidelinehero.tommamakesthings.com

## Build

    npm ci
    node build.mjs sidelinehero
    npx http-server sites/sidelinehero/dist

The build has no network access and needs no environment variables. The
Sideline Hero privacy policy lives in this repo at
`sites/sidelinehero/src/privacy-app.md` — that file is the single source of
truth for the app's policy text and is published at `/privacy`.

## Deploy

Push to `main`. GitHub Actions assumes an AWS role via OIDC (no stored keys),
runs `scripts/check-third-party.sh` against the built output **before** anything
is uploaded, then syncs to S3, invalidates CloudFront, and runs
`scripts/smoke.sh`.

## FAQ

`/faq` is built from two files in `sites/sidelinehero/src/`:

- `faqs-app.json` — a **copy** of `src/features/help/faqs.json` from the private
  `sideline-hero` repo, which is also what the app's Help screen shows. Never
  edit it here. After the app's file changes (with both repos checked out side
  by side in the same folder):

      node scripts/sync-faqs.mjs          # copy it in
      node scripts/sync-faqs.mjs --check  # exit 1 if the copy is stale

  CI cannot read the app repo, so nothing checks this automatically — run
  `--check` before any deploy that touches the FAQ.
- `faqs-site.json` — questions only a website visitor asks. Edit it here.

Both use `{ "faqs": [{ "id", "title", "body": [paragraphs] }] }`, plain text
only. `build.mjs` refuses a malformed file or an id used in both.
`node --test scripts/faqs.test.mjs` covers the helpers and runs in CI.

## What’s new

`/releases` lists each app version that reached a public store, newest
first, with the date it reached each store and its store release notes. It
is built from `sites/sidelinehero/src/releases-app.json`, a **copy** of
`docs/releases.json` in the private `sideline-hero` repo. Never edit it here.
When a store approves a release, the app's file gets the date, then:

    node scripts/sync-releases.mjs          # copy it in
    node scripts/sync-releases.mjs --check  # exit 1 if the copy is stale

The format is `{ "releases": [{ "version", "stores": { "google_play",
"app_store" }, "notes": [plain text] }] }`. Dates are `YYYY-MM-DD`; a store
appears only once the release has reached it. The app repo's
`releasesJson.test.ts` checks the notes match the store text word for word.
`build.mjs` refuses a malformed file, and `node --test
scripts/releases.test.mjs` covers the helpers in CI.

## Infrastructure

AWS account `957424402699`. S3 bucket `sidelinehero-tommamakesthings-site`
(`ap-southeast-2`, private, OAC-only) behind CloudFront. ACM certificate is in
`us-east-1` — CloudFront reads certificates from nowhere else. DNS is at
Cloudflare, **grey cloud**, so there is no Route 53 hosted zone to pay for.

## Rules

- No third-party requests. Fonts are self-hosted; there is no analytics, no
  reCAPTCHA, no embeds. `scripts/check-third-party.sh` enforces this and gates
  the deploy; `scripts/smoke.sh` re-runs it.
- Orange `#E8671A` is decorative only — white text on it is **3.29:1**, so it is
  never a button background and never text. Measured on `--canvas` `#EFE6D6`:
  - orange **text** is `--orange-ink` `#AC4208` — **4.80:1**. The old `#B4460A`
    measured **4.44:1** and failed AA despite a comment claiming otherwise.
  - the CTA resting background is `--orange-cta` `#C2510A` — white on it is
    **4.69:1**. Hover goes darker (`#AC4208`, **5.94:1**), never lighter.
  - `--muted` is `#6A6257` — **4.85:1** on `--canvas` and **4.72:1** on
    `--surface2`. The old `#7A7266` measured **3.83:1** / **3.73:1**.
- The privacy page has two halves: the app's policy and this website's. They are
  separate `<section>`s with different backgrounds so each promise is scoped to
  what it describes, and `scripts/smoke.sh` asserts the wrapper is present. Do
  not merge them.
