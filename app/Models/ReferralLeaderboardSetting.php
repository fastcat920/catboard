<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralLeaderboardSetting extends Model
{
    protected $table = 'v2_referral_leaderboard_setting';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
    protected $casts = ['reward_rules' => 'array'];

    public static function current()
    {
        return static::first() ?: static::create(['enabled' => 0, 'mask_email' => 1, 'reward_rules' => []]);
    }

    public function boardConfig(string $period): array
    {
        $stored = (array)($this->reward_rules ?: []);
        $config = (array)($stored['boards'][$period] ?? []);
        return [
            'enabled' => array_key_exists('enabled', $config) ? (bool)$config['enabled'] : true,
            'metric' => in_array($config['metric'] ?? 'invites', ['invites', 'revenue', 'income'], true)
                ? $config['metric']
                : 'invites',
        ];
    }

    public function periodRules(string $period): array
    {
        $stored = (array)($this->reward_rules ?: []);
        return array_values(array_filter((array)($stored[$period] ?? []), 'is_array'));
    }

    public function boards(): array
    {
        $boards = [];
        foreach (['week', 'month', 'total'] as $period) $boards[$period] = $this->boardConfig($period);
        return $boards;
    }
}
