<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddKnowledgeEnglishContent extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('v2_knowledge', 'category_en')) {
            Schema::table('v2_knowledge', function (Blueprint $table) {
                $table->string('category_en')->nullable()->after('category');
            });
        }
        if (!Schema::hasColumn('v2_knowledge', 'title_en')) {
            Schema::table('v2_knowledge', function (Blueprint $table) {
                $table->string('title_en')->nullable()->after('title');
            });
        }
        if (!Schema::hasColumn('v2_knowledge', 'body_en')) {
            Schema::table('v2_knowledge', function (Blueprint $table) {
                $table->text('body_en')->nullable()->after('body');
            });
        }
    }

    public function down()
    {
        foreach (['category_en', 'title_en', 'body_en'] as $column) {
            if (!Schema::hasColumn('v2_knowledge', $column)) continue;
            Schema::table('v2_knowledge', function (Blueprint $table) use ($column) {
                $table->dropColumn($column);
            });
        }
    }
}
