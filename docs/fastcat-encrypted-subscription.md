# FastCat encrypted subscription

FastCat v1 is an opt-in AES-256-GCM wrapper around the existing ClashMeta
subscription. Existing clients keep their current protocol because the encrypted
handler is selected only by the exact query parameter `flag=fastcat-v1`.

Generate two independent keys (each command prints a Base64-encoded 32-byte key):

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Configure the server `.env` (never commit real keys):

```dotenv
FASTCAT_SUBSCRIPTION_ENABLED=true
FASTCAT_SUBSCRIPTION_FLAG=fastcat-v1
FASTCAT_ACTIVE_KID=2026-01
FASTCAT_KEY_CURRENT_ID=2026-01
FASTCAT_KEY_CURRENT=<key A>
FASTCAT_KEY_NEXT_ID=2026-02
FASTCAT_KEY_NEXT=<key B>
```

Refresh Laravel's cached configuration after changing these values:

```bash
php artisan config:clear
php artisan config:cache
```

The matching FastCat client build must receive both IDs and keys through its
`--dart-define` build environment. To rotate, publish a client containing the
next key before changing `FASTCAT_ACTIVE_KID` to that key's ID.

## Android 自动双入口节点

安装包含 `fastCatSupportsAutoV1` 能力的 Android 核心后，订阅请求会带 `flag=fastcat-v1&fc_auto=1`。面板在原有账户、节点可见性和审计筛选之后，只为已登记的账户与节点签发自动配置。既有设备、未登记的账户和其他订阅格式沿用各自的配置。单个自动节点支持 TCP，首页沿用面板的节点名称。HTTP/2 使用顶层 `server`、`port`、`sni`、`token`，HTTPS v1 使用 `fallback-port`、`fallback-token` 与可选的 `fallback-server`、`fallback-sni`。两个入口都应验证有效的 TLS 证书。

在面板设置 `FASTCAT_AUTO_GRANTS_DIR` 为 Web 根目录外的私有绝对路径，留空即关闭。如果使用 Laravel 配置缓存，按部署流程刷新缓存。面板多实例需要读取同一份授权数据，授权操作应在同一个支持文件锁和原子重命名的文件系统进行。以下以已存在、该账号有权使用的面板节点 `vless:42` 及账户 71 为例。路径和保留示例域名仅用于说明。以面板服务的系统账户操作：

```sh
umask 077
install -d -m 700 /srv/catboard-private/fastcat/vless:42
cat > /srv/catboard-private/fastcat/vless:42/endpoints.json <<'JSON'
{"server":"hk.example.net","port":18444,"fallback-port":8443}
JSON
php artisan fastcat:auto grant vless:42 71
php artisan fastcat:auto export vless:42 --out=/srv/catboard-private/snapshot-001
```

同一账户重复 grant 保留其两份凭据。导出每次重新检查节点可见状态、允许的套餐组、账户到期、禁用和剩余流量。导出的目录必须是新路径，含 `h2.tokens` 和 `v1.tokens`。通过受保护的部署通道以 0600 原子替换两台入口各自的 `-tokens-file` 文件，对两个进程发送 SIGHUP 并核对载入成功，再让用户刷新订阅。带令牌的授权目录和导出目录仅给相应服务账户访问，完成分发后清理旧快照。所有账户均被移除时，导出两个空文件，重新载入后拒绝所有新请求。

撤销账户 71 时执行 `php artisan fastcat:auto revoke vless:42 71`，随后导出到新目录并替换、重载两端的凭据。账户过期、套餐变更和用量变化后，也要重新导出并同步才能让节点执行新的授权状态。审计封禁、设备撤销或凭据泄露需要主动撤销相应账户授权；按账户发出的令牌适用于该账户的已授权设备。可将撤销、导出和受保护的同步接入运营方的生命周期任务。已建立的流按服务端既有连接生命周期结束。两端服务的按账户用量回传和速率限制属于独立的生产计量链路，需由运营部署接入。面板和示例不附带任何生产令牌。

## v2 的设备级授权

具备 v2 核心的 Android 使用 `fc_auto=1&fc_v2=1`。设备网关验证设备会话后向面板添加绑定该账户上游订阅 token 和设备记录 ID 的签名。网关与面板设置同一个至少 32 字节的私有 `FASTCAT_DEVICE_GRANT_KEY`。校验允许的时钟偏差为 60 秒。面板已配密钥时，缺少有效证明或没有设备授权的请求只保留原有订阅节点。未设置密钥的旧部署仍使用已有账户级路径。旧客户端只声明 `fc_auto` 时仍可使用已签发的账户级授权。

