<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCloudAccounts extends Migration
{
    public function up()
    {
        Schema::create('v2_cloud_account', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->string('provider', 32)->index();
            $table->text('access_key_id_encrypted');
            $table->text('access_key_secret_encrypted');
            $table->text('security_token_encrypted')->nullable();
            $table->boolean('enabled')->default(true)->index();
            $table->string('currency', 12)->nullable();
            $table->decimal('balance', 20, 6)->nullable();
            $table->decimal('current_month_amount', 20, 6)->nullable();
            $table->decimal('previous_month_amount', 20, 6)->nullable();
            $table->unsignedInteger('last_synced_at')->nullable();
            $table->string('last_error', 1000)->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_cloud_account');
    }
}
