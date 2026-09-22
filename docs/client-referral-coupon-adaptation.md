# 客户端适配指南：邀请中心与优惠券中心

本文档面向 Web、iOS、Android 等用户客户端，描述近期邀请功能和账户优惠券功能的实际接口、字段语义、页面流程与兼容要求。内容以当前 `custom` 分支代码为准。

## 1. 通用约定

### 1.1 API 基础路径与鉴权

- 用户接口基础路径：`/api/v1/user`
- 注册、邀请访问统计接口位于 Passport API 下，以项目现有 Passport 路由前缀为准。
- 登录后接口继续使用项目现有 `authorization` 请求头。
- 成功响应通常为：`{ "data": ... }`。
- 参数校验失败通常返回 HTTP `422`；业务错误可能返回 HTTP `500`。

### 1.2 金额、流量与时间

- 所有金额均为最小货币单位。例如人民币 `500` 表示 `¥5.00`。
- `traffic` 奖励值的单位是 GB。
- `duration` 奖励值的单位是天。
- `starts_at`、`ends_at`、`expires_at`、`granted_at` 等业务时间均为 Unix 秒级时间戳。
- Eloquent 的 `created_at`、`updated_at` 在部分接口中可能序列化为 ISO 8601 字符串。客户端不要一律乘以 `1000`，应同时兼容数字时间戳和日期字符串。

推荐时间解析：

```ts
function parseApiDate(value: number | string | null): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(value)) {
    return new Date(Number(value) * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
```

### 1.3 中英文显示

客户端只需支持简体中文和英文。

通用取值规则：

```ts
const localized = locale === 'en-US'
  ? (record.name_en || record.name)
  : record.name;
```

适用于：

- 成长等级：`name/name_en`、`description/description_en`
- 邀请活动：`name/name_en`、`description/description_en`
- 优惠券：`name/name_en`、`description/description_en`

## 2. 邀请中心

### 2.1 获取旧版邀请基础数据

```http
GET /api/v1/user/invite/fetch
```

该接口是旧客户端兼容接口，只返回 `codes` 和固定顺序的 `stat` 数组。成长等级及达标奖励等增强数据请使用 `/api/v1/user/invite/program`，不要继续扩展本接口的响应结构。

基础结构：

```json
{
  "data": {
    "codes": [],
    "stat": [0, 0, 0, 10, 0]
  }
}
```

#### `codes`

当前用户的有效邀请码数组。常用字段：

```json
{
  "id": 1,
  "user_id": 100,
  "code": "ABC12345",
  "status": 0,
  "pv": 12
}
```

#### `stat` 索引定义

`stat` 目前仍是数组，客户端必须按下标读取：

| 下标 | 含义 | 单位 |
|---|---|---|
| `0` | 邀请注册人数 | 人 |
| `1` | 已确认佣金 | 最小货币单位 |
| `2` | 确认中佣金 | 最小货币单位 |
| `3` | 当前佣金比例 | 百分比整数 |
| `4` | 可用佣金 | 最小货币单位 |

建议客户端先转换为具名对象，避免页面中直接使用数组下标。

推广计划使用独立接口：

```http
GET /api/v1/user/invite/program
```

响应结构：

```json
{
  "data": {
    "program": {}
  }
}
```

#### `program`

邀请增强功能关闭或相关数据表不存在时，`program` 为 `null`。客户端必须兼容此情况，并回退到旧版邀请码与佣金页面。

启用时可能包含：

```json
{
  "setting": {},
  "effective_invites": 3,
  "level": {},
  "level_expires_at": 1790000000,
  "next_level": {
    "reward": {}
  },
  "recent_rewards": [],
  "campaign": {},
  "newcomer_reward": {}
}
```

所有扩展字段都应按可空、可缺失处理。

### 2.2 有效邀请

`effective_invites` 不是注册人数。当前定义为：受邀用户完成第一笔有效套餐订单后计为一次有效邀请。

客户端建议同时展示：

- 注册人数：`stat[0]`
- 有效邀请人数：`program.effective_invites`

不要把两者混用。

### 2.3 成长等级

`program.level` 可能为 `null`，否则常用字段如下：

| 字段 | 含义 |
|---|---|
| `id` | 等级 ID |
| `name` / `name_en` | 中英文名称 |
| `description` / `description_en` | 中英文描述 |
| `required_invites` | 所需有效邀请人数 |
| `required_revenue` | 所需邀请成交额，最小货币单位 |
| `commission_rate` | 返佣比例百分比 |
| `member_discount` | 套餐优惠百分比 |
| `valid_days` | 等级有效天数，`0` 表示不设固定有效期 |
| `retain_invites` | 保级所需有效邀请数 |
| `enabled` | 是否启用 |

