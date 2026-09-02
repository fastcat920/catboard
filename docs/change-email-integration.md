# 修改邮箱功能对接文档

本文供 Web 主题和客户端开发者对接用户自主修改邮箱功能。

## 功能流程

1. 用户登录后进入“账户安全”或“个人中心”。
2. 用户填写新邮箱和当前密码。
3. 调用“发送验证码”接口，验证码会发送到新邮箱。
4. 用户填写新邮箱收到的 6 位验证码。
5. 调用“修改邮箱”接口。
6. 修改成功后，服务端会注销该账号的全部登录会话。客户端必须清除本地登录信息，并跳转到登录页，让用户使用新邮箱重新登录。

建议界面字段：

- 当前邮箱（只读）
- 新邮箱
- 当前密码
- 6 位邮箱验证码
- “发送验证码”按钮
- “确认修改”按钮

## 鉴权方式

两个接口都需要用户登录鉴权。

将登录接口返回的 `auth_data` 原样放入 HTTP `Authorization` 请求头：

```http
Authorization: <auth_data>
Content-Type: application/json
```

注意：本项目使用的是原始 `auth_data`，默认不添加 `Bearer ` 前缀。也可以在请求参数中传递 `auth_data`，但主题和客户端建议统一使用请求头。

## 1. 发送新邮箱验证码

```http
POST /api/v1/user/sendChangeEmailVerify
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `new_email` | string | 是 | 新邮箱，最长 64 个字符 |
| `password` | string | 是 | 当前账号密码 |

请求示例：

```json
{
  "new_email": "new@example.com",
  "password": "current-password"
}
```

成功响应：

```json
{
  "data": true
}
```

限制：

- 验证码发送到新邮箱。
- 验证码有效期为 5 分钟。
- 相同用户和新邮箱 60 秒内不能重复发送。
- 同一用户与 IP 每小时最多请求 5 次。
- 新邮箱必须未被其他账号使用，并满足平台邮箱白名单和 Gmail 别名规则。

## 2. 确认修改邮箱

```http
POST /api/v1/user/changeEmail
```

请求参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `new_email` | string | 是 | 必须与发送验证码时的新邮箱一致 |
| `password` | string | 是 | 当前账号密码 |
| `email_code` | string | 是 | 新邮箱收到的 6 位验证码 |

请求示例：

```json
{
  "new_email": "new@example.com",
  "password": "current-password",
  "email_code": "123456"
}
```

成功响应：

```json
{
  "data": true
}
```

成功后必须执行：

```text
清除本地 auth_data/token
清除缓存的用户信息
跳转登录页
提示“邮箱修改成功，请使用新邮箱重新登录”
```

用户 ID 不会改变，因此套餐、余额、订单和邀请关系不受影响。

## 错误处理

接口错误信息由后端响应中的消息字段返回，调用方应优先展示服务端消息。常见 HTTP 状态码：

| 状态码 | 含义 | 建议处理 |
| --- | --- | --- |
| `403` | 未登录或会话已过期 | 清除登录信息并跳转登录页 |
| `422` | 参数格式校验失败 | 在表单对应字段旁显示错误 |
| `429` | 发送验证码过于频繁 | 提示用户稍后重试 |
| `500` | 密码错误、邮箱已存在、验证码错误等业务错误 | 展示服务端返回的具体消息 |

常见业务提示：

- 当前密码错误
- 新邮箱不能与当前邮箱相同
- 邮箱已在系统中存在
- 邮箱验证码有误
- 验证码已发送，请过一会儿再请求
- 邮箱后缀不处于白名单中
- 不支持 Gmail 别名邮箱

## JavaScript 对接示例

```js
async function apiPost(path, payload, authData) {
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authData,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || result.code && result.code !== 200) {
    throw new Error(result.message || result.error || '请求失败');
  }
  return result;
}

// 发送验证码
await apiPost('/user/sendChangeEmailVerify', {
  new_email: newEmail.trim().toLowerCase(),
  password: currentPassword,
}, authData);

// 确认修改
await apiPost('/user/changeEmail', {
  new_email: newEmail.trim().toLowerCase(),
  password: currentPassword,
  email_code: emailCode,
}, authData);

// 修改成功后退出登录
localStorage.removeItem('auth_data');
localStorage.removeItem('token');
window.location.href = '/#/login';
```

客户端若使用 Axios、Dio、OkHttp 等网络库，请保持相同的请求路径、JSON 字段和 `Authorization` 请求头即可。

## 交互建议

- “发送验证码”后启动 60 秒倒计时，倒计时期间禁用按钮。
- 提交期间禁用按钮，避免重复请求。
- 密码输入框使用安全输入模式，不记录或持久化密码。
- 邮箱输入框失去焦点时执行基本格式校验。
- 修改成功后不要继续使用旧会话请求接口，因为服务端已经将所有会话注销。
- 客户端日志中不要记录密码、验证码或完整的 `auth_data`。
