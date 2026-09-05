<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Schema\Blueprint;
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
        $this->ensureTrialIdentityKey();
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

        $this->repairRequiredSchema();
        $this->validateRequiredSchema();
        if (!Schema::hasTable('v2_security_setting')) {
            throw new RuntimeException('Security settings table is missing after migrations');
        }
        $this->runDataUpgrade('database_upgrade.backfill_ua.v1', 'security:backfill-ua');
        $this->runDataUpgrade('database_upgrade.backfill_access_snapshots.v1', 'security:backfill-access-snapshots');
        $this->info('Database upgrade completed. No manual migration or backfill command is required.');
        return 0;
    }

    private function ensureTrialIdentityKey(): void
    {
        if (strlen((string)config('account.trial_identity_key', '')) >= 32) return;
        $envPath = base_path('.env');
        if (!is_file($envPath) || !is_readable($envPath)) {
            throw new RuntimeException('TRIAL_IDENTITY_KEY is missing and .env is not readable.');
        }

        $contents = file_get_contents($envPath);
        if ($contents === false) throw new RuntimeException('Unable to read .env while generating TRIAL_IDENTITY_KEY.');
        $key = '';
        if (preg_match('/^TRIAL_IDENTITY_KEY=(.*)$/m', $contents, $matches)) {
            $key = trim(trim($matches[1]), "\"'");
        }
        $generated = strlen($key) < 32;
        if ($generated) {
            if (!is_writable($envPath)) {
                throw new RuntimeException('TRIAL_IDENTITY_KEY is missing and .env is not writable.');
            }
            $key = bin2hex(random_bytes(32));
            if (preg_match('/^TRIAL_IDENTITY_KEY=.*$/m', $contents)) {
                $contents = preg_replace('/^TRIAL_IDENTITY_KEY=.*$/m', 'TRIAL_IDENTITY_KEY=' . $key, $contents, 1);
            } else {
                $contents = rtrim($contents) . PHP_EOL . PHP_EOL . 'TRIAL_IDENTITY_KEY=' . $key . PHP_EOL;
            }
            if (file_put_contents($envPath, $contents, LOCK_EX) === false) {
                throw new RuntimeException('Unable to persist TRIAL_IDENTITY_KEY to .env.');
            }
        }

        putenv('TRIAL_IDENTITY_KEY=' . $key);
        $_ENV['TRIAL_IDENTITY_KEY'] = $key;
        $_SERVER['TRIAL_IDENTITY_KEY'] = $key;
        config(['account.trial_identity_key' => $key]);
        Artisan::call('config:clear');
        Artisan::call('config:cache');
        config(['account.trial_identity_key' => $key]);
        $this->warn(($generated ? 'Generated' : 'Recovered') . ' and cached TRIAL_IDENTITY_KEY for account trial protection.');
    }

    private function repairRequiredSchema(): void
    {
        if (Schema::hasTable('v2_user')) {
            $columns = [
                'deleted_at' => function (Blueprint $table) {
                    $table->unsignedInteger('deleted_at')->nullable()->after('remarks')->index();
                },
                'deletion_type' => function (Blueprint $table) {
                    $table->string('deletion_type', 16)->nullable()->after('deleted_at');
                },
                'deletion_reason' => function (Blueprint $table) {
                    $table->text('deletion_reason')->nullable()->after('deletion_type');
                },
                'deleted_by_admin_id' => function (Blueprint $table) {
                    $table->unsignedInteger('deleted_by_admin_id')->nullable()->after('deletion_reason');
                },
            ];
            foreach ($columns as $column => $definition) {
                if (Schema::hasColumn('v2_user', $column)) continue;
                Schema::table('v2_user', $definition);
                $this->warn("Repaired missing schema column: v2_user.{$column}");
            }
        }

        if (!Schema::hasTable('v2_trial_claim')) {
            Schema::create('v2_trial_claim', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->char('email_hash', 64)->unique();
                $table->unsignedInteger('user_id')->nullable()->index();
                $table->unsignedInteger('claimed_at');
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
            });
            $this->warn('Repaired missing schema table: v2_trial_claim');
        }

        if (!Schema::hasTable('v2_account_deletion_log')) {
            Schema::create('v2_account_deletion_log', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id')->index();
                $table->char('email_hash', 64);
                $table->string('deletion_type', 16);
                $table->unsignedInteger('admin_id')->nullable();
                $table->text('reason')->nullable();
                $table->unsignedInteger('created_at');
            });
            $this->warn('Repaired missing schema table: v2_account_deletion_log');
        }

        if (!Schema::hasTable('v2_giftcard_redemption')) {
            Schema::create('v2_giftcard_redemption', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedInteger('giftcard_id')->index();
                $table->unsignedInteger('user_id');
                $table->string('code_snapshot');
                $table->string('name_snapshot');
                $table->unsignedTinyInteger('type');
                $table->integer('value')->nullable();
                $table->unsignedInteger('plan_id')->nullable();
                $table->unsignedInteger('redeemed_at');
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
                $table->unique(['giftcard_id', 'user_id']);
                $table->index(['user_id', 'redeemed_at']);
            });
            $this->warn('Repaired missing schema table: v2_giftcard_redemption');
        }
    }

    private function validateRequiredSchema(): void
    {
        $missing = [];
        foreach (['v2_trial_claim', 'v2_account_deletion_log', 'v2_giftcard_redemption'] as $table) {
            if (!Schema::hasTable($table)) $missing[] = $table;
        }
        foreach (['deleted_at', 'deletion_type', 'deletion_reason', 'deleted_by_admin_id'] as $column) {
            if (!Schema::hasColumn('v2_user', $column)) $missing[] = 'v2_user.' . $column;
        }
        if ($missing) {
            throw new RuntimeException('Required database schema is incomplete: ' . implode(', ', $missing));
        }
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
