<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateClientRemoteConfigCenter extends Migration
{
    public function up()
    {
        Schema::create('v2_client_config_setting', function (Blueprint $table) {
            $table->increments('id');
            $table->enum('encryption_mode', ['xor_base64', 'plain', 'signed_xor_v2'])->default('xor_base64');
            $table->text('legacy_xor_key_encrypted')->nullable();
            $table->text('signing_public_key')->nullable();
            $table->text('signing_private_key_encrypted')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });

        Schema::create('v2_client_config', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedBigInteger('config_version')->unique();
            $table->longText('content_json');
            $table->enum('status', ['draft', 'publishing', 'published', 'partial', 'archived'])->default('draft')->index();
            $table->enum('encryption_mode', ['xor_base64', 'plain', 'signed_xor_v2'])->default('xor_base64');
            $table->char('checksum', 64)->nullable();
            $table->string('change_summary', 500)->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->unsignedInteger('published_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });

        Schema::create('v2_client_storage_target', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->enum('provider', ['aliyun_oss', 'tencent_cos', 'ucloud_us3']);
            $table->boolean('enabled')->default(true)->index();
            $table->boolean('is_primary')->default(false);
            $table->string('region', 100)->nullable();
            $table->string('endpoint', 255);
            $table->string('bucket', 255);
            $table->string('object_key', 500)->default('config.json');
            $table->string('public_url', 1000);
            $table->text('access_key_id_encrypted')->nullable();
            $table->text('secret_key_encrypted')->nullable();
            $table->text('security_token_encrypted')->nullable();
            $table->text('extra_json')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });

        Schema::create('v2_client_config_publication', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('config_id')->index();
            $table->unsignedInteger('target_id')->index();
            $table->enum('status', ['queued', 'publishing', 'success', 'failed'])->default('queued')->index();
            $table->string('object_key', 500);
            $table->string('public_url', 1000)->nullable();
            $table->string('etag', 255)->nullable();
            $table->char('checksum', 64);
            $table->text('error')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedInteger('started_at')->nullable();
            $table->unsignedInteger('finished_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->unique(['config_id', 'target_id'], 'client_config_target_unique');
        });

        $now = time();
        DB::table('v2_client_config_setting')->insert([
            'encryption_mode' => 'xor_base64',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('v2_client_config')->insert([
            'config_version' => 1,
            'content_json' => json_encode($this->defaultConfig(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'status' => 'draft',
            'encryption_mode' => 'xor_base64',
            'checksum' => hash('sha256', json_encode($this->defaultConfig(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
            'change_summary' => '初始化客户端远程配置',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down()
    {
        Schema::dropIfExists('v2_client_config_publication');
        Schema::dropIfExists('v2_client_storage_target');
        Schema::dropIfExists('v2_client_config');
        Schema::dropIfExists('v2_client_config_setting');
    }

    private function defaultConfig(): array
    {
        return [
            'config_version' => '1',
            'panel_type' => 'v2board',
            'api_prefix' => '/api/v1',
            'domains' => [],
            'gateway_urls' => [],
            'update' => [
                'schema_version' => 2,
                'platforms' => array_reduce(['android', 'windows', 'macos', 'linux', 'ios', 'tvos'], function ($rows, $platform) {
                    $rows[$platform] = [
                        'enabled' => false,
                        'source' => in_array($platform, ['ios', 'tvos'], true) ? 'app_store' : 'direct',
                        'latest_version' => '',
                        'min_supported_version' => '',
                        'url' => '',
                        'force' => false,
                        'changelog' => ['zh_CN' => '', 'en_US' => ''],
                    ];
                    return $rows;
                }, []),
            ],
            'contact' => [
                'crisp_proxy_url' => '',
                'crisp_website_id' => '',
                'invite_domain' => '',
                'telegram_group' => '',
                'website' => [],
            ],
            'features' => [
                'balance_enabled' => true,
                'devices_enabled' => true,
                'gift_card_enabled' => true,
                'join_group_enabled' => true,
                'knowledge_base_enabled' => true,
                'orders_enabled' => true,
                'tickets_enabled' => true,
                'traffic_details_enabled' => true,
            ],
            'latency' => ['display_discount_percent' => 0],
        ];
    }
}
