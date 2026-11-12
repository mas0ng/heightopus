# Security Policy

Thanks for helping keep Heightopus and the people who use it safe.

## Supported versions

Only the live site and the current `main` branch are supported. Fixes are deployed to
[heightopus.com](https://heightopus.com) directly; there are no older releases to patch.

| Version | Supported |
| --- | --- |
| Live site (heightopus.com) | ✅ |
| `main` branch | ✅ |
| Anything else (forks, old commits) | ❌ |

## Reporting a vulnerability

**Please report vulnerabilities privately. Don't open a public issue.**

- **Email:** [mason@mas0ng.com](mailto:mason@mas0ng.com?subject=Heightopus%20security%20report)
- **GitHub:** [Report a vulnerability](https://github.com/mas0ng/heightopus/security/advisories/new) (private advisory)

Please include:

- what you found and where (URL, endpoint or file),
- steps to reproduce, or a minimal proof of concept,
- the impact you think it has,
- any suggested fix, if you have one.

### What to expect

- An acknowledgement, usually within 7 days.
- An update once the issue has been assessed, and again when it's fixed.
- Credit in the fix notes if you'd like it (tell us the name or handle to use).

This is a small, independently run project, so response times are best effort and there
is no paid bug bounty.

## Scope

**In scope**

- `https://heightopus.com` and its pages
- The API at `https://heightopus.com/api/` (party rooms, WebSockets and the daily stats endpoint)
- The source code in this repository

**Out of scope**

- Denial-of-service, load or stress testing, and automated scanning that generates heavy traffic
- Spam, social engineering or phishing
- Issues in third-party services (Cloudflare, Google Fonts, GitHub); please report those to the provider
- Reports with no practical security impact, such as missing headers on static pages without an exploit
- Cheating at the scoring itself (for example, submitting a perfect score to the daily stats): it is an
  anonymous, unauthenticated histogram by design. Report it if you can affect *other* people's data or rooms.

## Good-faith research

If you act in good faith, stay within the scope above, avoid privacy violations and
disruption, and give us reasonable time to fix an issue before disclosing it, we won't take
action against you. In practice:

- Only test against your own party rooms, or rooms where everyone has agreed to it.
- Don't access, change or delete other people's data, and stop as soon as you've confirmed an issue.
- Don't degrade the service for other people.

## How Heightopus handles data

Heightopus has no accounts. Progress and settings are stored in the visitor's own browser.
A finished daily sends only the total score, stored as an anonymous count. Party rooms hold
each player's chosen nickname, colour and guesses, visible to that room, and are deleted
after they stop being used.
