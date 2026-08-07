# 节点安全中心部署与使用

## 部署

1. 备份数据库和当前代码。
2. 发布代码后只执行节点安全迁移：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_07_000001_create_node_security_tables.php --force
   ```

   不要直接执行无 `--path` 的全量迁移。该面板安装器会从 `database/install.sql` 创建部分 Laravel 标准表，但未登记对应迁移，全量迁移可能与已有表冲突。

   若需要使用私有多地区探测点，再执行第二个迁移：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_07_000002_create_node_security_probe_tables.php --force
   ```
3. 确认 Laravel 定时任务每分钟运行：`* * * * * php /path/to/artisan schedule:run`。
4. 确认队列、Redis 和 `APP_KEY` 正常；节点地址使用 `APP_KEY` 加密，变更密钥会导致历史水印地址无法解密。
5. 打开原管理员后台，点击右下角“节点安全”，或访问 `/{secure_path}/security/dashboard`。

## 推荐启用顺序

1. 默认只启用访问审计，登记真实封锁事件并观察风险排行。
2. 创建水印实验时先使用测试节点，至少包含一个控制组。确保每个水印地址确实只下发给对应组。
3. 确认服务器定时任务正常后，再启用 TCP 健康探测。
4. “自动停止节点下发分数”默认为 `0`（关闭）。经过多轮水印复现前不要开启；开启后达到阈值的用户将收到空节点列表。

## 取证边界

- 风险分表示相关性，不是单次事件的定罪依据。
- 水印事件必须填写或自动关联正确的水印组 ID，否则不会增加水印证据分。
- TCP 探测只能证明端口连接失败，不能单独证明被墙；需结合国内外探测或人工验证后将事件标为“已确认”。
- 控制组没有替换地址，用于判断基础设施、协议特征或其他渠道泄露。

## 数据保留与隐私

- 节点主机地址使用 Laravel Crypt 加密，列表只显示哈希。
- JWT、订阅 token 和密码不会写入安全日志。
- 用户访问 IP、User-Agent、会话 ID 属于管理员取证数据，应限制数据库和后台访问权限。
- `security:analyze` 根据“日志保留天数”自动删除过期访问明细，事件、风险聚合和管理员操作日志长期保留。

## 手动诊断命令

```bash
php artisan security:node-health
php artisan security:analyze
php artisan route:list | grep security
php artisan test --filter NodeSecurityTest
```

## 私有探测点

1. 在“节点安全 → 探测点”分别创建国内不同运营商和海外探测点。
2. AMD64 Linux 探测服务器直接执行后台生成的一行安装命令。它会从你自己的面板下载预编译二进制、校验 SHA-256 后安装 systemd 服务。
3. 如使用 ARM64，可在有 Go 1.20+ 的机器进入 `probe-agent` 自行编译：

   ```bash
   CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o node-security-probe .
   ```

4. Agent 只需要主动访问面板 HTTPS 和被监控节点端口，无需开放入站端口。
5. 至少需要两个中国大陆不同运营商探测点和一个海外探测点，数据不足时状态显示 `insufficient_probes`，不会自动创建异常事件。

Agent 每个请求都使用独立密钥进行 HMAC-SHA256 签名，并包含时间戳和一次性 nonce。暂停或吊销探测点后，其密钥立即失效。当前自动 TCP 检测跳过 TUIC、Hysteria 及相应 V2Node UDP 协议，避免用 TCP 结果误判 UDP 节点。

若尚未执行迁移，审计模块会 fail-open，不影响正常节点下发，但安全后台接口会因数据表不存在而报错。
