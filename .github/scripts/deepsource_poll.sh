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
if [[ -z "$BRANCH" ]]; then
  echo "ERROR: Branch not specified. Set BRANCH env or pass branch as first arg."
  exit 1
fi

POLL_INTERVAL=${POLL_INTERVAL:-8}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-20}
BACKOFF_AFTER=${BACKOFF_AFTER:-5}
BACKOFF_MULTIPLIER=${BACKOFF_MULTIPLIER:-2}

API_ENDPOINT="https://app.deepsource.com/api/graphql"

graphql_query='query($projectKey:String!,$branch:String!){ projectRuns(projectKey:$projectKey, branchName:$branch, first:1){ edges{ node{ id runUid commitOid status createdAt finishedAt summary{ occurrencesIntroduced occurrencesResolved occurrenceDistributionByCategory{ category introduced } } } } } }'

attempt=0
interval=$POLL_INTERVAL
summary_file="/tmp/deepsource_summary.json"
> "$summary_file"

while (( attempt < MAX_ATTEMPTS )); do
  attempt=$((attempt+1))
  echo "[deepsource-poll] attempt=$attempt branch=$BRANCH"

  payload=$(jq -n --arg q "$graphql_query" --arg pk "$DEEPSOURCE_PROJECT_KEY" --arg br "$BRANCH" '{query:$q, variables:{projectKey:$pk, branch:$br}}')

  # call DeepSource GraphQL endpoint
  resp=$(curl -sS -H "Authorization: Token ${DEEPSOURCE_TOKEN}" -H "Content-Type: application/json" -d "$payload" "$API_ENDPOINT") || true

  # write raw response to file for debugging (no secrets)
  echo "$resp" | jq '.' >/tmp/deepsource_last_raw.json || echo "{}" >/tmp/deepsource_last_raw.json

  # Try to extract the node
  node=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node // empty') || true
  if [[ -n "$node" && "$node" != "null" ]]; then
    status=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.status // empty')
    commitOid=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.commitOid // empty')
    runId=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.id // empty')
    createdAt=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.createdAt // empty')
    finishedAt=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.finishedAt // empty')
    occurrencesIntroduced=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.summary.occurrencesIntroduced // 0')
    occurrencesResolved=$(echo "$resp" | jq -r '.data.projectRuns.edges[0].node.summary.occurrencesResolved // 0')
    distribution=$(echo "$resp" | jq -c '.data.projectRuns.edges[0].node.summary.occurrenceDistributionByCategory // []')

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
