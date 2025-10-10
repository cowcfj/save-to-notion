#!/usr/bin/env bash
set -euo pipefail

# DeepSource poller script
# Environment variables required:
#   DEEPSOURCE_TOKEN - API token (stored in GitHub Secrets when used in Actions)
#   DEEPSOURCE_PROJECT_KEY - project key / slug used by DeepSource
# Optional environment variables:
#   BRANCH - branch name to poll (defaults to GITHUB_REF_NAME or first arg)
#   POLL_INTERVAL - seconds between attempts (default 8)
#   MAX_ATTEMPTS - max attempts before giving up (default 20)
# Output:
#   writes JSON summary to /tmp/deepsource_summary.json and prints a short human message

if [[ -z "${DEEPSOURCE_TOKEN:-}" || -z "${DEEPSOURCE_PROJECT_KEY:-}" ]]; then
  echo "ERROR: DEEPSOURCE_TOKEN and DEEPSOURCE_PROJECT_KEY must be set"
  exit 1
fi

BRANCH="${BRANCH:-${GITHUB_REF_NAME:-}}"
if [[ -z "$BRANCH" ]]; then
  BRANCH="${1:-}"
fi

# Prefer to match by commit if available (more reliable than branchName in some cases)
COMMIT_OID="${COMMIT_OID:-${GITHUB_SHA:-${2:-}}}"
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: Branch not specified. Set BRANCH env or pass branch as first arg."
  exit 1
fi

POLL_INTERVAL=${POLL_INTERVAL:-8}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-20}
BACKOFF_AFTER=${BACKOFF_AFTER:-5}
BACKOFF_MULTIPLIER=${BACKOFF_MULTIPLIER:-2}

API_ENDPOINT="https://app.deepsource.com/api/graphql"

# Fetch a few recent runs for the branch so we can match by commitOid if needed
graphql_query='query($projectKey:String!,$branch:String!,$first:Int!){ projectRuns(projectKey:$projectKey, branchName:$branch, first:$first){ edges{ node{ id runUid commitOid status createdAt finishedAt summary{ occurrencesIntroduced occurrencesResolved occurrenceDistributionByCategory{ category introduced } } } } } }'

attempt=0
interval=$POLL_INTERVAL
summary_file="/tmp/deepsource_summary.json"
> "$summary_file"

while (( attempt < MAX_ATTEMPTS )); do
  attempt=$((attempt+1))
  echo "[deepsource-poll] attempt=$attempt branch=$BRANCH"

  payload=$(jq -n --arg q "$graphql_query" --arg pk "$DEEPSOURCE_PROJECT_KEY" --arg br "$BRANCH" --argjson first 5 '{query:$q, variables:{projectKey:$pk, branch:$br, first:$first}}')

  # call DeepSource GraphQL endpoint
  resp=$(curl -sS -H "Authorization: Token ${DEEPSOURCE_TOKEN}" -H "Content-Type: application/json" -d "$payload" "$API_ENDPOINT") || true

  # write raw response to file for debugging (no secrets)
  echo "$resp" | jq '.' >/tmp/deepsource_last_raw.json || echo "{}" >/tmp/deepsource_last_raw.json

  # Try to extract a node. If COMMIT_OID is provided, prefer the run whose commitOid matches it.
  node=""
  if [[ -n "${COMMIT_OID:-}" ]]; then
    node=$(echo "$resp" | jq -c --arg co "$COMMIT_OID" '.data.projectRuns.edges[]?.node | select(.commitOid == $co) | .[0] // empty' 2>/dev/null) || true
  fi

  # Fallback to first node if none matched by commit
  if [[ -z "$node" || "$node" == "null" ]]; then
    node=$(echo "$resp" | jq -c '.data.projectRuns.edges[0].node // empty' 2>/dev/null) || true
  fi

  if [[ -n "$node" && "$node" != "null" ]]; then
    status=$(echo "$node" | jq -r '.status // empty')
    commitOid=$(echo "$node" | jq -r '.commitOid // empty')
    runId=$(echo "$node" | jq -r '.id // empty')
    createdAt=$(echo "$node" | jq -r '.createdAt // empty')
    finishedAt=$(echo "$node" | jq -r '.finishedAt // empty')
    occurrencesIntroduced=$(echo "$node" | jq -r '.summary.occurrencesIntroduced // 0')
    occurrencesResolved=$(echo "$node" | jq -r '.summary.occurrencesResolved // 0')
    distribution=$(echo "$node" | jq -c '.summary.occurrenceDistributionByCategory // []')

    # build summary JSON
    jq -n --arg runId "$runId" --arg commitOid "$commitOid" --arg status "$status" --arg createdAt "$createdAt" --arg finishedAt "$finishedAt" --argjson introduced "$occurrencesIntroduced" --argjson resolved "$occurrencesResolved" --arg distribution "$distribution" '
    {
      runId: $runId,
      commitOid: $commitOid,
      status: $status,
      createdAt: $createdAt,
      finishedAt: $finishedAt,
      occurrencesIntroduced: $introduced,
      occurrencesResolved: $resolved,
      occurrenceDistributionByCategory: ($distribution | fromjson?)
    }' > "$summary_file" || true

    # If status is completed/failed/success -> exit with summary
    if [[ "$status" == "FAILURE" || "$status" == "SUCCESS" || "$status" == "COMPLETED" ]]; then
      echo "[deepsource-poll] run finished: status=$status runId=$runId commit=$commitOid"
      cat "$summary_file" | jq '.' || true
      exit 0
    fi
  else
    echo "[deepsource-poll] no run yet for branch $BRANCH (attempt $attempt)"
  fi

  # backoff policy
  if (( attempt % BACKOFF_AFTER == 0 )); then
    interval=$((interval * BACKOFF_MULTIPLIER))
    echo "[deepsource-poll] applying backoff, new interval=${interval}s"
  fi

  sleep "$interval"
done

echo "[deepsource-poll] timed out after $MAX_ATTEMPTS attempts. Last raw response is at /tmp/deepsource_last_raw.json"
if [[ -s "$summary_file" ]]; then
  echo "Last summary:"
  cat "$summary_file" | jq '.' || true
fi
exit 2
