# Voice telephony setup — Handoff for Cowork

Written 2026-10-05. This is the setup that happens **outside the codebase**: the Plivo
account, the phone number, and pointing that number at our relay. The code is finished and
on `main`; nothing here asks you to write any.

The goal is one thing: **a real phone number that rings and is answered by the Vyostra voice
agent.**

Background, only if you need it: `docs/designs/voice-agent-telephony-v1.md` (why it is
built this way) and the "Voice relay (EC2)" section of `docs/INFRASTRUCTURE.md`.

---

## State on 2026-10-05

| Piece | State |
|---|---|
| Telephony code | Done, on `main` |
| DynamoDB tables `voice_phone_lookup`, `voice_leads` | Exist, empty |
| Relay server permissions (IAM) | Done |
| Relay server | Running, but on the **July build, which has no telephony in it**. Deploying the current build is Vinayak's step (§5), not yours. |
| Plivo account, number, application | **Nothing exists yet. This is your work.** |
| Legal answer on call-recording disclosure | Open. See §6 — it limits who may be given the number. |

---

## Rules for this handoff

1. **Stop and ask Vinayak before anything that costs money or signs something**: account
   upgrade, adding credit, renting a number, submitting KYC. Say what it costs first.
2. **KYC documents and identity details come from Vinayak.** Do not fill them from memory,
   guess them, or reuse details from another service.
3. **Never paste the Plivo Auth Token into a chat, a doc, a ticket or this file.** When you
   reach §4, tell Vinayak the token is ready to copy from the console and let him move it.
4. **Do not give the number to anyone outside the team.** Not to a client, not on a
   website. See §6.
5. If a Plivo screen does not match what is written here, say so and stop. Plivo's console
   changes; do not improvise around a missing option.

---

## 1. Create the Plivo account

- Sign up at plivo.com with the company email Vinayak gives you.
- Note the **Auth ID** (it is not secret; write it in the report in §7).
- A trial account can only call verified numbers. Check what a trial allows for **inbound
  calls to an Indian number**, and report it. If a paid upgrade is needed, stop (rule 1).

## 2. Ask Plivo these questions before renting anything

These decide cost and timeline. Use Plivo's sales chat or support, and record the answers
word for word in the report.

1. What KYC is needed to rent an **Indian local or mobile DID** for a company registered in
   India, and how long does approval usually take?
2. What is the monthly rental and the per-minute inbound rate for that number?
3. Does the number support **bidirectional audio streaming** (the `<Stream>` XML element)
   on inbound calls? This is required; without it nothing works.
4. Can we hold **several unassigned Indian DIDs under our own KYC**, to hand to clients
   later, and what does it cost to keep them idle?
5. If a client forwards their existing number to our DID, does Plivo pass the **original
   dialled number** (a SIP `Diversion` header)? We do not depend on it, but want to know.

Question 4 matters most for the business: each client needs their own number, so the
answer decides whether client number two waits days to go live.

## 3. Rent one number

After Vinayak approves the cost and supplies the KYC details:

- Rent **one** Indian number with voice enabled.
- Write it down in full international form, for example `+912212345678`. This exact form is
  what gets typed into the Vyostra dashboard later.

This is **our** number. A client's own advertised number is never entered anywhere in
Vyostra — their phone company forwards calls to ours. Mixing the two up produces a number
that never rings, with no error shown.

## 4. Create the Plivo application and attach the number

In the Plivo console, create a **Voice Application** (Plivo also calls this an XML
application):

| Field | Value |
|---|---|
| Application name | `vyostra-voice-relay` |
| Answer URL | `https://<RELAY_HOST>/plivo/answer` |
| Answer method | `POST` |
| Hangup URL | leave empty |
| Fallback answer URL | leave empty |

`<RELAY_HOST>` is the relay's public hostname. Ask Vinayak for it — it is the host part of
the `VITE_VOICE_WS_URL` setting. It must be the **hostname only**, typed exactly, with
`https://` and no trailing slash after `/plivo/answer`. Our server checks Plivo's signature
against this exact address, so `http://`, a different subdomain, or an added query string
makes every call get rejected.

Then attach the number from §3 to this application.

**Until §5 is done, calling the number will fail.** The relay answers "service unavailable"
to Plivo on purpose while it has no Plivo credentials. That is expected, not a fault in your
setup.

## 5. Vinayak's steps (not yours — listed so you know what you are waiting for)

1. Deploy the current relay build: `./scripts/deploy-voice-relay.sh`. It restarts the relay,
   which drops any browser voice call in progress, and keeps the old build for a one-line
   rollback.
2. Add three lines to the relay server's `.env` and restart it:
   `PLIVO_AUTH_TOKEN`, `PLIVO_AUTH_ID`, `VOICE_RELAY_PUBLIC_HOST` (the same hostname as §4).
3. In the Vyostra dashboard, open the voice agent → **Phone number** → enter the number
   from §3.

## 6. The first test calls

Once §5 is done, tell Vinayak it is ready to test. For the first call:

- Call the number from a personal mobile.
- It should be answered within a few rings by the agent's greeting.
- Ask it something the agent's knowledge base covers, and something it does not.
- Hang up, then check the Vyostra dashboard: the call should appear as a lead with a
  transcript.

**Who may call it:** the team only. A call's transcript is stored, and whether callers must
be told so first is a legal question that has not been answered yet. Until it is, nobody
outside the team is given the number. This is a hard gate, not a preference.

If a call fails, record exactly what the caller heard (silence, a busy tone, a spoken
"unable to take your call" message, or an instant hangup) and the time of the call. Each
of those means a different thing on our side, so the detail matters more than a guess at
the cause. In the Plivo console, the call's log entry shows the response Plivo got from the
Answer URL — copy that status code into the report.

## 7. What to report back

Reply to Vinayak with:

- Plivo **Auth ID** (not the token).
- The number rented, in full `+91…` form, and its monthly cost.
- Plivo's answers to the five questions in §2, word for word.
- KYC status: submitted on what date, approved or pending, anything Plivo asked for.
- The application's Answer URL exactly as saved.
- For each test call: time, what was heard, and the status code from Plivo's call log.
- Anything on a Plivo screen that did not match this document.

## Not part of this handoff

- Porting a client's existing number to Plivo. Decided against.
- Buying more than one number. Wait for the answer to §2 question 4.
- Outbound calling, IVR menus, call recording settings in Plivo. None are used; leave
  Plivo's recording features **off**.
- Changing anything on the relay server or in AWS.
