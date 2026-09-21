<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCouponCenter extends Migration
{
    public function up()
    {
        Schema::create('v2_coupon_template', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name'); $table->string('name_en')->nullable();
            $table->text('description')->nullable(); $table->text('description_en')->nullable();
            $table->enum('discount_type', ['fixed', 'percent']);
            $table->unsignedInteger('discount_value');
            $table->text('plan_ids')->nullable(); $table->text('periods')->nullable();
            $table->boolean('first_order_only')->default(false);
            $table->boolean('allow_renewal')->default(true);
            $table->boolean('stackable')->default(false);
            $table->unsignedInteger('per_user_limit')->default(1);
            $table->unsignedInteger('total_limit')->nullable();
            $table->unsignedInteger('daily_limit')->nullable();
            $table->unsignedSmallInteger('valid_days')->nullable();
            $table->unsignedInteger('starts_at')->nullable(); $table->unsignedInteger('ends_at')->nullable();
            $table->unsignedInteger('issued_count')->default(0); $table->unsignedInteger('used_count')->default(0);
            $table->boolean('enabled')->default(true)->index();
            $table->unsignedInteger('created_at'); $table->unsignedInteger('updated_at');
        });
        Schema::create('v2_user_coupon', function (Blueprint $table) {
            $table->bigIncrements('id'); $table->unsignedInteger('template_id')->index(); $table->unsignedInteger('user_id')->index();
            $table->string('source', 50)->index(); $table->string('source_reference', 100)->nullable();
            $table->enum('status', ['pending', 'available', 'locked', 'used', 'expired', 'revoked'])->default('available')->index();
            $table->unsignedInteger('starts_at'); $table->unsignedInteger('expires_at')->index();
            $table->string('locked_trade_no', 36)->nullable()->index(); $table->unsignedInteger('locked_at')->nullable();
            $table->unsignedInteger('order_id')->nullable()->index(); $table->unsignedInteger('used_at')->nullable();
            $table->string('revoke_reason')->nullable(); $table->unsignedInteger('created_at'); $table->unsignedInteger('updated_at');
            $table->unique(['template_id', 'user_id', 'source', 'source_reference'], 'user_coupon_issue_unique');
        });
        Schema::create('v2_coupon_distribution_task', function (Blueprint $table) {
            $table->bigIncrements('id'); $table->unsignedInteger('template_id')->index(); $table->unsignedInteger('admin_id')->nullable();
            $table->string('name'); $table->text('filters'); $table->enum('status', ['pending', 'running', 'completed', 'partial', 'cancelled'])->default('pending')->index();
            $table->unsignedInteger('estimated_count')->default(0); $table->unsignedInteger('success_count')->default(0);
            $table->unsignedInteger('skipped_count')->default(0); $table->unsignedInteger('failed_count')->default(0);
            $table->unsignedInteger('completed_at')->nullable(); $table->unsignedInteger('created_at'); $table->unsignedInteger('updated_at');
        });
        Schema::create('v2_coupon_operation_record', function (Blueprint $table) {
            $table->bigIncrements('id'); $table->unsignedInteger('user_coupon_id')->nullable()->index(); $table->unsignedInteger('user_id')->nullable()->index();
            $table->unsignedInteger('admin_id')->nullable(); $table->string('action', 50)->index(); $table->text('detail')->nullable(); $table->unsignedInteger('created_at')->index();
        });
        Schema::table('v2_order', function (Blueprint $table) {
            $table->unsignedBigInteger('user_coupon_id')->nullable()->index()->after('coupon_id');
            $table->unsignedInteger('coupon_discount_amount')->default(0)->after('discount_amount');
            $table->text('coupon_snapshot')->nullable()->after('coupon_discount_amount');
        });
        Schema::table('v2_referral_setting', function (Blueprint $table) {
            $table->unsignedInteger('newcomer_coupon_template_id')->nullable()->after('newcomer_coupon_id');
        });
    }

    public function down()
    {
        Schema::table('v2_referral_setting', function (Blueprint $table) { $table->dropColumn('newcomer_coupon_template_id'); });
        Schema::table('v2_order', function (Blueprint $table) { $table->dropIndex(['user_coupon_id']); $table->dropColumn(['user_coupon_id','coupon_discount_amount','coupon_snapshot']); });
        Schema::dropIfExists('v2_coupon_operation_record'); Schema::dropIfExists('v2_coupon_distribution_task');
        Schema::dropIfExists('v2_user_coupon'); Schema::dropIfExists('v2_coupon_template');
    }
}