在节点的 `endpoints.json` 增加 `"h3-port":18444`，可选 `h3-server`、`h3-sni` 和 `tls-key-exchange`。在已登记节点、账户和真实设备记录 ID 上执行：

```sh
DEVICE_ID=dev_0123456789abcdef01234567
php artisan fastcat:auto grant vless:42 71 --device="$DEVICE_ID"
php artisan fastcat:auto export vless:42 --out=/srv/catboard-private/snapshot-v2-001
```

导出 h3、h2、v1 三份按入口独立的名单。每个设备在该账号及节点下取得独立的 H3 和 H2 凭据。撤销时执行 `php artisan fastcat:auto revoke vless:42 71 --device="$DEVICE_ID"`，禁用对应设备会话，重新导出、同步并 SIGHUP 所有启用的服务。仅禁用网关会话不会清除入口中已载入的令牌；正在使用的连接按其会话生命周期结束。转为严格按设备管控的账户还要撤销遗留的账户级凭据。

### CatNode 原生 FastCat v2 节点

在节点管理添加 v2node 节点，在协议菜单选 **FastCat v2**。设置连接域名、
端口和授权分组。面板记录键为 `v2node:<节点 ID>`，设备授权与订阅复用上面的流程。
在该记录的私有目录配置 `endpoints.json`，其中 `server`、`port` 和
`h3-port` 对应已经启动的 CatNode。用 `fastcat:auto grant v2node:<节点 ID>`
为测试账号和设备授权，再导出令牌同步到 CatNode，最后在安卓快猫刷新订阅。

手工授权模式的原生 FastCat v2 仅对已授权设备下发。CatNode 独立模式使用
授权文件。这套配置用于连通性验收，FastCat v2 按账号流量上报仍需接入后再启用正式计费。

#### CatNode 自动同步模式

CatNode 配置面板 HTTPS 地址、节点数字 ID 和节点通讯 Token 后，会定期通过
`GET /api/v1/server/fastCat/grants` 拉取授权。完成首次拉取后，满足权限组、套餐与流量条件的账号刷新快猫订阅时自动签发凭证，无需设备证明，H2/H3 使用独立令牌。面板以节点记录的
连接地址和连接端口下发两个入口。同一账号的设备共用凭证，旧设备级自动凭证会在下一次同步移除。
自动模式下无需创建 `endpoints.json`、执行授权导出或在两台服务器间复制
设备令牌。已签发的账号授权需由订阅刷新续期，账号失去节点资格后会从授权
快照移除。多实例部署须共享私有的 `storage/app/fastcat-v2` 目录。

FastCat v2 前置节点可以选择一个已接入 CatNode 的 FastCat v2 父节点。订阅
按子节点的显示状态和权限组筛选，账号还须属于父节点权限组。客户端连接
子节点的地址和端口，使用父节点的域名校验证书，由父节点 CatNode 验证
账号凭证。前置须转发同端口的 TCP 和 UDP。父节点可以隐藏在订阅里。

节点保存后，编辑页可复制 CatNode 安装命令。前置节点可复制 Nginx
`stream` 中的转发配置。部署命令包含节点通讯 Token，并校验安装包。请只在节点服务器的私有终端使用该命令。

CatNode v0.2.0 支持自动、仅 HTTP/2、仅 HTTP/3 三种模式。面板选定模式后，
CatNode 在下一次同步时应用入口授权策略。前置可跟随父节点或选用父节点
已启用的一条路径。只使用 HTTP/2 时无 UDP 业务；HTTP/3 可承载 TCP 和 UDP。
仅 HTTP/3 节点只下发给声明单入口能力的新版快猫。密钥交换由客户端按
节点设置与服务器协商，默认设置保留自动协商。

FastCat v2 计量要求 CatNode v0.3.0。CatNode 通过账号授权识别用户，按 H2/H3
实际转发的上行、下行业务字节合并，每 30 秒提交一次。面板沿用 V2node 的
节点倍率、套餐流量累计和统计队列。前置子节点的流量由父节点统计，按父节点
倍率入账。重传待上报批次使用同一编号，面板在 30 天内去重。
