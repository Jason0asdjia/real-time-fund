#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"

if [[ -z "${branch}" ]]; then
  echo "Unable to detect current branch."
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Missing remote: upstream"
  exit 1
fi

git fetch upstream
git merge --ff-only "upstream/${branch}"

echo "Fast-forwarded ${branch} from upstream/${branch}"
