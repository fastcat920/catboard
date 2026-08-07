<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\DB;

class SettingsService
{
    private const DEFAULTS = [
        'enabled' => true,
        'retention_days' => 30,
        'risk_window_seconds' => 300,
        'early_window_seconds' => 60,
        'health_enabled' => false,
        'health_timeout_seconds' => 3,
        'health_failures_to_alert' => 3,
        'auto_create_event' => true,
        'auto_suspend_score' => 0,
        'multi_account_ip_threshold' => 5,
        'alert_webhook_url' => '',
        'probe_interval_seconds' => 300,
        'probe_failures_to_event' => 3,
        'probe_result_window_seconds' => 600,
        'probe_page_refresh_seconds' => 30,
    ];

    public function all(): array
    {
        $values = self::DEFAULTS;
        try {
            foreach (DB::table('v2_security_setting')->get() as $row) {
                $values[$row->key] = json_decode($row->value, true);
            }
        } catch (\Throwable $e) {
            // Migration may not have run yet; security instrumentation must fail open.
        }
        return $values;
    }

    public function get(string $key, $default = null)
    {
        $values = $this->all();
        return array_key_exists($key, $values) ? $values[$key] : $default;
    }

    public function save(array $values): array
    {
        $allowed = array_intersect_key($values, self::DEFAULTS);
        if (array_key_exists('probe_page_refresh_seconds', $allowed)) {
            $refresh = (int)$allowed['probe_page_refresh_seconds'];
            $allowed['probe_page_refresh_seconds'] = $refresh <= 0 ? 0 : max(5, min(3600, $refresh));
        }
        foreach ($allowed as $key => $value) {
            DB::table('v2_security_setting')->updateOrInsert(
                ['key' => $key],
                ['value' => json_encode($value), 'updated_at' => time()]
            );
        }
        return $this->all();
    }
}
