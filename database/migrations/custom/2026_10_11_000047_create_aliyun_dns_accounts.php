<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateAliyunDnsAccounts extends Migration
{
    public function up()
    {
        Schema::create('v2_aliyun_dns_account', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->text('access_key_id_encrypted');
            $table->text('access_key_secret_encrypted');
            $table->text('security_token_encrypted')->nullable();
            $table->boolean('enabled')->default(true)->index();
            $table->boolean('is_default')->default(false);
            $table->unsignedInteger('last_connected_at')->nullable();
            $table->string('last_error', 1000)->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_aliyun_dns_account');
    }
}
