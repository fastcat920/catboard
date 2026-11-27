<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class FreezeClientConfigPublication extends Migration
{
    public function up()
    {
        Schema::table('v2_client_config', function (Blueprint $table) {
            $table->longText('publication_payload')->nullable();
        });
    }

    public function down()
    {
        Schema::table('v2_client_config', function (Blueprint $table) {
            $table->dropColumn('publication_payload');
        });
    }
}
