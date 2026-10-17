<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class AddCouponEmailNotifications extends Migration
{
    public function up()
    {
        Schema::table('v2_coupon_template', function (Blueprint $table) {
            $table->boolean('email_notify_enabled')->default(true)->after('enabled');
        });
        Schema::table('v2_user_coupon', function (Blueprint $table) {
            $table->string('notification_status', 20)->default('pending')->index()->after('revoke_reason');
            $table->unsignedTinyInteger('notification_attempts')->default(0)->after('notification_status');
            $table->unsignedInteger('notification_sent_at')->nullable()->after('notification_attempts');
            $table->text('notification_error')->nullable()->after('notification_sent_at');
        });
        DB::table('v2_user_coupon')->update(['notification_status' => 'disabled']);
    }

    public function down()
    {
        Schema::table('v2_user_coupon', function (Blueprint $table) {
            $table->dropIndex(['notification_status']);
            $table->dropColumn(['notification_status', 'notification_attempts', 'notification_sent_at', 'notification_error']);
        });
        Schema::table('v2_coupon_template', function (Blueprint $table) {
            $table->dropColumn('email_notify_enabled');
        });
    }
}
