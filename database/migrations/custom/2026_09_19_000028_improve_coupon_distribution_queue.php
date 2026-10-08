<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ImproveCouponDistributionQueue extends Migration
{
    public function up()
    {
        DB::statement("ALTER TABLE `v2_coupon_distribution_task` MODIFY `status` ENUM('pending','running','completed','partial','failed','cancelled') NOT NULL DEFAULT 'pending'");
        Schema::table('v2_coupon_distribution_task', function (Blueprint $table) {
            $table->unsignedInteger('processed_count')->default(0)->after('estimated_count');
            $table->unsignedInteger('current_cursor')->default(0)->after('failed_count');
            $table->unsignedInteger('total_batches')->default(0)->after('current_cursor');
            $table->unsignedInteger('completed_batches')->default(0)->after('total_batches');
            $table->unsignedSmallInteger('attempts')->default(0)->after('completed_batches');
            $table->longText('failed_user_ids')->nullable()->after('attempts');
            $table->text('last_error')->nullable()->after('failed_user_ids');
            $table->unsignedInteger('queued_at')->nullable()->after('last_error');
            $table->unsignedInteger('heartbeat_at')->nullable()->index()->after('queued_at');
        });
    }

    public function down()
    {
        DB::table('v2_coupon_distribution_task')->where('status', 'failed')->update(['status' => 'partial']);
        Schema::table('v2_coupon_distribution_task', function (Blueprint $table) {
            $table->dropIndex(['heartbeat_at']);
            $table->dropColumn(['processed_count','current_cursor','total_batches','completed_batches','attempts','failed_user_ids','last_error','queued_at','heartbeat_at']);
        });
        DB::statement("ALTER TABLE `v2_coupon_distribution_task` MODIFY `status` ENUM('pending','running','completed','partial','cancelled') NOT NULL DEFAULT 'pending'");
    }
}