用户当前等级到期时间使用顶层字段：

```text
program.level_expires_at
```

客户端展示建议：

- 等级名称、当前返佣比例。
- 有有效期时显示到期时间。
- 无等级时显示普通用户及 `stat[3]` 的返佣比例。

### 2.4 下一等级与达标奖励

`program.next_level` 表示下一个尚未达到的成长等级。等级的一次性达标奖励位于 `program.next_level.reward`；没有奖励时该字段为 `null`。旧字段 `program.next_milestone` 已移除。

常用字段：

| 字段 | 含义 |
|---|---|
| `next_level.name` / `name_en` | 下一等级中英文名称 |
| `next_level.required_invites` | 升级所需有效邀请数 |
| `next_level.required_revenue` | 升级所需邀请成交额 |
| `next_level.commission_rate` | 下一等级返佣比例 |
| `next_level.member_discount` | 下一等级套餐优惠比例 |
| `next_level.reward.reward_type` | 一次性达标奖励类型 |
| `next_level.reward.reward_value` | 一次性达标奖励值 |

奖励类型：

| 值 | 显示含义 | 数值单位 |
|---|---|---|
| `balance` | 账户余额 | 最小货币单位 |
| `commission_balance` | 推广佣金 | 最小货币单位 |
| `traffic` | 流量 | GB |
| `duration` | 套餐时长 | 天 |

进度计算：

```ts
const current = program.effective_invites;
const target = program.next_level?.required_invites;
const remaining = target ? Math.max(0, target - current) : 0;
```

### 2.5 奖励流水

`program.recent_rewards` 最多返回最近 10 条非“有效邀请标记”流水。

常用字段：

| 字段 | 含义 |
|---|---|
| `reward_type` | 奖励类型 |
| `reward_value` | 奖励值 |
| `status` | 奖励状态 |
| `description` | 描述 |
| `granted_at` | 发放时间 |
| `campaign_id` | 来源活动 ID，可空 |

奖励状态：

- `pending`：待确认
- `granted`：已发放
- `reversed`：已撤销
- `rejected`：已拒绝

`effective_invite` 是系统内部的有效邀请事件类型，不应显示成英文原值。若其他接口返回该类型，应显示为“有效邀请 / Effective referral”。

### 2.6 限时邀请活动

`program.campaign` 只返回当前用户可参与的最新一个有效活动，可能为空或缺失。

| 字段 | 含义 |
|---|---|
| `name/name_en` | 活动名称 |
| `description/description_en` | 活动说明 |
| `starts_at/ends_at` | 开始、结束时间 |
| `audience` | `all`、`new`、`existing` |
| `plan_ids` | 指定套餐 ID 数组，空表示不限 |
| `first_order_min` | 首单最低实付金额 |
| `commission_multiplier` | 活动返佣倍率，如 `2.00` |
| `bonus_required_invites` | 每达到多少有效邀请触发一次邀请人奖励 |
| `inviter_reward_type/value` | 邀请人额外奖励 |
| `invitee_reward_type/value` | 被邀请人活动奖励 |
| `budget_total` | 现金类总预算，可空 |
| `per_user_limit` | 单用户奖励次数上限，可空 |
| `grant_limit` | 总发放次数上限，可空 |

倒计时以服务端 `ends_at` 为准，到期后重新请求 `/invite/program`，不要只依赖本地倒计时决定活动资格。

### 2.7 渠道追踪

推荐分享链接：

```text
{站点注册链接}?code={邀请码}&utm_source={渠道}
```

建议渠道值：`copy`、`poster`、`telegram`、`whatsapp`、`twitter`、`email`。渠道只允许字母、数字、下划线和连字符，最长 50 个字符。

邀请落地页加载后调用访问统计接口：

```http
POST /api/v1/passport/comm/pv
```

请求参数：

```json
{
  "invite_code": "ABC12345",
  "utm_source": "telegram",
  "visitor_id": "客户端生成并持久化的匿名访客ID"
}
```

同一邀请码、同一访客每天只计一次访问。注册时仍需提交原有 `invite_code`，后端会把最近访问链路关联到新用户。

### 2.8 新人优惠券状态

如果当前用户通过邀请注册且获得新人优惠券，`program.newcomer_reward` 返回：

