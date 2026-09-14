#!/usr/bin/env bash
#
# WF-46. Re-captures the Playwright visual-baseline screenshots on a GitHub
# Actions runner (never on a laptop — see e2e/visual.spec.ts) and copies only
# the PNGs that actually changed into the matching e2e/*-snapshots/ directory
# under presenter-pro/e2e/, so a review diff shows just the real changes.
#
# Usage:
#   scripts/baselines.sh <branch>
#
# Run from anywhere; paths below are resolved relative to this script. What
# it does:
#   1. Dispatches .github/workflows/e2e.yml on <branch> with
#      update_baselines=true (gh workflow run).
#   2. Finds the run it just created (gh run list), waits for it to finish
#      (gh run watch --exit-status — fails this script if the run fails).
#   3. Downloads its "visual-baselines" artifact into a temp directory
#      (gh run download).
#   4. For every downloaded *.png, finds the one file under
#      presenter-pro/e2e/ whose path — from its own "*-snapshots" ancestor
#      directory down — matches (this is robust to whichever root
#      actions/upload-artifact normalizes the download to; the workflow
#      uploads "presenter-pro/e2e/*-snapshots/", but the artifact's own root
#      is not something this script can assume without running it).
#   5. `cmp`s old vs new; copies only the files that differ, printing every
#      copied path.
#
# If a downloaded PNG does not resolve to exactly one match under
# presenter-pro/e2e/ (the layout turned out to be something this script did
# not anticipate), it prints what it *would* have compared/copied for every
# downloaded file and exits 1 without copying anything — fix the matching
# logic below rather than guessing.
#
# Requires: `gh` authenticated with `repo` and `actions:write` scope, `cmp`.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/baselines.sh <branch>" >&2
  exit 1
fi

branch="$1"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
presenter_pro_dir="$(cd "${script_dir}/.." && pwd)"
e2e_dir="${presenter_pro_dir}/e2e"

if [[ ! -d "${e2e_dir}" ]]; then
  echo "Cannot find presenter-pro/e2e at ${e2e_dir}" >&2
  exit 1
fi

echo "Dispatching e2e.yml on ${branch} with update_baselines=true..."
dispatch_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run e2e.yml --ref "${branch}" -f update_baselines=true

echo "Waiting for the dispatched run to appear..."
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow e2e.yml --branch "${branch}" --limit 1 \
    --json databaseId,createdAt \
    --jq "select(.[0].createdAt > \"${dispatch_time}\") | .[0].databaseId" 2>/dev/null || true)"
  if [[ -n "${run_id}" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "${run_id}" ]]; then
  echo "Timed out waiting for a new e2e.yml run on ${branch} after ${dispatch_time}." >&2
  exit 1
fi

echo "Watching run ${run_id}..."
gh run watch "${run_id}" --exit-status

download_dir="$(mktemp -d)"
trap 'rm -rf "${download_dir}"' EXIT

echo "Downloading visual-baselines artifact from run ${run_id}..."
gh run download "${run_id}" -n visual-baselines -D "${download_dir}"

# Every *-snapshots-relative path under the download dir, e.g.
# "visual.spec.ts-snapshots/home-darwin.png".
downloaded_files=()
while IFS= read -r -d '' file; do
  downloaded_files+=("${file}")
done < <(find "${download_dir}" -type f -name '*.png' -print0)

if [[ ${#downloaded_files[@]} -eq 0 ]]; then
  echo "No PNGs found in the downloaded artifact — nothing to do." >&2
  exit 1
fi

# Returns the path from the nearest ancestor directory matching
# "*-snapshots" down to the file itself (e.g.
# "visual.spec.ts-snapshots/home-darwin.png"), or empty if no such ancestor
# exists.
snapshot_relative_suffix() {
  local path="$1"
  local rel=""
  local dir
  dir="$(dirname "${path}")"
  local base
  base="$(basename "${path}")"
  rel="${base}"
  while [[ "${dir}" != "/" && "${dir}" != "." ]]; do
    local name
    name="$(basename "${dir}")"
    if [[ "${name}" == *-snapshots ]]; then
      echo "${name}/${rel}"
      return 0
    fi
    rel="${name}/${rel}"
    dir="$(dirname "${dir}")"
  done
  echo ""
  return 0
}

unresolved=0
to_copy=()

for downloaded in "${downloaded_files[@]}"; do
  suffix="$(snapshot_relative_suffix "${downloaded}")"
  if [[ -z "${suffix}" ]]; then
    echo "UNRESOLVED (no *-snapshots ancestor): ${downloaded}"
    unresolved=1
    continue
  fi

  matches=()
  while IFS= read -r -d '' match; do
    matches+=("${match}")
  done < <(find "${e2e_dir}" -type f -path "*/${suffix}" -print0)

  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "UNRESOLVED (${#matches[@]} matches for ${suffix}): ${downloaded}"
    unresolved=1
    continue
  fi

  target="${matches[0]}"
  if ! cmp -s "${downloaded}" "${target}"; then
    to_copy+=("${downloaded}:${target}")
  fi
done

if [[ "${unresolved}" -eq 1 ]]; then
  echo "Layout did not resolve cleanly for every file above — exiting without copying anything. Fix snapshot_relative_suffix() / the matching logic in this script, then re-run." >&2
  exit 1
fi

if [[ ${#to_copy[@]} -eq 0 ]]; then
  echo "No baselines changed."
  exit 0
fi

echo "Copying ${#to_copy[@]} changed baseline(s):"
for pair in "${to_copy[@]}"; do
  src="${pair%%:*}"
  dest="${pair#*:}"
  cp "${src}" "${dest}"
  echo "  ${dest#"${presenter_pro_dir}"/}"
done
