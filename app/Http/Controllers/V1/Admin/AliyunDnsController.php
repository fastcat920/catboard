<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AliyunDnsAccount;
use App\Services\AliyunDnsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AliyunDnsController extends Controller
{
    public function overview()
    {
        return response(['data' => [
            'accounts' => AliyunDnsAccount::orderByDesc('is_default')->orderBy('id')->get()->map(function ($account) {
                return $this->accountRow($account);
            }),
            'endpoint' => AliyunDnsService::ENDPOINT,
        ]]);
    }

    public function saveAccount(Request $request)
    {
        $data = $request->validate([
            'id' => 'nullable|integer|exists:v2_aliyun_dns_account,id',
            'name' => 'required|string|max:100',
            'access_key_id' => 'nullable|string|max:500',
            'access_key_secret' => 'nullable|string|max:1000',
            'security_token' => 'nullable|string|max:3000',
            'clear_security_token' => 'sometimes|boolean',
            'enabled' => 'required|boolean',
            'is_default' => 'required|boolean',
        ]);
        $account = !empty($data['id']) ? AliyunDnsAccount::findOrFail($data['id']) : new AliyunDnsAccount();
        if (!$account->exists && (empty($data['access_key_id']) || empty($data['access_key_secret']))) {
            throw ValidationException::withMessages(['access_key_id' => '新建账号时必须填写 AccessKey ID 和 AccessKey Secret']);
        }
        $account->name = trim($data['name']);
        $account->enabled = (bool)$data['enabled'];
        $account->is_default = (bool)$data['is_default'];
        if (!empty($data['access_key_id'])) {
            $account->access_key_id_encrypted = Crypt::encryptString(trim($data['access_key_id']));
        }
        if (!empty($data['access_key_secret'])) {
            $account->access_key_secret_encrypted = Crypt::encryptString(trim($data['access_key_secret']));
        }
        if (!empty($data['clear_security_token'])) {
            $account->security_token_encrypted = null;
        } elseif (array_key_exists('security_token', $data) && trim((string)$data['security_token']) !== '') {
            $account->security_token_encrypted = Crypt::encryptString(trim($data['security_token']));
        }
        if ($account->is_default) {
            AliyunDnsAccount::where('id', '<>', $account->id ?: 0)->update(['is_default' => false, 'updated_at' => time()]);
        }
        $account->save();
        if (!AliyunDnsAccount::where('is_default', true)->exists()) {
            $account->is_default = true;
            $account->save();
        }
        return response(['data' => $this->accountRow($account)]);
    }

    public function dropAccount(Request $request)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_aliyun_dns_account,id']);
        $account = AliyunDnsAccount::findOrFail($data['id']);
        $wasDefault = $account->is_default;
        $account->delete();
        if ($wasDefault) {
            $next = AliyunDnsAccount::orderBy('id')->first();
            if ($next) {
                $next->is_default = true;
                $next->save();
            }
        }
        return response(['data' => true]);
    }

    public function testAccount(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate(['id' => 'required|integer|exists:v2_aliyun_dns_account,id']);
        $account = AliyunDnsAccount::findOrFail($data['id']);
        try {
            $result = $service->listInstanceConfigs($account);
            $account->last_connected_at = time();
            $account->last_error = null;
            $account->save();
            return response(['data' => [
                'success' => true,
                'total' => (int)($result['TotalItems'] ?? 0),
                'request_id' => $result['RequestId'] ?? null,
            ]]);
        } catch (\Throwable $error) {
            $account->last_error = mb_substr($error->getMessage(), 0, 1000);
            $account->save();
            throw ValidationException::withMessages(['account' => $error->getMessage()]);
        }
    }

    public function instances(Request $request, AliyunDnsService $service)
    {
        $account = $this->account($request);
        try {
            $result = $service->listInstanceConfigs($account);
            $account->last_connected_at = time();
            $account->last_error = null;
            $account->save();
        } catch (\Throwable $error) {
            $account->last_error = mb_substr($error->getMessage(), 0, 1000);
            $account->save();
            throw ValidationException::withMessages(['account' => $error->getMessage()]);
        }
        $rows = $this->listFrom($result['InstanceConfigs'] ?? [], 'InstanceConfig');
        return response(['data' => [
            'items' => array_map(function ($row) { return $this->configRow($row, false); }, $rows),
            'total' => (int)($result['TotalItems'] ?? count($rows)),
            'request_id' => $result['RequestId'] ?? null,
        ]]);
    }

    public function topology(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
        ]);
        $account = AliyunDnsAccount::where('enabled', true)->findOrFail($data['account_id']);
        try {
            $result = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['topology' => $error->getMessage()]);
        }
        return response(['data' => $this->configRow($result, true)]);
    }

    public function update(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'operation' => ['required', Rule::in([
                'instance_basic', 'instance_strategy', 'instance_status',
                'pool_status', 'pool_strategy', 'address_status',
            ])],
            'instance_id' => 'nullable|string|max:200',
            'config_id' => 'nullable|string|max:200',
            'schedule_zone_name' => 'nullable|string|max:253',
            'schedule_hostname' => 'nullable|string|max:253',
            'ttl' => 'nullable|integer|min:1|max:86400',
            'strategy' => ['nullable', Rule::in(['round_robin', 'sequence', 'weight', 'source_nearest'])],
            'sequence_mode' => ['nullable', Rule::in(['preemptive', 'non_preemptive'])],
            'pool_id' => 'nullable|string|max:200',
            'address_id' => 'nullable|string|max:200',
            'status' => ['nullable', Rule::in(['enable', 'disable'])],
        ]);
        $account = AliyunDnsAccount::where('enabled', true)->findOrFail($data['account_id']);
        try {
            switch ($data['operation']) {
                case 'instance_basic':
                    $this->required($data, ['instance_id', 'config_id', 'ttl']);
                    $result = $service->updateInstanceBasic($account, [
                        'InstanceId' => $data['instance_id'],
                        'ConfigId' => $data['config_id'],
                        'ScheduleZoneName' => $data['schedule_zone_name'] ?? null,
                        'ScheduleHostname' => $data['schedule_hostname'] ?? null,
                        'Ttl' => $data['ttl'],
                    ]);
                    break;
                case 'instance_strategy':
                    $this->required($data, ['instance_id', 'config_id', 'strategy']);
                    $result = $service->updateInstanceStrategy($account, [
                        'InstanceId' => $data['instance_id'],
                        'ConfigId' => $data['config_id'],
                        'AddressPoolLbStrategy' => $data['strategy'],
                        'SequenceLbStrategyMode' => $data['sequence_mode'] ?? null,
                    ]);
                    break;
                case 'instance_status':
                    $this->required($data, ['instance_id', 'config_id', 'status']);
                    $result = $service->updateInstanceStatus($account, $data['instance_id'], $data['config_id'], $data['status']);
                    break;
                case 'pool_status':
                    $this->required($data, ['pool_id', 'status']);
                    $result = $service->updatePoolStatus($account, $data['pool_id'], $data['status']);
                    break;
                case 'pool_strategy':
                    $this->required($data, ['pool_id', 'strategy']);
                    $result = $service->updatePoolStrategy($account, [
                        'AddressPoolId' => $data['pool_id'],
                        'AddressLbStrategy' => $data['strategy'],
                        'SequenceLbStrategyMode' => $data['sequence_mode'] ?? null,
                    ]);
                    break;
                default:
                    $this->required($data, ['address_id', 'status']);
                    $result = $service->updateAddressStatus($account, $data['address_id'], $data['status']);
                    break;
            }
        } catch (ValidationException $error) {
            throw $error;
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['operation' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'request_id' => $result['RequestId'] ?? null]]);
    }

    public function resources(Request $request, AliyunDnsService $service)
    {
        $account = $this->account($request);
        try {
            $poolResult = $service->listAddressPools($account);
            $addressResult = $service->listAddresses($account);
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['resources' => $error->getMessage()]);
        }
        $pools = array_map(function ($pool) {
            return [
                'id' => $pool['AddressPoolId'] ?? '',
                'name' => $pool['AddressPoolName'] ?? '',
                'type' => $pool['AddressPoolType'] ?? '',
                'remark' => $pool['Remark'] ?? '',
                'enable_status' => $pool['EnableStatus'] ?? '',
                'health_status' => $pool['HealthStatus'] ?? '',
                'address_count' => (int)($pool['AddressCount'] ?? count($this->listFrom($pool['Addresses'] ?? [], 'Address'))),
            ];
        }, $this->listFrom($poolResult['AddressPools'] ?? [], 'AddressPool'));
        $addresses = array_map(function ($address) {
            return [
                'id' => $address['AddressId'] ?? '',
                'name' => $address['Name'] ?? '',
                'type' => $address['Type'] ?? '',
                'address' => $address['Address'] ?? '',
                'remark' => $address['Remark'] ?? '',
                'enable_status' => $address['EnableStatus'] ?? '',
                'available_status' => $address['AvailableStatus'] ?? '',
                'health_status' => $address['HealthStatus'] ?? '',
            ];
        }, $this->listFrom($addressResult['Addresses'] ?? [], 'Address'));
        return response(['data' => ['pools' => $pools, 'addresses' => $addresses]]);
    }

    public function savePool(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'nullable|string|max:200',
            'name' => 'required|string|max:100',
            'type' => ['required', Rule::in(['IPv4', 'IPv6', 'domain'])],
            'remark' => 'nullable|string|max:500',
            'health_judgement' => ['required', Rule::in(['any_ok', 'p30_ok', 'p50_ok', 'p70_ok', 'all_ok'])],
            'strategy' => ['required', Rule::in(['round_robin', 'sequence', 'weight', 'source_nearest'])],
            'sequence_mode' => ['nullable', Rule::in(['preemptive', 'non_preemptive'])],
            'status' => ['required', Rule::in(['enable', 'disable'])],
            'weight' => 'nullable|integer|min:1|max:100',
            'serial_number' => 'nullable|integer|min:1|max:1000',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $poolId = $data['pool_id'] ?? null;
            $lastResult = [];
            if (!$poolId) {
                $lastResult = $service->createPool($account, [
                    'AddressPoolName' => trim($data['name']),
                    'AddressPoolType' => $data['type'],
                    'HealthJudgement' => $data['health_judgement'],
                    'EnableStatus' => $data['status'],
                    'Remark' => trim((string)($data['remark'] ?? '')),
                ]);
                $poolId = $lastResult['AddressPoolId'] ?? null;
                if (!$poolId) throw new \RuntimeException('阿里云未返回新地址池 ID');
            } else {
                $lastResult = $service->updatePoolBasic($account, [
                    'AddressPoolId' => $poolId,
                    'AddressPoolName' => trim($data['name']),
                    'HealthJudgement' => $data['health_judgement'],
                ]);
                $service->updatePoolRemark($account, $poolId, trim((string)($data['remark'] ?? '')));
            }
            $service->updatePoolStrategy($account, [
                'AddressPoolId' => $poolId,
                'AddressLbStrategy' => $data['strategy'],
                'SequenceLbStrategyMode' => $data['strategy'] === 'sequence' ? ($data['sequence_mode'] ?? 'preemptive') : null,
            ]);
            $service->updatePoolStatus($account, $poolId, $data['status']);
            if (empty($data['pool_id'])) {
                $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
                $links = $this->poolLinks($full);
                $links[] = [
                    'AddressPoolId' => $poolId,
                    'WeightValue' => (int)($data['weight'] ?? 100),
                    'SerialNumber' => (int)($data['serial_number'] ?? (count($links) + 1)),
                    'RequestSource' => ['default'],
                ];
                $lastResult = $service->replaceInstancePools($account, $data['instance_id'], $data['config_id'], $links);
            } elseif (isset($data['weight']) || isset($data['serial_number'])) {
                $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
                $links = $this->poolLinks($full);
                foreach ($links as &$link) {
                    if ($link['AddressPoolId'] !== $poolId) continue;
                    if (isset($data['weight'])) $link['WeightValue'] = (int)$data['weight'];
                    if (isset($data['serial_number'])) $link['SerialNumber'] = (int)$data['serial_number'];
                }
                unset($link);
                $lastResult = $service->replaceInstancePools($account, $data['instance_id'], $data['config_id'], $links);
            }
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['pool' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'pool_id' => $poolId, 'request_id' => $lastResult['RequestId'] ?? null]]);
    }

    public function attachPool(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'required|string|max:200',
            'weight' => 'nullable|integer|min:1|max:100',
            'serial_number' => 'nullable|integer|min:1|max:1000',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
            $links = $this->poolLinks($full);
            foreach ($links as $link) {
                if ($link['AddressPoolId'] === $data['pool_id']) {
                    throw new \RuntimeException('该地址池已关联当前接入域名');
                }
            }
            $links[] = [
                'AddressPoolId' => $data['pool_id'],
                'WeightValue' => (int)($data['weight'] ?? 100),
                'SerialNumber' => count($links) + 1,
                'RequestSource' => ['default'],
            ];
            $result = $service->replaceInstancePools($account, $data['instance_id'], $data['config_id'], $links);
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['pool' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'request_id' => $result['RequestId'] ?? null]]);
    }

    public function dropPool(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'required|string|max:200',
            'delete_resource' => 'required|boolean',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
            $originalLinks = $this->poolLinks($full);
            $links = array_values(array_filter($originalLinks, function ($link) use ($data) {
                return $link['AddressPoolId'] !== $data['pool_id'];
            }));
            $result = $service->replaceInstancePools($account, $data['instance_id'], $data['config_id'], $links);
            if ($data['delete_resource']) {
                try {
                    $result = $service->deletePool($account, $data['pool_id']);
                } catch (\Throwable $deleteError) {
                    try {
                        $service->replaceInstancePools($account, $data['instance_id'], $data['config_id'], $originalLinks);
                        throw new \RuntimeException('地址池删除失败，已恢复当前域名关联：' . $deleteError->getMessage());
                    } catch (\RuntimeException $rollbackError) {
                        if (strpos($rollbackError->getMessage(), '已恢复当前域名关联') === 0) throw $rollbackError;
                        throw new \RuntimeException('地址池删除失败，且关联恢复失败，请立即到阿里云控制台核对：' . $deleteError->getMessage());
                    }
                }
            }
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['pool' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'request_id' => $result['RequestId'] ?? null]]);
    }

    public function saveAddress(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'required|string|max:200',
            'address_id' => 'nullable|string|max:200',
            'name' => 'required|string|max:100',
            'type' => ['required', Rule::in(['IPv4', 'IPv6', 'domain'])],
            'address' => 'required|string|max:253',
            'remark' => 'nullable|string|max:500',
            'health_judgement' => ['required', Rule::in(['any_ok', 'p30_ok', 'p50_ok', 'p70_ok', 'all_ok'])],
            'status' => ['required', Rule::in(['enable', 'disable'])],
            'available_mode' => ['required', Rule::in(['auto', 'manual'])],
            'manual_status' => ['nullable', Rule::in(['available', 'unavailable'])],
            'weight' => 'nullable|integer|min:1|max:100',
            'serial_number' => 'nullable|integer|min:1|max:1000',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $addressId = $data['address_id'] ?? null;
            $lastResult = [];
            if (!$addressId) {
                $lastResult = $service->createAddress($account, [
                    'Name' => trim($data['name']),
                    'Type' => $data['type'],
                    'Address' => trim($data['address']),
                    'Remark' => trim((string)($data['remark'] ?? '')),
                    'EnableStatus' => $data['status'],
                    'AvailableMode' => $data['available_mode'],
                    'ManualAvailableStatus' => $data['available_mode'] === 'manual' ? ($data['manual_status'] ?? 'available') : null,
                    'HealthJudgement' => $data['health_judgement'],
                ]);
                $addressId = $lastResult['AddressId'] ?? null;
                if (!$addressId) throw new \RuntimeException('阿里云未返回新节点地址 ID');
            } else {
                $lastResult = $service->updateAddress($account, [
                    'AddressId' => $addressId,
                    'Name' => trim($data['name']),
                    'Address' => trim($data['address']),
                    'HealthJudgement' => $data['health_judgement'],
                ]);
                $service->updateAddressRemark($account, $addressId, trim((string)($data['remark'] ?? '')));
            }
            $service->updateAddressManualStatus($account, $addressId, $data['available_mode'], $data['manual_status'] ?? 'available');
            $service->updateAddressStatus($account, $addressId, $data['status']);
            if (empty($data['address_id'])) {
                $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
                $pool = $this->findPool($full, $data['pool_id']);
                $links = $this->addressLinks($pool);
                $links[] = [
                    'AddressId' => $addressId,
                    'WeightValue' => (int)($data['weight'] ?? 100),
                    'SerialNumber' => (int)($data['serial_number'] ?? (count($links) + 1)),
                    'RequestSource' => ['default'],
                ];
                $lastResult = $service->replacePoolAddresses($account, $data['pool_id'], $links);
            } elseif (isset($data['weight']) || isset($data['serial_number'])) {
                $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
                $pool = $this->findPool($full, $data['pool_id']);
                $links = $this->addressLinks($pool);
                foreach ($links as &$link) {
                    if ($link['AddressId'] !== $addressId) continue;
                    if (isset($data['weight'])) $link['WeightValue'] = (int)$data['weight'];
                    if (isset($data['serial_number'])) $link['SerialNumber'] = (int)$data['serial_number'];
                }
                unset($link);
                $lastResult = $service->replacePoolAddresses($account, $data['pool_id'], $links);
            }
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['address' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'address_id' => $addressId, 'request_id' => $lastResult['RequestId'] ?? null]]);
    }

    public function attachAddress(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'required|string|max:200',
            'address_id' => 'required|string|max:200',
            'weight' => 'nullable|integer|min:1|max:100',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
            $pool = $this->findPool($full, $data['pool_id']);
            $links = $this->addressLinks($pool);
            foreach ($links as $link) {
                if ($link['AddressId'] === $data['address_id']) {
                    throw new \RuntimeException('该节点地址已在当前地址池中');
                }
            }
            $links[] = [
                'AddressId' => $data['address_id'],
                'WeightValue' => (int)($data['weight'] ?? 100),
                'SerialNumber' => count($links) + 1,
                'RequestSource' => ['default'],
            ];
            $result = $service->replacePoolAddresses($account, $data['pool_id'], $links);
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['address' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'request_id' => $result['RequestId'] ?? null]]);
    }

    public function dropAddress(Request $request, AliyunDnsService $service)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:v2_aliyun_dns_account,id',
            'instance_id' => 'required|string|max:200',
            'config_id' => 'required|string|max:200',
            'pool_id' => 'required|string|max:200',
            'address_id' => 'required|string|max:200',
            'delete_resource' => 'required|boolean',
        ]);
        $account = $this->enabledAccount($data['account_id']);
        try {
            $full = $service->fullInfo($account, $data['instance_id'], $data['config_id']);
            $pool = $this->findPool($full, $data['pool_id']);
            $originalLinks = $this->addressLinks($pool);
            $links = array_values(array_filter($originalLinks, function ($link) use ($data) {
                return $link['AddressId'] !== $data['address_id'];
            }));
            $result = $service->replacePoolAddresses($account, $data['pool_id'], $links);
            if ($data['delete_resource']) {
                try {
                    $result = $service->deleteAddress($account, $data['address_id']);
                } catch (\Throwable $deleteError) {
                    try {
                        $service->replacePoolAddresses($account, $data['pool_id'], $originalLinks);
                        throw new \RuntimeException('节点删除失败，已恢复当前地址池关联：' . $deleteError->getMessage());
                    } catch (\RuntimeException $rollbackError) {
                        if (strpos($rollbackError->getMessage(), '已恢复当前地址池关联') === 0) throw $rollbackError;
                        throw new \RuntimeException('节点删除失败，且关联恢复失败，请立即到阿里云控制台核对：' . $deleteError->getMessage());
                    }
                }
            }
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['address' => $error->getMessage()]);
        }
        return response(['data' => ['success' => true, 'request_id' => $result['RequestId'] ?? null]]);
    }

    private function account(Request $request)
    {
        $id = (int)$request->query('account_id', 0);
        $query = AliyunDnsAccount::where('enabled', true);
        $account = $id ? $query->where('id', $id)->first() : $query->orderByDesc('is_default')->orderBy('id')->first();
        if (!$account) {
            throw ValidationException::withMessages(['account' => '请先添加并启用阿里云账号']);
        }
        return $account;
    }

    private function enabledAccount($id)
    {
        $account = AliyunDnsAccount::where('enabled', true)->find($id);
        if (!$account) {
            throw ValidationException::withMessages(['account' => '阿里云账号不存在或尚未启用']);
        }
        return $account;
    }

    private function accountRow(AliyunDnsAccount $account)
    {
        $accessKey = '';
        try {
            $accessKey = Crypt::decryptString($account->access_key_id_encrypted);
        } catch (\Throwable $error) {
            $accessKey = '';
        }
        $masked = strlen($accessKey) > 8
            ? substr($accessKey, 0, 4) . str_repeat('*', max(4, strlen($accessKey) - 8)) . substr($accessKey, -4)
            : str_repeat('*', strlen($accessKey));
        return [
            'id' => $account->id,
            'name' => $account->name,
            'access_key_masked' => $masked,
            'has_security_token' => (bool)$account->security_token_encrypted,
            'enabled' => (bool)$account->enabled,
            'is_default' => (bool)$account->is_default,
            'last_connected_at' => $account->last_connected_at,
            'last_error' => $account->last_error,
            'created_at' => $account->created_at,
        ];
    }

    private function configRow(array $row, $includePools)
    {
        $pools = [];
        if ($includePools) {
            foreach ($this->listFrom($row['AddressPools'] ?? [], 'AddressPool') as $pool) {
                $addresses = [];
                foreach ($this->listFrom($pool['Addresses'] ?? [], 'Address') as $address) {
                    $addresses[] = [
                        'id' => $address['AddressId'] ?? '',
                        'name' => $address['Name'] ?? '',
                        'address' => $address['Address'] ?? '',
                        'type' => $address['Type'] ?? '',
                        'remark' => $address['Remark'] ?? '',
                        'enable_status' => $address['EnableStatus'] ?? '',
                        'available_status' => $address['AvailableStatus'] ?? '',
                        'health_status' => $address['HealthStatus'] ?? '',
                        'health_judgement' => $address['HealthJudgement'] ?? 'any_ok',
                        'available_mode' => $address['AvailableMode'] ?? '',
                        'manual_available_status' => $address['ManualAvailableStatus'] ?? '',
                        'weight' => $address['WeightValue'] ?? null,
                        'serial_number' => $address['SerialNumber'] ?? null,
                        'request_source' => $this->stringList($address['RequestSource'] ?? ($address['RequestSources'] ?? [])),
                        'health_tasks' => array_map(function ($task) {
                            return [
                                'port' => $task['Port'] ?? null,
                                'template_id' => $task['TemplateId'] ?? '',
                                'template_name' => $task['TemplateName'] ?? '',
                                'monitor_status' => $task['MonitorStatus'] ?? '',
                            ];
                        }, $this->listFrom($address['HealthTasks'] ?? [], 'HealthTask')),
                    ];
                }
                $pools[] = [
                    'id' => $pool['AddressPoolId'] ?? '',
                    'name' => $pool['AddressPoolName'] ?? '',
                    'type' => $pool['AddressPoolType'] ?? '',
                    'remark' => $pool['Remark'] ?? '',
                    'strategy' => $pool['AddressLbStrategy'] ?? '',
                    'sequence_mode' => $pool['SequenceLbStrategyMode'] ?? '',
                    'enable_status' => $pool['EnableStatus'] ?? '',
                    'available_status' => $pool['AvailableStatus'] ?? '',
                    'health_status' => $pool['HealthStatus'] ?? '',
                    'health_judgement' => $pool['HealthJudgement'] ?? '',
                    'weight' => $pool['WeightValue'] ?? null,
                    'serial_number' => $pool['SerialNumber'] ?? null,
                    'request_source' => $this->stringList($pool['RequestSource'] ?? ($pool['RequestSources'] ?? [])),
                    'addresses' => $addresses,
                ];
            }
        }
        return [
            'instance_id' => $row['InstanceId'] ?? '',
            'config_id' => trim((string)($row['ConfigId'] ?? '')),
            'instance_name' => $row['InstanceName'] ?? '',
            'domain' => $row['ScheduleDomainName'] ?? $this->domainFrom($row),
            'zone_name' => $row['ScheduleZoneName'] ?? '',
            'hostname' => $row['ScheduleHostname'] ?? '',
            'record_type' => $row['ScheduleRrType'] ?? '',
            'ttl' => $row['Ttl'] ?? null,
            'strategy' => $row['AddressPoolLbStrategy'] ?? '',
            'sequence_mode' => $row['SequenceLbStrategyMode'] ?? '',
            'enable_status' => $row['EnableStatus'] ?? '',
            'available_status' => $row['AvailableStatus'] ?? '',
            'health_status' => $row['HealthStatus'] ?? '',
            'remark' => $row['Remark'] ?? '',
            'version' => $row['VersionCode'] ?? '',
            'updated_at' => $row['UpdateTimestamp'] ?? null,
            'pools' => $pools,
        ];
    }

    private function listFrom($container, $key)
    {
        if (!is_array($container)) return [];
        $rows = isset($container[$key]) ? $container[$key] : $container;
        if (!is_array($rows) || !$rows) return [];
        if ($this->isAssoc($rows)) return [$rows];
        return array_values(array_filter($rows, 'is_array'));
    }

    private function isAssoc(array $array)
    {
        return array_keys($array) !== range(0, count($array) - 1);
    }

    private function domainFrom(array $row)
    {
        $host = trim((string)($row['ScheduleHostname'] ?? ''));
        $zone = trim((string)($row['ScheduleZoneName'] ?? ''));
        if (!$host || $host === '@') return $zone;
        return $host . '.' . $zone;
    }

    private function poolLinks(array $full)
    {
        $links = [];
        foreach ($this->listFrom($full['AddressPools'] ?? [], 'AddressPool') as $index => $pool) {
            $poolId = (string)($pool['AddressPoolId'] ?? '');
            if ($poolId === '') continue;
            $links[] = [
                'AddressPoolId' => $poolId,
                'WeightValue' => max(1, min(100, (int)($pool['WeightValue'] ?? 100))),
                'SerialNumber' => max(1, (int)($pool['SerialNumber'] ?? ($index + 1))),
                'RequestSource' => $this->stringList($pool['RequestSource'] ?? ($pool['RequestSources'] ?? ['default'])) ?: ['default'],
            ];
        }
        return $links;
    }

    private function findPool(array $full, $poolId)
    {
        foreach ($this->listFrom($full['AddressPools'] ?? [], 'AddressPool') as $pool) {
            if ((string)($pool['AddressPoolId'] ?? '') === (string)$poolId) return $pool;
        }
        throw new \RuntimeException('当前接入域名中未找到指定地址池，请刷新后重试');
    }

    private function addressLinks(array $pool)
    {
        $links = [];
        foreach ($this->listFrom($pool['Addresses'] ?? [], 'Address') as $index => $address) {
            $addressId = (string)($address['AddressId'] ?? '');
            if ($addressId === '') continue;
            $links[] = [
                'AddressId' => $addressId,
                'WeightValue' => max(1, min(100, (int)($address['WeightValue'] ?? 100))),
                'SerialNumber' => max(1, (int)($address['SerialNumber'] ?? ($index + 1))),
                'RequestSource' => $this->stringList($address['RequestSource'] ?? ($address['RequestSources'] ?? ['default'])) ?: ['default'],
            ];
        }
        return $links;
    }

    private function stringList($value)
    {
        if (!is_array($value)) {
            return trim((string)$value) === '' ? [] : [trim((string)$value)];
        }
        if (isset($value['RequestSource'])) $value = $value['RequestSource'];
        if (!is_array($value)) $value = [$value];
        $result = [];
        array_walk_recursive($value, function ($item) use (&$result) {
            if (is_scalar($item) && trim((string)$item) !== '') $result[] = trim((string)$item);
        });
        return array_values(array_unique($result));
    }

    private function required(array $data, array $fields)
    {
        foreach ($fields as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw ValidationException::withMessages([$field => '缺少必要参数：' . $field]);
            }
        }
    }
}
