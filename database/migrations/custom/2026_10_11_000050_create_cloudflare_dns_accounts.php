<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCloudflareDnsAccounts extends Migration
{
    public function up()
    {
        Schema::create('v2_cloudflare_dns_account', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->text('api_token_encrypted');
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
        Schema::dropIfExists('v2_cloudflare_dns_account');
    }
}
