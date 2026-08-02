# sidelinehero-beta

The form handler behind the beta request form on
<https://sidelinehero.tommamakesthings.com>. Live at
`https://forms.tommamakesthings.com`.

It accepts one POST, validates an email address, and emails it to the owner.
That is the whole job.

## Why it exists at all

The site could have used a third-party form service. It does not, because the
site's own privacy page states that loading a page here makes no request to any
other company, and because the app it advertises is built on the claim that
nothing leaves your device. A first-party handler keeps both true.

## Why it is on its own hostname

The site is S3 + CloudFront with Cloudflare DNS left **unproxied** (grey cloud).
Worker routes require a proxied record, so a route on
`sidelinehero.tommamakesthings.com` is impossible. Hence `forms.` — still the
same registrable domain, and the only cross-origin endpoint the site is allowed
to call. `scripts/smoke.sh` enforces that allow-list.

## Contract

`POST` only. Accepts `application/json` or form-encoded.

| field | |
|---|---|
| `email` | required |
| `note` | optional, truncated to 500 chars |
| `_gotcha` | honeypot — a non-empty value returns `{"ok":true}` and sends nothing |

Responses: `{"ok":true}` 200 on success; `{"error":"…"}` with 400 for a bad
address, 405 for a non-POST, 502 if the send itself failed. CORS allows exactly
the site's origin.

The honeypot deliberately returns **success**, not an error — a bot that can
tell the difference learns how to get past it.

## Email

Uses Email Routing's `send_email` binding, **not** the newer Email Sending
product. That binding may only send to addresses already verified as
destinations on the account, which here is the owner's mailbox and nothing else.
The constraint is a feature: a bug in this Worker cannot be turned into a spam
cannon.

`Reply-To` is set to the submitter, so replying goes to the coach rather than to
`beta@`.

## Deploying

    npx wrangler deploy

from this directory, once authenticated (`npx wrangler login`, or
`CLOUDFLARE_API_TOKEN` in the environment).

**This directory is the source of truth.** It was brought under version control
on 2026-08-02, and the deployed script was re-uploaded from these exact bytes
and verified by SHA-256 before the upload was allowed to proceed — so git and
production provably matched at that moment. Keep it that way: deploy from here,
never by pasting into the dashboard.

Note that the Cloudflare API will not return a deployed script's body under an
OAuth session (`10405: Method not allowed for this authentication scheme`), so
there is no easy after-the-fact diff. Config *is* readable and can be checked
against `wrangler.jsonc`.

## Verifying a deploy

    curl -o /dev/null -w '%{http_code}\n' -X OPTIONS https://forms.tommamakesthings.com/   # 204
    curl -o /dev/null -w '%{http_code}\n' https://forms.tommamakesthings.com/              # 405
    curl -X POST https://forms.tommamakesthings.com/ \
      -H 'Content-Type: application/json' --data '{"email":"nonsense"}'                    # 400
    curl -X POST https://forms.tommamakesthings.com/ \
      -H 'Content-Type: application/json' --data '{"email":"a@b.co","_gotcha":"x"}'        # {"ok":true}, sends nothing

A real submission emails the owner, so leave that one for when you mean it.
