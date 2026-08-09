<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class V2boardDatabaseUpgrade extends Command
{
    protected $signature = 'v2board:upgrade-database';
    protected $description = 'Run registered custom migrations and one-time data upgrades safely';

    private const LEGACY_CUSTOM_MIGRATIONS = [
        'database/migrations/2026_08_07_000001_create_node_security_tables.php',
        'database/migrations/2026_08_07_000002_create_node_security_probe_tables.php',
        'database/migrations/2026_08_07_000003_create_security_probe_targets.php',
        'database/migrations/2026_08_08_000004_add_probe_failure_started_at.php',
        'database/migrations/2026_08_08_000005_add_probe_first_healthy_at.php',
        'database/migrations/2026_08_08_000006_add_access_log_ua_classification.php',
        'database/migrations/2026_08_08_000007_create_node_entry_pool_tables.php',
        'database/migrations/2026_08_09_000008_create_node_access_snapshot_table.php',
    ];

    public function handle(): int
    {
        $this->info('Checking registered database migrations...');
        foreach ($this->registeredMigrations() as $path) {
            if (!is_file(base_path($path))) throw new RuntimeException("Registered migration is missing: {$path}");
            $this->line("  - {$path}");
            $exitCode = Artisan::call('migrate', ['--path' => $path, '--force' => true]);
            $output = trim(Artisan::output());
            if ($output !== '') $this->line($output);
            if ($exitCode !== 0) throw new RuntimeException("Migration failed: {$path}");
        }

        if (!Schema::hasTable('v2_security_setting')) {
            throw new RuntimeException('Security settings table is missing after migrations');
        }
        $this->runDataUpgrade('database_upgrade.backfill_ua.v1', 'security:backfill-ua');
        $this->runDataUpgrade('database_upgrade.backfill_access_snapshots.v1', 'security:backfill-access-snapshots');
        $this->info('Database upgrade completed. No manual migration or backfill command is required.');
        return 0;
    }

    private function registeredMigrations(): array
    {
        $paths = self::LEGACY_CUSTOM_MIGRATIONS;
        foreach (glob(database_path('migrations/custom/*.php')) ?: [] as $file) {
            $paths[] = 'database/migrations/custom/' . basename($file);
        }
        $paths = array_values(array_unique($paths));
        sort($paths, SORT_STRING);
        return $paths;
    }

    private function runDataUpgrade(string $key, string $command): void
    {
        if (DB::table('v2_security_setting')->where('key', $key)->value('value') === 'completed') {
            $this->line("Skipping completed data upgrade: {$command}");
            return;
        }
        $this->info("Running one-time data upgrade: {$command}");
        $exitCode = Artisan::call($command);
        $output = trim(Artisan::output());
        if ($output !== '') $this->line($output);
        if ($exitCode !== 0) throw new RuntimeException("Data upgrade failed: {$command}");
        DB::table('v2_security_setting')->updateOrInsert(['key' => $key], [
            'value' => 'completed', 'updated_at' => time(),
        ]);
    }
}
