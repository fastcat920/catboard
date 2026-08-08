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

   私有探测点使用手动监控目标池，还需要执行第三个迁移：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_07_000003_create_security_probe_targets.php --force
   ```

   若需要区分首次探测失败时间和达到连续失败阈值的时间，再执行：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_08_000004_add_probe_failure_started_at.php --force
   ```

   若需要启用“首次监控正常”基线及动态事件关联窗口，再执行：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_08_000005_add_probe_first_healthy_at.php --force
   ```

   若需要按 UA 查找关联用户和客户端分类，再执行：

   ```bash
   php artisan migrate --path=database/migrations/2026_08_08_000006_add_access_log_ua_classification.php --force
   php artisan security:backfill-ua
   ```
3. 确认 Laravel 定时任务每分钟运行：`* * * * * php /path/to/artisan schedule:run`。
4. 确认 Horizon 队列、Redis 和 `APP_KEY` 正常；`node_security` 队列用于探测结果上报后的快速分析，变更 `APP_KEY` 会导致历史水印地址无法解密。
5. 打开原管理员后台，点击右上角主题按钮旁的“节点安全”，或访问 `/{secure_path}/security/dashboard`。

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
- 登录客户端的节点列表接口、订阅令牌客户端的配置接口以及 `/client/subscribe` 订阅接口都会写入访问审计；节点快照在权限过滤之后、生成响应之前记录，只包含该用户当次实际可下发的节点。
- 后台将访问标识为“登录客户端”或“订阅客户端”，并保留请求发送的原始 User-Agent。User-Agent 由客户端自行声明、可以修改或伪造，因此统一标记为低可信辅助特征，不能单独用于认定用户身份。
- 用户访问 IP、原始 User-Agent、会话 ID 属于管理员取证数据，应限制数据库和后台访问权限。
- `security:analyze` 根据“日志保留天数”自动删除过期访问明细，事件、风险聚合和管理员操作日志长期保留。

## 手动诊断命令

```bash
php artisan security:node-health
php artisan security:analyze
php artisan security:backfill-ua
php artisan route:list | grep security
php artisan test --filter NodeSecurityTest
```

访问记录支持按原始 UA、客户端、版本和平台筛选，并可切换为“关联用户”或“客户端分类”视图。升级并执行 UA 分类迁移后，运行 `php artisan security:backfill-ua` 可为历史访问记录补齐分类；新记录会在写入时自动分类。

风险分不再根据访问距离封锁时间的远近加权。“早期获取窗口”设置已移除，风险依据保留为封锁事件命中和水印命中；旧数据库中的 `early_access_hits` 字段仅为升级兼容保留，并在重新分析时清零。

计划任务每分钟触发 `security:analyze --scheduled`，命令内部按照“安全分析间隔（分钟）”决定是否实际运行，默认 1 分钟。管理员手动执行 `php artisan security:analyze` 或添加 `--force` 时会立即分析，不受间隔限制。

探测结果写入后会先聚合 5 秒，再通过 `node_security` 队列只分析发生变化的节点；同一节点使用独立分布式锁，避免重复判断和重复创建事件。每分钟的 `security:analyze --scheduled` 仍执行全量补偿，即使队列短暂停止也不会永久遗漏。节点监控界面分别显示探测点实际检测时间和面板完成综合判断的时间。

## 私有探测点

1. 在“节点安全 → 探测点”分别创建国内不同运营商和海外探测点。
2. AMD64 Linux 探测服务器直接执行后台生成的一行安装命令。它会从你自己的面板下载预编译二进制、校验 SHA-256 后安装 systemd 服务。
3. 如使用 ARM64，可在有 Go 1.20+ 的机器进入 `probe-agent` 自行编译：

   ```bash
   CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o node-security-probe .
   ```

4. Agent 只需要主动访问面板 HTTPS 和被监控节点端口，无需开放入站端口。
5. 在“节点监控状态”中点击“添加监控节点”，批量选择需要检测的节点；目标池默认为空，系统不会自动检测全部节点。
6. 至少需要两个中国大陆不同运营商探测点和一个海外探测点，数据不足时显示“探测点不足”，不会自动创建异常事件。

节点正常判定采用可配置的比例规则。默认要求国内、海外各至少 1 个成功探测点，并且两侧成功比例分别达到 50%；只有两侧同时达标才显示“TCP 双向正常”。国内全部失败而海外达标时显示“疑似国内方向被封锁”，海外全部失败而国内达标时显示“疑似海外方向被封锁”，两侧全部失败时显示“疑似节点故障”。最少成功数、成功比例、恢复正常轮数和异常事件失败轮数均可在“风控设置”中调整。暂停、离线或结果超出探测窗口的记录不进入比例分母。

节点加入监控后必须至少一次达到“TCP 双向正常”，才会建立首次监控正常基线并允许后续异常自动创建事件。从未正常的节点仍会持续探测并展示判断结果，但不自动创建事件。节点从可处理异常状态恢复正常后，以完成恢复判定的那一轮时间更新正常基线；持续正常期间不会反复更新。事件候选窗口从当前正常基线和“首次失败时间减去封锁关联窗口”两者中较晚的时间开始，结束于首次失败时间。移除后重新添加节点会开始新的监控周期并重新建立基线。

监控目标支持单个或批量暂停、恢复和移除。移除只停止探测，不会删除面板节点，历史结果继续按照系统保留策略保存。

Agent 每个请求都使用独立密钥进行 HMAC-SHA256 签名，并包含时间戳和一次性 nonce。暂停或吊销探测点后，其密钥立即失效。当前自动 TCP 检测跳过 TUIC、Hysteria 及相应 V2Node UDP 协议，避免用 TCP 结果误判 UDP 节点。

若尚未执行迁移，审计模块会 fail-open，不影响正常节点下发，但安全后台接口会因数据表不存在而报错。