```json
{
  "status": "available",
  "expires_at": 1790000000,
  "coupon_name": "新人首单券"
}
```

它只用于邀请页的简要提示。完整详情应跳转优惠券钱包并读取 `/coupon/wallet`。

### 2.9 其他邀请接口

创建邀请码：

```http
GET /api/v1/user/invite/save
```

佣金明细：

```http
GET /api/v1/user/invite/details?current=1&page_size=20
```

该接口保留旧版订单佣金记录结构。新版完整佣金流水使用：

```http
GET /api/v1/user/invite/ledger?current=1&page_size=20
```

推广计划使用：

```http
GET /api/v1/user/invite/program
```

响应包含 `data` 和 `total`。

## 3. 优惠券中心

旧优惠码输入、验证和兑换流程已经移除。客户端不要再展示优惠码输入框，也不要调用旧优惠码接口。

### 3.1 优惠券钱包

```http
GET /api/v1/user/coupon/wallet
```

返回当前用户全部账户优惠券，并自动刷新已生效和已过期状态。

优惠券主要字段：

| 字段 | 含义 |
|---|---|
| `id` | 用户优惠券 ID，下单时提交此 ID |
| `template_id` | 优惠券模板 ID |
| `source` | 来源 |
| `status` | 使用状态 |
| `starts_at/expires_at` | 生效与到期时间 |
| `order_id` | 已使用订单 ID，可空 |
| `template` | 优惠券规则与中英文信息 |

`template` 常用字段：

| 字段 | 含义 |
|---|---|
| `name/name_en` | 中英文名称 |
| `description/description_en` | 中英文描述 |
| `discount_type` | `fixed` 或 `percent` |
| `discount_value` | 固定金额时为最小货币单位；百分比时为整数百分比 |
| `plan_ids` | 限定套餐 ID 数组，空表示不限 |
| `periods` | 限定购买周期数组，空表示不限 |
| `first_order_only` | 是否仅限用户首笔有效套餐订单 |
| `allow_renewal` | 是否可用于续费 |
| `stackable` | 是否可与会员折扣叠加 |

状态显示：

| 值 | 中文 | English |
|---|---|---|
| `pending` | 待生效 | Upcoming |
| `available` | 可使用 | Available |
| `locked` | 已锁定 | Locked |
| `used` | 已使用 | Used |
| `expired` | 已过期 | Expired |
| `revoked` | 已撤销 | Revoked |

来源显示：

| 实际值 | 中文 | English |
|---|---|---|
| `manual` | 后台手动发放 | Manual issuance |
| `referral_newcomer` 或 `newcomer` | 新人邀请奖励 | Newcomer referral reward |
| `distribution_task` | 平台批量发放 | Platform distribution |
| `campaign` | 邀请活动奖励 | Referral campaign reward |

### 3.2 查询当前套餐可用优惠券

```http
GET /api/v1/user/coupon/available?plan_id=1&period=month_price
```

响应：

```json
{
  "data": {
    "original_amount": 2000,
    "recommended": {},
    "available_coupons": [],
    "unavailable_coupons": []
  }
}
```

- `recommended` 是后端推荐券，即可用券排序后的第一张。
- 排序优先选择优惠金额更高的券；优惠金额相同时优先选择更早到期的券。
- `available_coupons[*].calculated_discount` 是针对当前订单计算后的实际优惠金额。
- `unavailable_coupons[*].unavailable_reason` 用于说明不可用原因。

不可用原因映射：

| 值 | 建议文案 |
|---|---|
| `template_disabled` | 优惠券已停用 |
| `plan_not_supported` | 不适用于当前套餐 |
| `period_not_supported` | 不适用于当前购买周期 |
| `first_order_only` | 仅限首单用户使用 |
| `renewal_not_supported` | 不支持续费订单 |

### 3.3 订单预览

用户进入周期确认页或切换优惠券时调用：

```http
POST /api/v1/user/order/preview
Content-Type: application/json
```

自动使用推荐券：

```json
{
  "plan_id": 1,
  "period": "month_price"
}
```

指定优惠券：

```json
{
  "plan_id": 1,
  "period": "month_price",
  "user_coupon_id": 123
}
```

明确不使用优惠券：

```json
{
  "plan_id": 1,
  "period": "month_price",
  "disable_auto_coupon": true
}
```

响应：

```json
{
  "data": {
    "original_amount": 2000,
    "coupon_discount": 500,
    "vip_discount": 0,
    "final_amount": 1500,
    "selected_coupon": {},
    "available_coupons": [],
    "unavailable_coupons": []
  }
}
```

