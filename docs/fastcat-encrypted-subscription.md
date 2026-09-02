# FastCat 加密订阅

## 功能与边界

FastCat v1 是现有 ClashMeta 订阅外层的独立 AES-256-GCM 加密协议。只有查询参数
精确等于 `flag=fastcat-v1` 才会进入该协议；`flag=meta`、其他客户端 flag 和没有
匹配的通用订阅保持原行为。

请求先经过现有 User-Agent 分类、可用节点筛选和审计，再由 `ClashMeta` 生成 YAML，
最后由 `FastCatV1` 加密。因此 UA 下发规则与加密没有冲突：UA 决定节点集合，flag
决定输出格式。

该功能可以避免订阅响应被直接阅读，并通过 GCM tag 检测错误密钥、损坏和篡改；但
客户端必须持有解密 key，所以不能抵御有能力逆向客户端的攻击者，也不能替代 HTTPS、
订阅 token、访问审计和限流。

## 实现结构

```text
ClientController 精确匹配 flag=fastcat-v1
  → 原有 UA 分类与节点筛选
  → FastCatV1 extends ClashMeta
  → ClashMeta 生成 YAML
  → FastCatSubscriptionCipher 使用 active kid/key 加密
  → 返回版本化 JSON 信封
```

相关文件：

- `config/fastcat.php`：将 `.env` 映射为 Laravel 配置；
- `app/Protocols/FastCatV1.php`：独立协议入口；
- `app/Services/FastCatSubscriptionCipher.php`：密钥校验、AES-GCM 与信封生成；
- `app/Http/Controllers/V1/Client/ClientController.php`：精确 flag 分流。

通用协议动态扫描会跳过 `FastCatV1`，因此旧客户端的 User-Agent 包含 `FastCat` 也
不会意外命中加密协议。

## 信封协议

```json
{
  "v": 1,
  "alg": "A256GCM",
  "kid": "2026-01",
  "ts": 1786527548,
  "nonce": "Base64(12 bytes)",
  "data": "Base64(ciphertext)",
  "tag": "Base64(16 bytes)"
}
```

- 算法：AES-256-GCM；
- key：Base64 编码的 32 个随机字节；
- nonce：每次响应生成 12 个随机字节；
- tag：16 字节；
- AAD：`fastcat-subscription|v1|<kid>|<ts>`。

服务端只使用 `FASTCAT_ACTIVE_KID` 对应的 key。active kid 未配置、没有匹配的 key
槽位、Base64 无效或解码后不是 32 字节时，服务端拒绝生成加密响应，不会退回明文。

## 部署

生成两把独立密钥：

```bash
openssl rand -base64 32
openssl rand -base64 32
```

服务器 `.env` 配置如下，真实 key 不得提交到 Git：

```dotenv
FASTCAT_SUBSCRIPTION_ENABLED=true
FASTCAT_SUBSCRIPTION_FLAG=fastcat-v1
FASTCAT_ACTIVE_KID=2026-01
FASTCAT_KEY_CURRENT_ID=2026-01
FASTCAT_KEY_CURRENT=<key A>
FASTCAT_KEY_NEXT_ID=2026-02
FASTCAT_KEY_NEXT=<key B>
```

更新代码或 `.env` 后刷新 Laravel 配置缓存：

```bash
php artisan config:clear
php artisan config:cache
```

不需要执行 `php artisan cache:clear`。如果使用 PHP-FPM 或其他常驻进程，根据实际
部署方式 reload/restart；项目没有安装 Octane 时无需执行 `octane:reload`。

## 两把 key 的切换

客户端构建必须同时包含 current 和 next 两组 ID/key。服务端任意时刻只用 active
kid 对应的一把：

```text
初始：服务端使用 A；客户端包含 A+B
切换：服务端 FASTCAT_ACTIVE_KID 从 A 改为 B
下一版：客户端包含 B+C，服务端仍先使用 B
下次切换：新版覆盖后服务端再改为 C
```

切换 active kid 后执行：

```bash
php artisan config:clear
php artisan config:cache
```

新 key 必须先进入已发布客户端，服务端才能启用。否则客户端无法识别响应 `kid`。

## 验证

请求加密协议：

```bash
curl -i -A 'FastCat/3.5.8' \
  'https://example.com/api/v1/client/subscribe?token=TOKEN&flag=fastcat-v1'
```

正确响应应为 HTTP 200，包含 `X-FastCat-Protocol: 1`，正文为上述 JSON 信封，不能
直接看到 `proxies:`、服务器地址或 UUID。部分部署栈可能把 Content-Type 覆盖成
`text/html`；当前客户端依据严格信封结构解析，不依赖 Content-Type。

验证随机 nonce：

```bash
curl -s -A 'FastCat/3.5.8' 'URL&flag=fastcat-v1' -o /tmp/fastcat-1.json
curl -s -A 'FastCat/3.5.8' 'URL&flag=fastcat-v1' -o /tmp/fastcat-2.json
shasum -a 256 /tmp/fastcat-1.json /tmp/fastcat-2.json
```

两次哈希应不同。还应验证同一 UA 下 `flag=meta` 的明文节点集合与解密后的
`flag=fastcat-v1` 节点集合一致，证明 UA 节点筛选未被改变。

后端测试：

```bash
vendor/bin/phpunit tests/Unit/FastCatSubscriptionCipherTest.php
```
