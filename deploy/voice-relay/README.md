# The voice relay box's own dependencies

`backend/dist/voice-relay.js` is bundled with `--external:@aws-sdk/*`, so every
`@aws-sdk` package it needs is resolved at runtime from the **box's**
`node_modules` (`/home/ubuntu`), not from the bundle. That list lived only on
the instance, which meant the relay's dependency set had no source of truth
outside a machine nobody can read from CI. This directory is that source of
truth.

`package.json` here mirrors what `/home/ubuntu/package.json` on the box should
contain. It is deliberately **not** installed by anything in this repo and is
not part of the backend's own install — `backend/package.json` is a superset
that also carries everything the Lambda needs.

## Why these three, and not the others

The bundle's externals are whatever the import graph reaches:

```bash
cd backend && npm run build:relay
grep -oE 'require\("@aws-sdk/[a-z0-9-]+"\)' dist/voice-relay.js | sort -u
```

As of 2026-09-12 that is `client-dynamodb`, `lib-dynamodb` and `client-kms`.
KMS is real, not import bleed: a caller asking for a human sends the WhatsApp
handoff alert, which decrypts the client's API key
(`session.ts -> voice-lead-service -> notification-service -> whatsapp-service -> lib/kms.ts`).

`ws` is **not** here. It is bundled, because only `@aws-sdk/*` is externalised —
the box's old `package.json` listed it, which is exactly the kind of drift a
manifest read by nobody accumulates.

`bufferutil` and `utf-8-validate` are `ws`'s native speedups, required inside a
try/catch and absent on the box. Optional here for the same reason
`deploy-voice-relay.sh` allowlists them: missing means slower, not broken. Their
ranges are `ws`'s own declared peer ranges from `backend/package-lock.json`,
not a version anyone has installed.

Versions match `backend/package.json`, which is what was installed on the box on
2026-09-07. If you bump one there, bump it here.

## The box still has three packages this does not list

`@aws-sdk/client-sfn`, `client-sesv2` and `client-sqs` were installed on
2026-09-07, when the bundle still dragged in the whole services layer. Trimming
it (2026-09-09) removed the need. They are harmless and deliberately still
installed: the **deployed** bundle is the July one, and uninstalling them before
the smaller bundle is live and stays live would break a rollback.

So the drift check in `deploy-voice-relay.sh` is one-directional on purpose. It
fails when the bundle needs something this manifest does not declare, and only
warns when the manifest declares something the bundle no longer needs.
