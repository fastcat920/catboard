<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateGiftcardRedemptionsTable extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_giftcard_redemption')) {
            return;
        }

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
    }

    public function down()
    {
        Schema::dropIfExists('v2_giftcard_redemption');
    }
}
