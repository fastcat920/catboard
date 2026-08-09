# Custom database migrations

Place future panel-specific migrations in this directory. `./update.sh` calls
`php artisan v2board:upgrade-database`, which discovers these files, sorts them
by filename, and runs only migrations Laravel has not already recorded.

Do not place upstream Laravel compatibility migrations here.
