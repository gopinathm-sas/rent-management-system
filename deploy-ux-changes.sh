#!/usr/bin/env bash
#
# Commit + push + deploy the undo/KPI UX changes.
# Run from the project root:  bash deploy-ux-changes.sh
#
# Deploys to the TEST project only. Promoting to live is a separate,
# deliberate command printed at the end.

set -euo pipefail

cd "$(dirname "$0")"

echo "==> 1/6  Clearing stale git lock files"
# Left behind by a sandboxed git process that could not unlink them.
# Safe to delete: index.lock is only a mutex, __probe is an empty scratch file.
rm -f .git/index.lock .git/__probe
echo "    done"

echo
echo "==> 2/6  Staging the six changed source files"
git add \
  src/contexts/UIContext.tsx \
  src/contexts/DataContext.tsx \
  src/pages/RentDetails.jsx \
  src/pages/Dashboard.tsx \
  src/lib/utils.ts \
  src/index.css

git status --short
echo
read -r -p "    Staged as above. Continue? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Aborted."; exit 1; }

echo
echo "==> 3/6  Committing"
git commit -m "feat(ux): add undo for rent status changes and dashboard KPI cards

Rent status cycling was destructive and silent: a mis-tap on the wrong
cell mutated a financial record with no way back, and stepping Paid to
None discarded paymentTotals, which can encode a prorated first month
that is not recomputable from the tenant record.

- UIContext: showToast now takes an optional action button. Actionable
  toasts live 8s with a countdown bar. Fixed colliding toast ids
  (Date.now() duplicated within a tick) and lifted the container above
  the mobile bottom nav so the action stays tappable.
- DataContext: new revertRentStatus restores an exact prior snapshot
  rather than cycling the status forward.
- RentDetails: snapshots each cell before writing, offers Undo after
  every change, and confirms the destructive Paid to None step while
  quoting the amount being cleared.
- Dashboard: occupancy, collected, outstanding and net position cards,
  all derived from the same rows array the table renders so the summary
  cannot drift from the breakdown.
- utils: extracted formatINR, which also fixes the toLocaleString
  pattern rendering an INR NaN for undefined values.
- index.css: real keyframes for the toast. The animate-in classes used
  across the app are no-ops since tailwindcss-animate is not installed.
  Includes a prefers-reduced-motion guard."

echo
echo "==> 4/6  Pushing to origin/main"
git push origin main

echo
echo "==> 5/6  Building"
npm run build

echo
echo "==> 6/6  Deploying hosting to TEST (munirathnam-illam-test)"
npx firebase deploy --project test --only hosting

cat <<'EOF'

------------------------------------------------------------------
Deployed to test. Before promoting, check on the test site:

  - Dashboard KPI cards: occupancy count, and that "Collected" matches
    the Total Rent figure in the table footer below it
  - Navigate to a previous year: the "this month" subtext should switch
    to "N of 12 months recorded"
  - Rent Status: tap a Paid cell, confirm the dialog quotes the right
    amount, clear it, then hit Undo and verify the original total comes
    back exactly (not a recalculated one)
  - On a phone: confirm the Undo button is not hidden behind the
    bottom nav

Then promote to live:

  npx firebase deploy --project live --only hosting

------------------------------------------------------------------
EOF
