# Code signing

Signing puts a verified publisher name on IV Signal's installer and app, so Windows SmartScreen stops showing
"Windows protected your PC / Unknown publisher". IV Signal uses **Azure Artifact Signing** (formerly Trusted Signing),
the same service IV Downloader is set up for. `scripts/release.mjs` signs automatically once the values below are in the
environment, checks that every signature is valid, and refuses to publish unsigned unless you pass `--unsigned`.

## Who can use it

Microsoft's public-trust certificates are for organizations in the US, Canada, the EU and the UK, and individual
developers in the US and Canada. Signing as **The Hollis Organization** shows that name as the publisher. The Basic
tier has a monthly fee; check the [pricing page](https://azure.microsoft.com/pricing/details/artifact-signing/) first.

One signing account can sign every IV app (IV Signal, IV Studio, IV Downloader, IV Outreach): set it up once.

## Steps (you do these; they need your identity and payment)

1. **Azure subscription**: sign in at portal.azure.com with the account that should own signing.
2. **Artifact Signing account**: search the portal for "Artifact Signing", create one in a nearby region, Basic tier.
   Note the **account name** and the **endpoint** URL on its overview page.
3. **Identity validation**: in the account, *Identity validations → New → Public*. Fill in the details exactly as on
   official documents. Microsoft's check can take hours to several business days.
4. **Certificate profile**: once validated, create a **Public Trust** profile. Note the **profile name** and the
   validated **publisher name**.
5. **App registration**: in *Microsoft Entra ID → App registrations*, create `iv-signing`, add a **client secret**.
   Note the **tenant ID**, **client ID** and the **secret value** (shown once).
6. **Permission**: on the signing account, *Access control (IAM) → Add role assignment* → **Artifact Signing
   Certificate Profile Signer** for that app registration.

## Releasing signed

Set these as Windows user environment variables on the PC that releases (never in a file in this repo, never in chat):

| Name | Value |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_CLIENT_ID` | App registration's client ID |
| `AZURE_CLIENT_SECRET` | The client secret value |
| `IV_SIGNAL_SIGN_ENDPOINT` | e.g. `https://eus.codesigning.azure.net/` |
| `IV_SIGNAL_SIGN_ACCOUNT` | Signing account name |
| `IV_SIGNAL_SIGN_PROFILE` | Certificate profile name |
| `IV_SIGNAL_SIGN_PUBLISHER` | The validated publisher name, exactly |

Then bump `version` in package.json, commit, and run `node scripts/release.mjs` (`--dry` to build and check without
publishing).

## Until then

`node scripts/release.mjs --unsigned` publishes unsigned builds; people click *More info → Run anyway* once.
SmartScreen also weighs reputation, so a new publisher can still see a warning for a short while after signing starts.
