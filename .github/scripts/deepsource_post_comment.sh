#!/usr/bin/env bash
set -euo pipefail

# Usage: deepsource_post_comment.sh <event_path>
# Expects: /tmp/deepsource_summary.json to exist and GITHUB_TOKEN env set

EVENT_PATH=${1:-${GITHUB_EVENT_PATH:-}}
SUMMARY_FILE=/tmp/deepsource_summary.json

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo "No summary file to post"
  exit 0
fi

if [[ -z "$EVENT_PATH" ]]; then
  echo "No event path provided; cannot determine PR number"
  exit 0
fi

runId=$(jq -r '.runId // empty' "$SUMMARY_FILE")
status=$(jq -r '.status // empty' "$SUMMARY_FILE")
introduced=$(jq -r '.occurrencesIntroduced // 0' "$SUMMARY_FILE")
resolved=$(jq -r '.occurrencesResolved // 0' "$SUMMARY_FILE")

BODY=$(cat <<EOF
DeepSource run for branch **${GITHUB_REF_NAME:-unknown}** finished.

- Run: $runId
- Status: $status
- Introduced: $introduced
- Resolved: $resolved

See DeepSource dashboard for details.
EOF
)

# detect PR number from event JSON
PR_NUMBER=$(jq -r '.pull_request.number // empty' "$EVENT_PATH" 2>/dev/null || true)
if [[ -n "$PR_NUMBER" && "$PR_NUMBER" != "null" ]]; then
  # Use gh CLI if available
  if command -v gh >/dev/null 2>&1; then
    gh pr comment "$PR_NUMBER" --body "$BODY" || true
  else
    # Fallback: use GitHub REST API
    API_URL="https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments"
    curl -sS -X POST -H "Authorization: token ${GITHUB_TOKEN}" -H "Content-Type: application/json" -d "$(jq -nc --arg body "$BODY" '{body:$body}')" "$API_URL" >/dev/null || true
  fi
else
  echo "No PR associated with this push; skipping PR comment"
fi
