<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\PublishClientRemoteConfig;
use App\Models\ClientConfigPublication;
use App\Models\ClientConfigSetting;
use App\Models\ClientRemoteConfig;
use App\Models\ClientStorageTarget;
use App\Services\ClientConfigCryptoService;
use App\Services\ClientConfigStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClientRemoteConfigController extends Controller
{
    public function overview()
    {
        $setting = ClientConfigSetting::current();
        $draft = ClientRemoteConfig::whereIn('status', ['draft', 'partial'])->orderByDesc('config_version')->first();
        $published = ClientRemoteConfig::where('status', 'published')->orderByDesc('config_version')->first();
        return response([
            'data' => [
                'draft' => $draft ? $this->configRow($draft, true) : null,
                'published' => $published ? $this->configRow($published, true) : null,
                'versions' => ClientRemoteConfig::orderByDesc('config_version')->limit(50)->get()->map(function ($row) { return $this->configRow($row); }),
                'targets' => ClientStorageTarget::orderByDesc('is_primary')->orderBy('id')->get()->map(function ($row) { return $this->targetRow($row); }),
                'publications' => ClientConfigPublication::with('target:id,name,provider')->orderByDesc('id')->limit(100)->get(),
                'settings' => [
                    'encryption_mode' => $setting->encryption_mode,
                    'has_xor_key' => (bool)$setting->legacy_xor_key_encrypted,
                    'signing_public_key' => $setting->signing_public_key,
                    'has_signing_key' => (bool)$setting->signing_private_key_encrypted,
                ],
            ],
        ]);
    }

    public function saveDraft(Request $request, ClientConfigCryptoService $crypto)
    {
        $data = $request->validate([
            'id' => 'nullable|integer|exists:v2_client_config,id',
            'content' => 'required|array',
            'content.panel_type' => 'required|string|max:50',
            'content.domains' => 'required|array|min:1|max:20',
            'content.domains.*' => 'required|url|max:1000',
            'content.update' => 'required|array',
            'content.contact' => 'required|array',
            'content.features' => 'required|array',
            'content.ticket' => 'required|array',
            'encryption_mode' => 'required|in:xor_base64,plain,signed_xor_v2',
            'change_summary' => 'nullable|string|max:500',
        ]);
        $this->validateRemoteUrls($data['content']);

        $row = !empty($data['id']) ? ClientRemoteConfig::findOrFail($data['id']) : null;
        if (!$row || !in_array($row->status, ['draft', 'partial'], true)) {
            $row = new ClientRemoteConfig();
            $row->config_version = ((int)ClientRemoteConfig::max('config_version')) + 1;
            $row->status = 'draft';
        }
        $content = $data['content'];
        $content['config_version'] = (string)$row->config_version;
        $row->content_json = $crypto->canonicalJson($content);
        $row->checksum = $crypto->checksum($content);
        $row->encryption_mode = $data['encryption_mode'];
        $row->change_summary = trim((string)($data['change_summary'] ?? '')) ?: null;
        if ($row->status === 'partial') $row->status = 'draft';
        $row->save();
        return response(['data' => $this->configRow($row, true)]);
    }

    public function cloneVersion(Request $request, ClientConfigCryptoService $crypto)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_client_config,id']);
        $source = ClientRemoteConfig::findOrFail($data['id']);
        $content = $source->content;
        $version = ((int)ClientRemoteConfig::max('config_version')) + 1;
        $content['config_version'] = (string)$version;
        $contentJson = $crypto->canonicalJson($content);
        $row = ClientRemoteConfig::create([
            'config_version' => $version,
            'content_json' => $contentJson,
            'status' => 'draft',
            'encryption_mode' => $source->encryption_mode,
            'checksum' => hash('sha256', $contentJson),
            'change_summary' => '基于 v' . $source->config_version . ' 创建',
        ]);
        return response(['data' => $this->configRow($row, true)]);
    }

    public function saveSettings(Request $request, ClientConfigCryptoService $crypto)
    {
        $data = $request->validate([
            'encryption_mode' => 'required|in:xor_base64,plain,signed_xor_v2',
            'xor_key' => 'nullable|string|min:8|max:500',
            'regenerate_signing_key' => 'sometimes|boolean',
        ]);
        $setting = ClientConfigSetting::current();
        $setting->encryption_mode = $data['encryption_mode'];
        if (!empty($data['xor_key'])) $setting->legacy_xor_key_encrypted = Crypt::encryptString($data['xor_key']);
        if (!empty($data['regenerate_signing_key'])) {
            $setting->signing_public_key = null;
            $setting->signing_private_key_encrypted = null;
        }
        $setting->save();
        if ($setting->encryption_mode === 'signed_xor_v2') $crypto->ensureSigningKeyPair($setting);
        return response(['data' => [
            'encryption_mode' => $setting->encryption_mode,
            'has_xor_key' => (bool)$setting->legacy_xor_key_encrypted,
            'signing_public_key' => $setting->signing_public_key,
            'has_signing_key' => (bool)$setting->signing_private_key_encrypted,
        ]]);
    }

    public function saveTarget(Request $request)
    {
        $data = $request->validate([
            'id' => 'nullable|integer|exists:v2_client_storage_target,id',
            'name' => 'required|string|max:100',
            'provider' => 'required|in:aliyun_oss,tencent_cos,ucloud_us3',
            'enabled' => 'required|boolean',
            'is_primary' => 'required|boolean',
            'region' => 'nullable|string|max:100',
            'endpoint' => ['required', 'string', 'max:255', 'regex:/^(https:\/\/)?[a-z0-9.-]+(?::[0-9]+)?$/i'],
            'bucket' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9][a-z0-9.-]*$/i'],
            'object_key' => ['required', 'string', 'max:500', 'regex:/^[^?#]+$/'],
            'public_url' => 'required|url|max:1000',
            'access_key_id' => 'nullable|string|max:500',
            'secret_key' => 'nullable|string|max:1000',
            'security_token' => 'nullable|string|max:2000',
        ]);
        if (stripos($data['public_url'], 'https://') !== 0) {
            throw ValidationException::withMessages(['public_url' => '公开访问地址必须使用 HTTPS']);
        }
        $target = !empty($data['id']) ? ClientStorageTarget::findOrFail($data['id']) : new ClientStorageTarget();
        if (!$target->exists && (empty($data['access_key_id']) || empty($data['secret_key']))) {
            throw ValidationException::withMessages(['access_key_id' => '新建目标时必须填写访问密钥']);
        }
        foreach (['name','provider','enabled','is_primary','region','endpoint','bucket','object_key','public_url'] as $field) {
            $target->{$field} = $data[$field] ?? null;
        }
        if (!empty($data['access_key_id'])) $target->access_key_id_encrypted = Crypt::encryptString($data['access_key_id']);
        if (!empty($data['secret_key'])) $target->secret_key_encrypted = Crypt::encryptString($data['secret_key']);
        if (!empty($data['security_token'])) $target->security_token_encrypted = Crypt::encryptString($data['security_token']);
        if ($target->is_primary) ClientStorageTarget::where('id', '<>', $target->id ?: 0)->update(['is_primary' => false, 'updated_at' => time()]);
        $target->save();
        return response(['data' => $this->targetRow($target)]);
    }

    public function dropTarget(Request $request)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_client_storage_target,id']);
        $target = ClientStorageTarget::findOrFail($data['id']);
        if ($target->publications()->whereIn('status', ['queued', 'publishing'])->exists()) abort(422, '该目标有正在执行的发布任务，暂时无法删除');
        return response(['data' => (bool)$target->delete()]);
    }

    public function testTarget(Request $request, ClientConfigStorageService $storage)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_client_storage_target,id']);
        $target = ClientStorageTarget::findOrFail($data['id']);
        $key = preg_replace('#[^/]+$#', '.fastcat-connection-test.txt', ltrim($target->object_key, '/'));
        $body = 'FastCat storage connection test ' . gmdate('c');
        $storage->upload($target, $key, $body);
        $url = $storage->publicUrlFor($target, $key);
        $storage->verifyPublicObject($url, $body);
        return response(['data' => ['success' => true, 'url' => $url]]);
    }

    public function preview(Request $request, ClientConfigCryptoService $crypto)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_client_config,id']);
        $row = ClientRemoteConfig::findOrFail($data['id']);
        $payload = $crypto->encode($row);
        return response(['data' => [
            'payload' => $payload,
            'bytes' => strlen($payload),
            'checksum' => hash('sha256', $payload),
            'encryption_mode' => $row->encryption_mode,
        ]]);
    }

    public function publish(Request $request, ClientConfigCryptoService $crypto)
    {
        $data = $request->validate([
            'config_id' => 'required|integer|exists:v2_client_config,id',
            'target_ids' => 'required|array|min:1',
            'target_ids.*' => 'integer|exists:v2_client_storage_target,id',
        ]);
        $config = ClientRemoteConfig::findOrFail($data['config_id']);
        if ($config->status === 'publishing') abort(422, '该版本正在发布，请勿重复提交');
        $targets = ClientStorageTarget::whereIn('id', array_unique($data['target_ids']))->where('enabled', true)->get();
        if ($targets->isEmpty()) abort(422, '没有可用的云存储目标');
        $payload = $crypto->encode($config);
        $checksum = hash('sha256', $payload);

        $publications = DB::transaction(function () use ($config, $targets, $checksum) {
            $config->status = 'publishing';
            $config->save();
            $rows = collect();
            foreach ($targets as $target) {
                $row = ClientConfigPublication::updateOrCreate(
                    ['config_id' => $config->id, 'target_id' => $target->id],
                    ['status' => 'queued', 'object_key' => $target->object_key, 'public_url' => null, 'etag' => null, 'checksum' => $checksum, 'error' => null, 'attempts' => 0, 'started_at' => null, 'finished_at' => null]
                );
                $rows->push($row);
            }
            return $rows;
        });
        foreach ($publications as $publication) PublishClientRemoteConfig::dispatch($publication->id)->onQueue('default');
        return response(['data' => $publications]);
    }

    public function retryPublication(Request $request)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_client_config_publication,id']);
        $row = ClientConfigPublication::findOrFail($data['id']);
        if (in_array($row->status, ['queued', 'publishing'], true)) abort(422, '该任务正在执行');
        $row->status = 'queued';
        $row->error = null;
        $row->finished_at = null;
        $row->save();
        $row->config()->update(['status' => 'publishing', 'updated_at' => time()]);
        PublishClientRemoteConfig::dispatch($row->id)->onQueue('default');
        return response(['data' => $row]);
    }

    private function configRow(ClientRemoteConfig $row, bool $withContent = false): array
    {
        $data = $row->toArray();
        unset($data['content_json']);
        if ($withContent) $data['content'] = $row->content;
        return $data;
    }

    private function targetRow(ClientStorageTarget $row): array
    {
        $data = $row->toArray();
        $data['has_credentials'] = (bool)($row->access_key_id_encrypted && $row->secret_key_encrypted);
        $data['access_key_hint'] = $row->access_key_id_encrypted ? '已安全保存' : '未设置';
        return $data;
    }

    private function validateRemoteUrls(array $content): void
    {
        $urls = array_merge((array)($content['domains'] ?? []), [
            $content['contact']['crisp_proxy_url'] ?? '',
            $content['contact']['website'] ?? '',
            $content['contact']['telegram_group'] ?? '',
        ]);
        foreach ((array)($content['update']['latest'] ?? []) as $platform) $urls[] = $platform['url'] ?? '';
        foreach ($urls as $url) {
            if ($url !== '' && stripos((string)$url, 'https://') !== 0) {
                throw ValidationException::withMessages(['content' => '远程配置中的网络地址必须使用 HTTPS：' . $url]);
            }
        }
    }
}
