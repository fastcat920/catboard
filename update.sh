#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked files have local changes. Commit or save them before updating." >&2
  exit 1
fi

git fetch origin custom
revision="$(git rev-parse --verify "${1:-origin/custom}^{commit}")"
previous="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$previous" "$revision" || {
  echo "The target revision must be a fast-forward from the current release." >&2
  exit 1
}

stage="$(mktemp -d "$PWD/.fcboard-release.XXXXXXXX")"
previous_vendor=''
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && -n "$previous_vendor" && -d "$previous_vendor" ]]; then
    local backup="$PWD/vendor.previous.${stage##*.}"
    if mv "$previous_vendor" "$backup"; then
      echo "Previous dependencies saved at $backup." >&2
    else
      echo "Previous dependencies remain at $previous_vendor." >&2
      return
    fi
  fi
  rm -rf -- "$stage"
}
trap cleanup EXIT
git archive "$revision" | tar -x -C "$stage"

# An external lockfile is useful when operators keep release artifacts outside Git.
if [[ ! -f "$stage/composer.lock" && -n "${FCBOARD_COMPOSER_LOCK:-}" ]]; then
  cp -- "$FCBOARD_COMPOSER_LOCK" "$stage/composer.lock"
fi
if [[ ! -f "$stage/composer.lock" ]]; then
  echo "This release needs an audited composer.lock. Provide FCBOARD_COMPOSER_LOCK or include it in the release." >&2
  exit 1
fi

composer_cmd=("${FCBOARD_COMPOSER:-composer}")
if [[ "${composer_cmd[0]}" == *.phar ]]; then
  composer_cmd=(php "${composer_cmd[0]}")
fi
(
  cd "$stage"
  "${composer_cmd[@]}" validate --no-check-publish --strict
  "${composer_cmd[@]}" install --no-dev --prefer-dist --no-interaction --no-scripts
  "${composer_cmd[@]}" check-platform-reqs --no-dev
)

if [[ -d vendor ]]; then
  previous_vendor="$stage/vendor.previous"
fi
echo "Updating FCboard from $previous to $revision."
git merge --ff-only "$revision"
if [[ -n "$previous_vendor" ]]; then
  mv vendor "$previous_vendor"
fi
if ! mv "$stage/vendor" vendor; then
  if [[ -n "$previous_vendor" ]]; then mv "$previous_vendor" vendor; fi
  exit 1
fi
if ! (
  # Clear generated manifests before booting Artisan with the new dependencies.
  rm -f bootstrap/cache/{config,events,packages,services}.php bootstrap/cache/routes-*.php &&
  php artisan package:discover &&
  php artisan v2board:update &&
  php artisan v2board:upgrade-database &&
  php artisan route:clear &&
  php artisan view:clear
); then
  echo "Update stopped at $revision. Previous commit: $previous. Check migration output before rolling back." >&2
  exit 1
fi
if [[ -n "${FCBOARD_RELOAD_COMMAND:-}" ]]; then
  bash -c "$FCBOARD_RELOAD_COMMAND"
else
  echo 'Reload the running web and queue services to activate the new release.'
fi
if [[ -n "${FCBOARD_HEALTH_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 15 -- "$FCBOARD_HEALTH_URL" >/dev/null
fi
echo "FCboard $revision prepared successfully."
