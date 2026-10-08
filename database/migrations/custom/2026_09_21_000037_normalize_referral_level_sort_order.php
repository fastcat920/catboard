<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class NormalizeReferralLevelSortOrder extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_referral_level') || !Schema::hasColumn('v2_referral_level', 'sort')) {
            return;
        }

        $hasInitialLevel = DB::table('v2_referral_level')
            ->where('required_invites', 0)
            ->where('required_revenue', 0)
            ->exists();
        if (!$hasInitialLevel) {
            $baseCommissionRate = Schema::hasTable('v2_referral_setting')
                ? (int)DB::table('v2_referral_setting')->value('base_commission_rate')
                : 10;
            DB::table('v2_referral_level')->insert([
                'name' => '普通会员',
                'name_en' => 'Standard Member',
                'description' => '新用户默认等级',
                'description_en' => 'Default level for new users',
                'required_invites' => 0,
                'required_revenue' => 0,
                'commission_rate' => $baseCommissionRate,
                'member_discount' => 0,
                'valid_days' => 0,
                'retain_invites' => 0,
                'retain_revenue' => 0,
                'sort' => 0,
                'enabled' => 1,
                'created_at' => time(),
                'updated_at' => time(),
            ]);
        } else {
            $existingInitialLevelId = DB::table('v2_referral_level')
                ->where('required_invites', 0)
                ->where('required_revenue', 0)
                ->orderBy('sort', 'DESC')
                ->orderBy('id', 'DESC')
                ->value('id');
            DB::table('v2_referral_level')->where('id', $existingInitialLevelId)->update([
                'enabled' => 1,
                'valid_days' => 0,
                'updated_at' => time(),
            ]);
        }

        $query = DB::table('v2_referral_level')->orderBy('required_invites');
        if (Schema::hasColumn('v2_referral_level', 'required_revenue')) {
            $query->orderBy('required_revenue');
        }

        $levels = $query->orderBy('id')->get(['id']);
        DB::transaction(function () use ($levels) {
            foreach ($levels as $index => $level) {
                DB::table('v2_referral_level')->where('id', $level->id)->update([
                    'sort' => ($index + 1) * 10,
                    'updated_at' => time(),
                ]);
            }
        });

        if (Schema::hasTable('v2_user') && Schema::hasColumn('v2_user', 'referral_level_id')) {
            $initialLevelId = DB::table('v2_referral_level')
                ->where('enabled', 1)
                ->where('required_invites', 0)
                ->where('required_revenue', 0)
                ->orderBy('sort', 'DESC')
                ->value('id');
            if ($initialLevelId) {
                DB::table('v2_user')->whereNull('referral_level_id')->update([
                    'referral_level_id' => $initialLevelId,
                    'referral_level_expires_at' => null,
                ]);
            }
        }
    }

    public function down()
    {
        // 等级顺序属于业务数据，回滚时保留管理员后续调整结果。
    }
}
