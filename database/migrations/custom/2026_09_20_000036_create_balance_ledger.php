<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateBalanceLedger extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_balance_ledger')) {
            Schema::create('v2_balance_ledger', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id')->index();
                $table->string('type', 40)->index();
                $table->bigInteger('amount');
                $table->unsignedBigInteger('balance_before')->nullable();
                $table->unsignedBigInteger('balance_after')->nullable();
                $table->string('status', 20)->default('completed')->index();
                $table->string('source_key', 160)->unique();
                $table->string('source_type', 40)->nullable();
                $table->unsignedBigInteger('source_id')->nullable();
                $table->unsignedInteger('order_id')->nullable()->index();
                $table->string('trade_no', 64)->nullable()->index();
                $table->string('description')->nullable();
                $table->text('meta')->nullable();
                $table->unsignedInteger('created_at')->index();
                $table->unsignedInteger('updated_at');
                $table->index(['user_id', 'created_at']);
            });
        }

        $this->backfillOrders();
        $this->backfillGiftcards();
        $this->backfillReferralRewards();
    }

    private function backfillOrders(): void
    {
        if (!Schema::hasTable('v2_order')) return;

        DB::table('v2_order')->orderBy('id')->chunk(500, function ($orders) {
            $rows = [];
            foreach ($orders as $order) {
                $createdAt = (int)$order->created_at;
                $updatedAt = (int)$order->updated_at;
                $isTransfer = $order->callback_no === '佣金划转 Commission transfer';

                if ((int)$order->type === 9 && (int)$order->status === 3) {
                    $amount = $isTransfer ? (int)$order->surplus_amount : (int)$order->total_amount;
                    if ($amount > 0) {
                        $rows[] = $this->row($order, $isTransfer ? 'commission_transfer' : 'deposit', $amount,
                            ($isTransfer ? 'commission_transfer:' : 'deposit:') . $order->id,
                            $isTransfer ? '佣金划转至钱包余额' : '余额充值', $updatedAt);
                    }
                }

                if ((int)$order->balance_amount > 0) {
                    $rows[] = $this->row($order, 'purchase', -(int)$order->balance_amount,
                        'purchase:' . $order->id, '订单使用余额', $createdAt);
                    if ((int)$order->status === 2) {
                        $rows[] = $this->row($order, 'refund', (int)$order->balance_amount,
                            'order_cancel_refund:' . $order->id, '取消订单退回余额', $updatedAt);
                    }
                }

                if ((int)$order->refund_amount > 0 && (int)$order->status === 3) {
                    $rows[] = $this->row($order, 'refund', (int)$order->refund_amount,
                        'order_refund:' . $order->id, '订单差额退回余额', $updatedAt);
                }
            }
            if ($rows) DB::table('v2_balance_ledger')->insertOrIgnore($rows);
        });
    }

    private function row($order, string $type, int $amount, string $key, string $description, int $time): array
    {
        return [
            'user_id' => $order->user_id,
            'type' => $type,
            'amount' => $amount,
            'balance_before' => null,
            'balance_after' => null,
            'status' => 'completed',
            'source_key' => $key,
            'source_type' => 'order',
            'source_id' => $order->id,
            'order_id' => $order->id,
            'trade_no' => $order->trade_no,
            'description' => $description,
            'meta' => null,
            'created_at' => $time,
            'updated_at' => $time,
        ];
    }

    private function backfillGiftcards(): void
    {
        if (!Schema::hasTable('v2_giftcard_redemption')) return;
        DB::table('v2_giftcard_redemption')->where('type', 1)->orderBy('id')->chunk(500, function ($records) {
            $rows = [];
            foreach ($records as $record) {
                $time = (int)($record->redeemed_at ?: $record->created_at);
                $rows[] = [
                    'user_id' => $record->user_id, 'type' => 'giftcard', 'amount' => (int)$record->value,
                    'balance_before' => null, 'balance_after' => null, 'status' => 'completed',
                    'source_key' => 'giftcard_redemption:' . $record->id, 'source_type' => 'giftcard_redemption',
                    'source_id' => $record->id, 'order_id' => null, 'trade_no' => null,
                    'description' => '礼品卡兑换余额', 'meta' => null,
                    'created_at' => $time, 'updated_at' => $time,
                ];
            }
            if ($rows) DB::table('v2_balance_ledger')->insertOrIgnore($rows);
        });
    }

    private function backfillReferralRewards(): void
    {
        if (!Schema::hasTable('v2_referral_reward')) return;
        DB::table('v2_referral_reward')->where('reward_type', 'balance')->orderBy('id')->chunk(500, function ($rewards) {
            $rows = [];
            foreach ($rewards as $reward) {
                $rows[] = [
                    'user_id' => $reward->user_id, 'type' => 'referral_reward', 'amount' => (int)$reward->reward_value,
                    'balance_before' => null, 'balance_after' => null,
                    'status' => 'completed',
                    'source_key' => 'referral_reward:' . $reward->id, 'source_type' => 'referral_reward',
                    'source_id' => $reward->id, 'order_id' => $reward->order_id, 'trade_no' => null,
                    'description' => $reward->description ?: '邀请奖励', 'meta' => null,
                    'created_at' => (int)$reward->created_at, 'updated_at' => (int)$reward->updated_at,
                ];
                if ($reward->status === 'reversed') {
                    $rows[] = [
                        'user_id' => $reward->user_id, 'type' => 'referral_reversal', 'amount' => -(int)$reward->reward_value,
                        'balance_before' => null, 'balance_after' => null, 'status' => 'completed',
                        'source_key' => 'referral_reward_reverse:' . $reward->id, 'source_type' => 'referral_reward',
                        'source_id' => $reward->id, 'order_id' => $reward->order_id, 'trade_no' => null,
                        'description' => '邀请奖励撤销', 'meta' => null,
                        'created_at' => (int)$reward->updated_at, 'updated_at' => (int)$reward->updated_at,
                    ];
                }
            }
            if ($rows) DB::table('v2_balance_ledger')->insertOrIgnore($rows);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_balance_ledger');
    }
}
