# 账号注销与试用防重复领取

## 行为

- 用户在个人中心获取当前邮箱验证码，验证通过后可立即注销；不检查订单、余额或佣金。
- 注销会撤销登录和订阅、停用套餐、匿名化邮箱及个人标识，但保留用户主记录和历史订单。
- 管理员原有的单个与批量删除操作改为相同的匿名化流程，不再删除订单。
- 原邮箱注销后可以重新注册，但 `v2_trial_claim` 中的不可逆邮箱哈希会阻止再次领取新用户试用。

## 部署

升级脚本会自动生成 `TRIAL_IDENTITY_KEY` 并运行自定义迁移。手动部署时先配置：

```dotenv
TRIAL_IDENTITY_KEY=<至少32字符的随机密钥>
```

生成示例：

```bash
openssl rand -hex 32
```

随后执行：

```bash
php artisan config:clear
php artisan v2board:upgrade-database
php artisan config:cache
```

`TRIAL_IDENTITY_KEY` 启用后不得随意更换，否则已有试用领取哈希将无法匹配。

## 保留与清理

注销后保留订单、余额、佣金、流量汇总和安全审计记录。登录 Session、订阅凭证、套餐、
Telegram 绑定、邀请码及可识别邮箱会被撤销或匿名化；未关闭工单会自动关闭。
