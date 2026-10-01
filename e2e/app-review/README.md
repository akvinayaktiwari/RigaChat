# Meta App Review screencasts — WhatsApp permissions

Records the two videos the WhatsApp App Review needs, one per permission. Meta
rejects a single combined video for this pair.

| Command | Permission | Output |
|---|---|---|
| `--video=management` | `whatsapp_business_management` | `recordings/whatsapp_business_management.mp4` |
| `--video=messaging` | `whatsapp_business_messaging` | `recordings/whatsapp_business_messaging.mp4` |

Everything runs against the real product and the real Meta APIs. Nothing is
mocked. The script never types, stores or reads a password, token or OTP, and it
never clicks inside Meta's Embedded Signup popup or inside WhatsApp Web.

## One-time setup

```bash
cd e2e
npm install
npx playwright install chromium
brew install ffmpeg            # if `ffmpeg -version` fails
npm run record:app-review -- --setup
```

`--setup` opens the browser profile at `e2e/.pw-profile/` with no recording.
Sign in by hand to, in order:

1. **Vyostra AI** — this only primes the Google session; see the note below.
2. **facebook.com** — as an admin of the test business that owns the test
   WhatsApp Business Account.
3. **web.whatsapp.com** — scan the QR code with the test phone.

Then press Enter in the terminal.

`.pw-profile/` holds live session cookies for all three. It is gitignored. Never
commit it, copy it, or attach it to anything.

If Google refuses the sign-in in Playwright's bundled Chromium ("this browser may
not be secure"), rerun every command with `APP_REVIEW_CHANNEL=chrome` to use your
installed Chrome instead.

## Settings

None of these is a secret. Export them or prefix the command.

| Variable | Needed for | What it is |
|---|---|---|
| `APP_REVIEW_NOTIFICATION_NUMBER` | management | Test number that receives lead alerts. Digits with country code, e.g. `9198…`. |
| `APP_REVIEW_FORM_ID` | messaging | Id of a lead form on the test account (Dashboard → Forms). |
| `APP_REVIEW_LEAD_PHONE` | messaging | The test customer's number — the one that will message the business. |
| `APP_REVIEW_LEAD_EMAIL` | optional | Defaults to `test-lead@example.com`. |
| `APP_REVIEW_TEMPLATE` | optional | Template created on camera. Defaults to `lead_notification_2`. |
| `APP_REVIEW_BASE_URL` | optional | Defaults to `https://vyostra.com`. |
| `APP_REVIEW_CHANNEL` | optional | `chrome` to use installed Chrome. |

The test lead is always named **Test Lead — App Review**.

## Video A — `whatsapp_business_management`

```bash
APP_REVIEW_NOTIFICATION_NUMBER=91XXXXXXXXXX npm run record:app-review -- --video=management
```

**Before you run it:** the Meta card on Dashboard → WhatsApp must read
**Not Connected**. The script will not disconnect anything for you; it stops with
a message if a connection exists. Read "Before disconnecting" below first.

What it films: the WhatsApp page → the notification number → **Connect with
Meta** → Embedded Signup → the connected number and verified name → the Message
Templates section → **Create template** → the status Meta assigned.

Where it waits for you:

1. **Sign-in.** If the dashboard bounces to the login page, sign in. It carries on
   by itself.
2. **Embedded Signup popup.** Click through it yourself: business → WhatsApp
   Business Account → phone number → Finish. Hold the permissions screen for
   about three seconds so every line is legible. You have five minutes. The
   script continues when the popup closes.

## Video B — `whatsapp_business_messaging`

```bash
APP_REVIEW_FORM_ID=… APP_REVIEW_LEAD_PHONE=91XXXXXXXXXX npm run record:app-review -- --video=messaging
```

**Before you run it:** the Meta card must read **Connected · Active**. If it
reads only "Connected", alerts are going out through Gupshup and this video would
not show Meta's API at all.

What it films, in one tab: the connected WhatsApp page → the test site → the
lead form submitted → WhatsApp Web with the lead alert → the customer's message
and the AI reply → the CRM with the lead and its conversation.

Where it waits for you:

1. **Sign-in**, as above.
2. **The lead alert**, only if it does not appear in WhatsApp Web within 60
   seconds. Open the chat that shows it and press Enter.
3. **The customer's message.** Send it by hand, wait for the AI reply to appear,
   then press Enter.

### Which phone is WhatsApp Web?

WhatsApp Web shows one account. The alert goes to the notification number and
the AI reply goes to the customer, so one session can show both only if the same
test number plays both parts: connect with that number as the notification
number, use it as `APP_REVIEW_LEAD_PHONE`, and log WhatsApp Web in as it. The
alert and the conversation then sit in one chat with the business number.

If you use two different numbers, WhatsApp Web can show only one side.
**Screen-record the other phone** for that segment — the alert arriving (step 2)
if WhatsApp Web is the customer, or the message and AI reply (step 3) if it is the
owner — and say so in the submission notes.

## Output

Each run writes into `e2e/recordings/` (gitignored):

- `<permission>.webm` — the dashboard tab as Playwright recorded it.
- `<permission>.popup.webm` — management only: Meta's popup window.
- `<permission>.mp4` — the file to upload (H.264, yuv420p, 1440×900).

Playwright records each browser window to its own file, so the management MP4 is
assembled from two: the dashboard up to the click, the whole popup, then the
dashboard from the moment the popup closed. Nothing is cut or reordered. If a
reviewer wants a single unbroken screen capture instead, record the same run with
macOS screen recording, as `scripts/record-meta-screencast.sh` does for Lead Ads.

Watch each MP4 end to end before uploading. A take in which a wait timed out, a
caption covered something, or a real customer's name is visible in the CRM or in
WhatsApp Web should be thrown away and re-recorded.

## Before disconnecting

Video A needs the not-connected state, and the test account is currently
connected. Disconnecting deletes the stored connection record, including the
number's two-step verification PIN. Meta keeps the old PIN bound to the number,
so the reconnect's registration call is expected to be refused. The connection is
still stored and still sends, but the app no longer holds the PIN. Decide whether
that is acceptable for the test number before pressing Disconnect.

## What is not automated, on purpose

- Facebook login, the Embedded Signup popup, CAPTCHAs and 2FA.
- Anything inside WhatsApp Web. The script only waits for the alert text.
- Disconnecting the existing connection.
