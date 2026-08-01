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
syncs to S3 and invalidates CloudFront, then runs `scripts/smoke.sh`.

## Infrastructure

AWS account `957424402699`. S3 bucket `sidelinehero-tommamakesthings-site`
(`ap-southeast-2`, private, OAC-only) behind CloudFront. ACM certificate is in
`us-east-1` — CloudFront reads certificates from nowhere else. DNS is at
Cloudflare, **grey cloud**, so there is no Route 53 hosted zone to pay for.

## Rules

- No third-party requests. Fonts are self-hosted; there is no analytics, no
  reCAPTCHA, no embeds. `scripts/smoke.sh` enforces this.
- Orange `#E8671A` is for fills only. Orange **text** is `#B4460A` — the lighter
  one fails WCAG AA on the cream background.
