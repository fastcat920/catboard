<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateCommissionLedger extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_commission_ledger')) {
            Schema::create('v2_commission_ledger', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id')->index();
                $table->string('type', 40)->index();
                $table->bigInteger('amount');
                $table->unsignedBigInteger('balance_before')->nullable();
                $table->unsignedBigInteger('balance_after')->nullable();
                $table->string('status', 20)->default('completed')->index();
                $table->string('source_key', 120)->unique();
                $table->string('source_type', 40)->nullable();
                $table->unsignedBigInteger('source_id')->nullable();
                $table->unsignedInteger('order_id')->nullable()->index();
                $table->unsignedInteger('ticket_id')->nullable()->index();
                $table->string('trade_no', 64)->nullable()->index();
                $table->string('description')->nullable();
                $table->text('meta')->nullable();
                $table->unsignedInteger('created_at')->index();
                $table->unsignedInteger('updated_at');
            });
        }

        if (Schema::hasTable('v2_commission_log')) {
            DB::table('v2_commission_log')->orderBy('id')->chunk(500, function ($rows) {
                $inserts = [];
                foreach ($rows as $row) {
                    $inserts[] = [
                        'user_id' => $row->invite_user_id,
                        'type' => 'commission_income',
                        'amount' => $row->get_amount,
                        'balance_before' => null,
                        'balance_after' => null,
                        'status' => 'completed',
                        'source_key' => 'commission_log:' . $row->id,
                        'source_type' => 'commission_log',
                        'source_id' => $row->id,
                        'order_id' => null,
                        'ticket_id' => null,
                        'trade_no' => $row->trade_no,
                        'description' => '邀请订单返佣',
                        'meta' => json_encode(['order_amount' => (int)$row->order_amount, 'invited_user_id' => (int)$row->user_id]),
                        'created_at' => $row->created_at,
                        'updated_at' => $row->updated_at,
                    ];
                }
                if ($inserts) DB::table('v2_commission_ledger')->insertOrIgnore($inserts);
            });
        }

        if (Schema::hasTable('v2_order')) {
            DB::table('v2_order')->where('callback_no', '佣金划转 Commission transfer')->orderBy('id')->chunk(500, function ($rows) {
                $inserts = [];
                foreach ($rows as $row) {
                    $amount = (int)$row->surplus_amount;
                    if ($amount <= 0) continue;
                    $inserts[] = [
                        'user_id' => $row->user_id,
                        'type' => 'transfer_out',
                        'amount' => -$amount,
                        'balance_before' => null,
                        'balance_after' => null,
                        'status' => 'completed',
                        'source_key' => 'commission_transfer:' . $row->id,
                        'source_type' => 'order',
                        'source_id' => $row->id,
                        'order_id' => $row->id,
                        'ticket_id' => null,
                        'trade_no' => $row->trade_no,
                        'description' => '佣金划转至钱包余额',
                        'meta' => null,
                        'created_at' => $row->created_at,
                        'updated_at' => $row->updated_at,
                    ];
                }
                if ($inserts) DB::table('v2_commission_ledger')->insertOrIgnore($inserts);
            });
        }

        if (Schema::hasTable('v2_referral_reward')) {
            DB::table('v2_referral_reward')->where('reward_type', 'commission_balance')->orderBy('id')->chunk(500, function ($rows) {
                $inserts = [];
                foreach ($rows as $row) {
                    $inserts[] = [
                        'user_id' => $row->user_id,
                        'type' => 'reward_income',
                        'amount' => (int)$row->reward_value,
                        'balance_before' => null,
                        'balance_after' => null,
                        'status' => $row->status === 'reversed' ? 'reversed' : 'completed',
                        'source_key' => 'referral_reward:' . $row->id,
                        'source_type' => 'referral_reward',
                        'source_id' => $row->id,
                        'order_id' => $row->order_id,
                        'ticket_id' => null,
                        'trade_no' => null,
                        'description' => $row->description ?: '邀请佣金奖励',
                        'meta' => null,
                        'created_at' => $row->created_at,
                        'updated_at' => $row->updated_at,
                    ];
                }
                if ($inserts) DB::table('v2_commission_ledger')->insertOrIgnore($inserts);
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('v2_commission_ledger');
    }
}
