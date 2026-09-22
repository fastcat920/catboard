<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateMarketingActivityCenter extends Migration
{
    public function up()
    {
        Schema::create('v2_flash_sale_campaign', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name'); $table->string('name_en')->nullable();
            $table->text('description')->nullable(); $table->text('description_en')->nullable();
            $table->unsignedInteger('starts_at')->index(); $table->unsignedInteger('ends_at')->index();
            $table->enum('audience', ['all', 'new', 'existing'])->default('all');
            $table->text('plan_ids')->nullable(); $table->text('periods')->nullable();
            $table->enum('discount_type', ['fixed_price', 'percent_off', 'amount_off']);
            $table->unsignedInteger('discount_value'); $table->unsignedInteger('minimum_amount')->default(0);
            $table->boolean('allow_coupon')->default(true); $table->boolean('allow_member_discount')->default(true); $table->unsignedInteger('priority')->default(0);
            $table->unsignedInteger('per_user_limit')->nullable(); $table->unsignedInteger('total_limit')->nullable();
            $table->unsignedInteger('order_count')->default(0); $table->unsignedBigInteger('revenue')->default(0); $table->unsignedBigInteger('discount_total')->default(0);
            $table->boolean('enabled')->default(true)->index();
            $table->unsignedInteger('created_at'); $table->unsignedInteger('updated_at');
        });
        Schema::table('v2_order', function (Blueprint $table) {
            $table->unsignedInteger('flash_sale_campaign_id')->nullable()->index()->after('plan_id');
            $table->unsignedInteger('flash_sale_discount_amount')->default(0)->after('discount_amount');
            $table->text('flash_sale_snapshot')->nullable()->after('coupon_snapshot');
        });
    }

    public function down()
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->dropIndex(['flash_sale_campaign_id']);
            $table->dropColumn(['flash_sale_campaign_id', 'flash_sale_discount_amount', 'flash_sale_snapshot']);
        });
        Schema::dropIfExists('v2_flash_sale_campaign');
    }
}
