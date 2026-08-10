#!/usr/bin/env bash
# Records the Facebook Lead Ads connect flow for Meta App Review.
#
# Meta requires a SCREENCAST, not screenshots, and rejects recordings that cut
# away from the consent screen or stop before the outcome is visible. So this
# records one unbroken take and prints the shot list first, rather than
# stitching clips together afterwards.
#
# Usage: ./scripts/record-meta-screencast.sh [seconds]
set -euo pipefail

DURATION="${1:-180}"
OUT_DIR="$HOME/Desktop/meta-app-review"
OUT="$OUT_DIR/lead-ads-connect-$(date +%Y%m%d-%H%M%S).mp4"
mkdir -p "$OUT_DIR"

cat <<'SHOTS'
================================================================
  SHOT LIST — follow in order, do not stop the recording
================================================================

  1. vyostra.com/login  — sign in
  2. Sidebar -> "Meta Ads"  — pause 2s on the NOT-connected state
  3. Click "Connect with Facebook"
  4. THE FULL META CONSENT SCREEN
     Hold ~3 seconds. Every permission line must be legible.
     >>> This is the shot reviewers most often reject for. <<<
  5. Page selection — pick a Page that has a Lead Ads form
  6. Back on Meta Ads: "Connected" + the Page name visible
  7. In another tab: developers.facebook.com/tools/lead-ads-testing
     Select the Page + form, click "Create lead"
  8. Back to Meta Ads, refresh — lead appears under Recent Meta Leads
  9. Sidebar -> "Leads" — the same lead in the CRM

  This one take satisfies BOTH pages_show_list (step 5) and
  pages_manage_metadata (the webhook subscribe fired at step 6).
  Upload the same file to both permission blocks.

================================================================
  BEFORE YOU START
================================================================

  [ ] META_REDIRECT_URI fixed AND listed in Valid OAuth Redirect URIs
  [ ] Signed OUT of vyostra.com (step 1 needs to show the login)
  [ ] Browser at 100% zoom, no other tabs, notifications silenced
  [ ] Logged into Facebook as an app role holder (Dev mode)

SHOTS

read -r -p "Ready? Recording starts on Enter (max ${DURATION}s, Ctrl-C to stop early). " _

echo "Recording -> $OUT"
# -k draws the click indicator; reviewers follow the cursor.
# -V caps the length so a forgotten recording cannot fill the disk.
screencapture -v -k -V "$DURATION" "$OUT" || true

echo
echo "Saved: $OUT"
[ -f "$OUT" ] && echo "Size:  $(du -h "$OUT" | cut -f1)"
echo
echo "Meta's uploader caps at 4 GB / ~10 min. If it is oversized, shrink with:"
echo "  ffmpeg -i \"$OUT\" -vcodec libx264 -crf 28 \"${OUT%.mp4}-small.mp4\""
