# Front Desk Observation Log — Voice Agent (Round 1)

Use this for the hands-off observation session required before any Plivo work starts
(see `docs/designs/voice-agent-telephony-v1.md` → The Assignment, Success Criteria Round 1).
Goal: find out whether the *existing* browser-voice agent handles real, unscripted
questions cleanly — before spending days wiring a phone number to it.

**Rules for the session:**
- Don't guide the caller. Don't explain what to ask. Don't jump in when it struggles.
- If you're arranging colleagues to call in, don't give them a script — tell them to ask
  whatever a real caller would actually ask.
- Log every call, including the boring ones. A string of "worked fine" is data too.

---

## Per-call log

Copy this block for each call.

```
Call #: ___   Time: ___   Caller: [front desk / colleague / real prospective caller]

What did they ask? (their words, not a summary)
_______________________________________________

Did the agent understand it correctly the first time?      Y / N
If N — what did it mishear or misunderstand?
_______________________________________________

Did the agent give a CORRECT answer?                        Y / N
If N — what was wrong?
_______________________________________________

Did the caller sound annoyed, confused, or amused talking to a bot?   Y / N
If Y — describe what happened
_______________________________________________

Did the call need a human to step in / would a real caller have hung up?   Y / N

Anything the agent did that surprised you (good or bad)?
_______________________________________________
```

---

## After the session — pattern notes

- How many calls out of total had a clean, correct, first-try answer? ___ / ___
- Most common thing it got wrong (if anything):
- Any question type it clearly can't handle yet:
- Did anyone react badly to realizing it's a bot?
- Gut check: would you be comfortable giving this number to a real caller today?  Y / N

## What this decides

- **Mostly clean, no bad misses on the "is X still available"-type questions** →
  Round 1 passes. Proceed to building the Plivo transport per the design doc.
- **Real mis-hearings, wrong answers, or bad reactions on the actual question shapes
  callers ask** → the wedge assumption ("live answering works for low-stakes,
  high-frequency questions") needs re-checking before telephony wiring is worth it.
  Fix the prompt/RAG content first, re-run this observation, then proceed.
