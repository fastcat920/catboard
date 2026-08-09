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

    private const LEGACY_SCHEMA = [
        '2026_08_07_000001_create_node_security_tables' => [
            'tables' => ['v2_node_snapshot', 'v2_node_access_log', 'v2_node_block_event', 'v2_security_user_score', 'v2_watermark_experiment', 'v2_watermark_group', 'v2_watermark_group_user', 'v2_security_alert', 'v2_security_setting', 'v2_security_admin_log'],
        ],
        '2026_08_07_000002_create_node_security_probe_tables' => [
            'tables' => ['v2_security_probe', 'v2_security_probe_result', 'v2_security_node_state'],
        ],
        '2026_08_07_000003_create_security_probe_targets' => [
            'tables' => ['v2_security_probe_target'],
        ],
        '2026_08_08_000004_add_probe_failure_started_at' => [
            'columns' => ['v2_security_node_state' => ['failure_started_at']],
        ],
        '2026_08_08_000005_add_probe_first_healthy_at' => [
            'columns' => ['v2_security_node_state' => ['first_healthy_at'], 'v2_node_block_event' => ['monitoring_first_healthy_at']],
        ],
        '2026_08_08_000006_add_access_log_ua_classification' => [
            'columns' => ['v2_node_access_log' => ['ua_hash', 'client_family', 'client_version', 'client_platform']],
        ],
        '2026_08_08_000007_create_node_entry_pool_tables' => [
            'tables' => ['v2_node_entry_pool', 'v2_node_entry_setting'],
            'columns' => ['v2_node_entry_pool' => ['server_type', 'server_id', 'host_encrypted', 'health_status'], 'v2_node_entry_setting' => ['delivery_mode', 'check_url', 'check_interval']],
        ],
        '2026_08_09_000008_create_node_access_snapshot_table' => [
            'tables' => ['v2_node_access_snapshot'],
            'columns' => ['v2_node_access_snapshot' => ['access_log_id', 'user_id', 'snapshot_id', 'requested_at']],
        ],
    ];

    public function handle(): int
    {
        $this->info('Checking registered database migrations...');
        foreach ($this->registeredMigrations() as $path) {
            if (!is_file(base_path($path))) throw new RuntimeException("Registered migration is missing: {$path}");
            $this->line("  - {$path}");
            $this->reconcileLegacyMigration($path);
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

    private function reconcileLegacyMigration(string $path): void
    {
        $migration = pathinfo($path, PATHINFO_FILENAME);
        $requirements = self::LEGACY_SCHEMA[$migration] ?? null;
        if (!$requirements || !Schema::hasTable('migrations')) return;
        if (DB::table('migrations')->where('migration', $migration)->exists()) return;
        foreach ($requirements['tables'] ?? [] as $table) {
            if (!Schema::hasTable($table)) return;
        }
        foreach ($requirements['columns'] ?? [] as $table => $columns) {
            if (!Schema::hasTable($table)) return;
            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) return;
            }
        }
        $batch = (int)DB::table('migrations')->max('batch') + 1;
        DB::table('migrations')->insert(['migration' => $migration, 'batch' => $batch]);
        $this->warn("Detected an existing complete schema and repaired its missing migration record: {$migration}");
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
