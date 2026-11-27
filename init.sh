#!/bin/bash

set -euo pipefail
cd "$(dirname "$0")"

composer_cmd=("${FCBOARD_COMPOSER:-composer}")
if [[ "${composer_cmd[0]}" == *.phar ]]; then
    composer_cmd=(php "${composer_cmd[0]}")
fi
"${composer_cmd[@]}" install --no-dev --prefer-dist --no-interaction
"${composer_cmd[@]}" check-platform-reqs --no-dev

php artisan v2board:install

if [ -f "/etc/init.d/bt" ]; then
  chown -R www $(pwd);
fi
