<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddEnglishContentFields extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('v2_plan', 'name_en')) {
            Schema::table('v2_plan', function (Blueprint $table) {
                $table->string('name_en')->nullable()->after('name');
            });
        }
        if (!Schema::hasColumn('v2_plan', 'content_en')) {
            Schema::table('v2_plan', function (Blueprint $table) {
                $table->text('content_en')->nullable()->after('content');
            });
        }

        if (!Schema::hasColumn('v2_notice', 'title_en')) {
            Schema::table('v2_notice', function (Blueprint $table) {
                $table->string('title_en')->nullable()->after('title');
            });
        }
        if (!Schema::hasColumn('v2_notice', 'content_en')) {
            Schema::table('v2_notice', function (Blueprint $table) {
                $table->text('content_en')->nullable()->after('content');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('v2_plan', 'name_en')) {
            Schema::table('v2_plan', function (Blueprint $table) {
                $table->dropColumn('name_en');
            });
        }
        if (Schema::hasColumn('v2_plan', 'content_en')) {
            Schema::table('v2_plan', function (Blueprint $table) {
                $table->dropColumn('content_en');
            });
        }

        if (Schema::hasColumn('v2_notice', 'title_en')) {
            Schema::table('v2_notice', function (Blueprint $table) {
                $table->dropColumn('title_en');
            });
        }
        if (Schema::hasColumn('v2_notice', 'content_en')) {
            Schema::table('v2_notice', function (Blueprint $table) {
                $table->dropColumn('content_en');
            });
        }
    }
}