客户端金额区必须以预览接口返回值为准，不要自行复制后端优惠算法。

### 3.4 创建订单

```http
POST /api/v1/user/order/save
```

创建订单时必须提交与最后一次预览一致的选择：

```json
{
  "plan_id": 1,
  "period": "month_price",
  "user_coupon_id": 123,
  "disable_auto_coupon": false
}
```

规则：

- 不传 `user_coupon_id` 且未设置 `disable_auto_coupon=true`：后端自动选择推荐券。
- 传 `user_coupon_id`：锁定指定优惠券；若已失效或不满足条件，返回 `422`。
- `disable_auto_coupon=true` 且不传 ID：明确不使用优惠券。
- 创建订单后优惠券状态变为 `locked`。
- 订单支付成功后变为 `used`。
- 未支付订单取消或释放后，优惠券恢复为 `available`；若已过期则变为 `expired`。

### 3.5 结算页交互要求

推荐流程：

1. 用户选择套餐周期。
2. 调用 `/order/preview`，默认采用后端推荐券。
3. 展示“已选择优惠券”与“更换优惠券”。
4. 弹层展示可用券、不可用券及原因，并提供“不使用优惠券”。
5. 每次切换都重新调用 `/order/preview`。
6. 创建订单时提交相同的 `user_coupon_id` 或 `disable_auto_coupon`。

禁止继续保留：

- 优惠码输入框
- “验证优惠码”按钮
- 创建订单后再选择优惠券
- 客户端自行计算最终支付金额

### 3.6 优惠券与会员折扣

- `template.stackable=true`：优惠券优惠后仍可叠加会员折扣。
- `template.stackable=false`：使用优惠券后不再计算会员折扣。
- `vip_discount` 与 `final_amount` 始终使用 `/order/preview` 返回值。

### 3.7 优惠券到账邮件

邮件属于服务端通知能力，客户端无需触发。优惠券实际到账后，服务端根据以下优先级决定是否发送：

```text
系统全局开关 → 优惠券模板开关 → send_email 队列
```

邮件通知状态不是优惠券使用状态，客户端用户钱包通常无需展示后台邮件状态。邮件失败不影响优惠券到账和使用。

## 4. 推荐页面结构

### 4.1 邀请中心

- 数据概览：注册人数、有效邀请、确认中佣金、可用佣金。
- 当前等级：等级名称、返佣比例、有效期。
- 下一成长等级：当前进度、升级条件、等级权益和一次性达标奖励。
- 活动卡片：中英文说明、倒计时、奖励和适用条件。
- 分享区域：复制邀请链接、邀请码和渠道分享按钮。
- 新人奖励状态。
- 最近奖励流水。

### 4.2 优惠券中心

- 可使用
- 待生效
- 已使用
- 已过期/已撤销

卡片至少展示名称、优惠内容、门槛、适用范围和到期时间。

## 5. 客户端验收清单

- [ ] 邀请增强功能关闭时，旧邀请页仍可使用。
- [ ] `program` 及其所有扩展字段缺失时不崩溃。
- [ ] 中文和英文都按对应字段显示，英文为空时回退中文。
- [ ] 注册人数和有效邀请人数没有混淆。
- [ ] 活动倒计时按服务端时间戳计算并在到期后刷新。
- [ ] 分享链接传递邀请码和 `utm_source`。
- [ ] 优惠券钱包正确区分六种状态和四类来源。
- [ ] 周期页不再出现优惠码输入框。
- [ ] 默认自动选择推荐券，用户可以换券或明确不使用。
- [ ] 切换优惠券后重新调用订单预览。
- [ ] 创建订单提交与预览一致的优惠券参数。
- [ ] 金额统一除以 100 显示，不使用浮点数计算支付金额。
- [ ] 同时兼容 Unix 秒级时间戳和 ISO 日期字符串。
- [ ] `422` 时展示后端业务提示并重新刷新可用券。

## 6. 当前能力边界

- 旧版邀请统计和邀请码保留在 `/invite/fetch`；推广计划使用 `/invite/program`，完整佣金流水使用 `/invite/ledger`。
- 账户优惠券已经替代旧优惠码，但兑换码属于另一套能力，不应复用优惠券 UI。
- 邀请活动当前奖励类型为余额、佣金、流量或套餐时长；活动奖励暂未直接发放优惠券。
- 等级与活动规则以服务端判定为准，客户端只负责展示，不应自行判断最终奖励资格。
