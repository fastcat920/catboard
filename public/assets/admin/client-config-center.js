(function () {
    "use strict";

    var root = null;
    var activeTab = "editor";
    var state = null;
    var poller = null;
    var featureLabels = {
        balance: "钱包余额",
        devices: "设备管理",
        gift_card: "礼品卡",
        invite: "邀请中心",
        join_group: "加入群组",
        knowledge_base: "使用文档",
        orders: "订单记录",
        purchase: "购买套餐",
        tickets: "工单",
        traffic_details: "流量明细",
    };
    var platforms = [
        ["android", "Android"],
        ["windows", "Windows"],
        ["macos", "macOS"],
        ["linux", "Linux"],
    ];

    function esc(value) {
        var node = document.createElement("div");
        node.textContent = value == null ? "" : String(value);
        return node.innerHTML;
    }

    function dateTime(value) {
        if (!value) return "-";
        var date = new Date(Number(value) * 1000);
        return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
    }

    function api(path, options) {
        options = options || {};
        var headers = { Accept: "application/json", "Content-Type": "application/json" };
        var authorization = localStorage.getItem("authorization");
        if (authorization) headers.authorization = authorization;
        return fetch("/api/v1/" + window.settings.secure_path + "/client-config" + path, Object.assign({ credentials: "include", headers: headers }, options))
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (payload) {
                    if (!response.ok) {
                        var firstError = payload.errors && payload.errors[Object.keys(payload.errors)[0]];
                        throw new Error(Array.isArray(firstError) ? firstError[0] : (firstError || payload.message || "请求失败"));
                    }
                    return payload;
                });
            });
    }

    function isRoute() {
        return location.hash === "#/client-config" || location.pathname === "/client-config";
    }

    function closeOthers() {
        document.querySelectorAll(".referral-admin,.coupon-center-admin,.marketing-admin,.security-admin").forEach(function (node) { node.hidden = true; });
    }

    function open() {
        closeOthers();
        if (!root || !root.isConnected) {
            root = document.createElement("section");
            root.className = "client-config-admin";
            (document.getElementById("page-container") || document.body).appendChild(root);
        }
        root.hidden = false;
        setMenuActive(true);
        renderShell();
        load();
    }

    function close() {
        if (root) root.hidden = true;
        setMenuActive(false);
        stopPolling();
    }

    function setMenuActive(active) {
        document.querySelectorAll(".client-config-menu-link").forEach(function (link) { link.classList.toggle("active", active); });
    }

    function renderShell() {
        root.innerHTML = '<div class="p-0 p-lg-4"><div class="block mb-0">' +
            '<div class="client-config-heading"><div><h2>客户端配置</h2><p>可视化管理远程配置、加密方式与多云发布</p></div><button class="btn btn-light" data-refresh>刷新</button></div>' +
            '<nav class="nav nav-tabs nav-tabs-block client-config-tabs">' +
            [["editor", "配置编辑"], ["storage", "云存储"], ["releases", "版本与发布"]].map(function (item) {
                return '<button class="nav-link ' + (activeTab === item[0] ? "active" : "") + '" data-tab="' + item[0] + '">' + item[1] + '</button>';
            }).join("") + '</nav><main data-content><div class="client-config-loading">加载中…</div></main></div></div>';
        root.querySelector("[data-refresh]").onclick = load;
        root.querySelectorAll("[data-tab]").forEach(function (button) {
            button.onclick = function () {
                activeTab = button.dataset.tab;
                root.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item.dataset.tab === activeTab); });
                renderTab();
            };
        });
    }

    function load() {
        setContent('<div class="client-config-loading">加载中…</div>');
        api("/overview").then(function (payload) {
            state = payload.data;
            renderTab();
            if ((state.publications || []).some(function (item) { return item.status === "queued" || item.status === "publishing"; })) startPolling();
            else stopPolling();
        }).catch(showError);
    }

    function setContent(html) {
        var node = root && root.querySelector("[data-content]");
        if (node) node.innerHTML = html;
    }

    function showError(error) {
        setContent('<div class="alert alert-danger m-4">' + esc(error.message) + '</div>');
    }

    function renderTab() {
        if (!state) return;
        if (activeTab === "editor") renderEditor();
        else if (activeTab === "storage") renderStorage();
        else renderReleases();
    }

    function field(label, name, value, type, hint) {
        return '<label class="client-field"><span>' + label + '</span><input class="form-control" type="' + (type || "text") + '" name="' + name + '" value="' + esc(value || "") + '">' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
    }

    function renderEditor() {
        var config = state.draft || state.published;
        var content = config && config.content ? config.content : {};
        var update = content.update || {};
        var latest = update.latest || {};
        var contact = content.contact || {};
        var features = content.features || {};
        var ticket = content.ticket || {};
        var settings = state.settings || {};
        var sourceLabel = state.draft ? "草稿" : (state.published ? "已发布版本（保存时会创建新草稿）" : "新配置");
        setContent('<form class="client-config-form" data-editor>' +
            '<section class="client-panel client-summary"><div><span class="client-kicker">当前编辑</span><strong>v' + esc(config ? config.config_version : 1) + ' · ' + sourceLabel + '</strong></div><div><span class="client-kicker">上次发布</span><strong>' + (state.published ? 'v' + esc(state.published.config_version) + ' · ' + dateTime(state.published.published_at) : '尚未发布') + '</strong></div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>基础连接</h3><p>客户端会按顺序尝试面板地址，至少填写一个 HTTPS 地址。</p></div></div><div class="client-grid cols-2">' +
            field("面板类型", "panel_type", content.panel_type || "v2board") +
            field("最低客户端版本", "min_version", update.min_version || "", "text", "低于此版本时可在客户端触发强制升级") +
            '<label class="client-field span-2"><span>面板 API 地址（每行一个）</span><textarea class="form-control" name="domains" rows="4" required>' + esc((content.domains || []).join("\n")) + '</textarea></label>' +
            '<label class="client-field span-2"><span>更新说明</span><textarea class="form-control" name="changelog" rows="3">' + esc(update.changelog || "") + '</textarea></label></div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>客户端下载</h3><p>分别设置各平台版本号和安装包地址。</p></div></div><div class="client-platform-list">' + platforms.map(function (platform) {
                var row = latest[platform[0]] || {};
                return '<div class="client-platform-row"><strong>' + platform[1] + '</strong><input class="form-control" name="version_' + platform[0] + '" placeholder="版本号" value="' + esc(row.version || "") + '"><input class="form-control" name="url_' + platform[0] + '" placeholder="https:// 下载地址" value="' + esc(row.url || "") + '"></div>';
            }).join("") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>联系与服务</h3><p>敏感服务令牌会进入远程配置，请仅使用客户端可公开的受限令牌。</p></div></div><div class="client-grid cols-2">' +
            field("官网地址", "website", contact.website || "") + field("Telegram 群组", "telegram_group", contact.telegram_group || "") +
            field("Crisp Website ID", "crisp_website_id", contact.crisp_website_id || "") + field("Crisp 代理地址", "crisp_proxy_url", contact.crisp_proxy_url || "") +
            field("Salesmartly Token", "salesmartly_token", contact.salesmartly_token || "", "password") + field("图床 API Key", "imgbb_api_key", ticket.imgbb_api_key || "", "password") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>功能开关</h3><p>控制客户端入口显示，不替代服务端权限校验。</p></div></div><div class="client-feature-grid">' + Object.keys(featureLabels).map(function (key) {
                return '<label><input type="checkbox" name="feature_' + key + '" ' + (features[key] !== false ? 'checked' : '') + '><span>' + featureLabels[key] + '</span></label>';
            }).join("") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>加密与签名</h3><p>旧客户端使用 XOR+Base64；签名模式可防止配置被伪造，新客户端需配置公钥。</p></div></div><div class="client-grid cols-2">' +
            '<label class="client-field"><span>输出格式</span><select class="form-control" name="encryption_mode"><option value="xor_base64">XOR + Base64（兼容旧客户端）</option><option value="signed_xor_v2">签名加密 v2</option><option value="plain">明文 JSON（仅调试）</option></select></label>' +
            field("XOR 密钥", "xor_key", "", "password", settings.has_xor_key ? "已安全保存；留空表示保持不变" : "首次发布加密配置前必须设置") +
            '<label class="client-field span-2"><span>签名公钥</span><div class="client-copy-value"><code>' + esc(settings.signing_public_key || "尚未生成") + '</code><button class="btn btn-sm btn-light" type="button" data-copy-public ' + (!settings.signing_public_key ? 'disabled' : '') + '>复制</button></div></label>' +
            '<label class="client-check span-2"><input type="checkbox" name="regenerate_signing_key"><span>重新生成签名密钥（旧客户端公钥会立即失效，请谨慎操作）</span></label></div></section>' +
            '<section class="client-panel"><div class="client-grid cols-2">' + field("版本说明", "change_summary", config ? config.change_summary : "") + '<div class="client-actions"><button type="button" class="btn btn-light" data-preview>预览输出</button><button type="submit" class="btn btn-primary">保存草稿</button></div></div></section></form>');

        var form = root.querySelector("[data-editor]");
        form.encryption_mode.value = config ? config.encryption_mode : (settings.encryption_mode || "xor_base64");
        form.onsubmit = function (event) {
            event.preventDefault();
            var submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            var mode = form.encryption_mode.value;
            saveSettings(form, mode).then(function () {
                return api("/draft/save", { method: "POST", body: JSON.stringify({
                    id: state.draft ? state.draft.id : null,
                    content: buildContent(form, config),
                    encryption_mode: mode,
                    change_summary: form.change_summary.value.trim(),
                }) });
            }).then(function () { toast("草稿已保存"); load(); }).catch(function (error) { alert(error.message); submit.disabled = false; });
        };
        root.querySelector("[data-preview]").onclick = function () {
            if (!state.draft) return alert("请先保存草稿，再预览最终输出");
            api("/preview", { method: "POST", body: JSON.stringify({ id: state.draft.id }) }).then(showPreview).catch(function (error) { alert(error.message); });
        };
        root.querySelector("[data-copy-public]").onclick = function () { copyText(settings.signing_public_key || ""); };
    }

    function buildContent(form, current) {
        var latest = {};
        platforms.forEach(function (platform) {
            latest[platform[0]] = { version: form["version_" + platform[0]].value.trim(), url: form["url_" + platform[0]].value.trim() };
        });
        var features = {};
        Object.keys(featureLabels).forEach(function (key) { features[key] = form["feature_" + key].checked; });
        return {
            config_version: String(current ? current.config_version : 1),
            panel_type: form.panel_type.value.trim(),
            domains: form.domains.value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean),
            update: { changelog: form.changelog.value.trim(), latest: latest, min_version: form.min_version.value.trim() },
            contact: {
                crisp_proxy_url: form.crisp_proxy_url.value.trim(), crisp_website_id: form.crisp_website_id.value.trim(),
                salesmartly_token: form.salesmartly_token.value.trim(), telegram_group: form.telegram_group.value.trim(), website: form.website.value.trim(),
            },
            features: features,
            ticket: { imgbb_api_key: form.imgbb_api_key.value.trim() },
        };
    }

    function saveSettings(form, mode) {
        return api("/settings/save", { method: "POST", body: JSON.stringify({
            encryption_mode: mode,
            xor_key: form.xor_key.value,
            regenerate_signing_key: form.regenerate_signing_key.checked ? 1 : 0,
        }) });
    }

    function showPreview(payload) {
        var data = payload.data;
        var modal = makeModal("输出预览", '<div class="client-preview-meta"><span>格式：' + esc(data.encryption_mode) + '</span><span>大小：' + esc(data.bytes) + ' bytes</span><span>SHA-256：' + esc(data.checksum) + '</span></div><textarea class="form-control client-preview" readonly>' + esc(data.payload) + '</textarea>', '<button class="btn btn-light" data-close>关闭</button><button class="btn btn-primary" data-copy>复制内容</button>');
        modal.querySelector("[data-copy]").onclick = function () { copyText(data.payload); };
    }

    function renderStorage() {
        var rows = state.targets || [];
        setContent('<section class="client-panel"><div class="client-section-head"><div><h3>云存储目标</h3><p>支持阿里云 OSS、腾讯云 COS 和 UCloud US3，可同时发布到多个地址。</p></div><button class="btn btn-primary" data-add-target>新增目标</button></div>' +
            '<div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr><th>名称</th><th>服务商</th><th>Bucket / Endpoint</th><th>固定地址</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
            (rows.length ? rows.map(function (row) {
                return '<tr><td><strong>' + esc(row.name) + '</strong>' + (row.is_primary ? '<span class="badge badge-primary ml-2">主目标</span>' : '') + '</td><td>' + providerName(row.provider) + '</td><td><span>' + esc(row.bucket) + '</span><small>' + esc(row.endpoint) + '</small></td><td><a href="' + esc(row.public_url) + '" target="_blank" rel="noopener">' + esc(row.object_key) + '</a></td><td><span class="badge badge-' + (row.enabled ? 'success' : 'secondary') + '">' + (row.enabled ? '启用' : '停用') + '</span><small>' + esc(row.access_key_hint) + '</small></td><td><div class="client-row-actions"><button class="btn btn-sm btn-light" data-test="' + row.id + '">测试</button><button class="btn btn-sm btn-light" data-edit="' + row.id + '">编辑</button><button class="btn btn-sm btn-light text-danger" data-drop="' + row.id + '">删除</button></div></td></tr>';
            }).join("") : '<tr><td colspan="6" class="text-center text-muted p-4">尚未配置云存储目标</td></tr>') + '</tbody></table></div></section>');
        root.querySelector("[data-add-target]").onclick = function () { editTarget(null); };
        root.querySelectorAll("[data-edit]").forEach(function (button) { button.onclick = function () { editTarget(rows.find(function (row) { return String(row.id) === button.dataset.edit; })); }; });
        root.querySelectorAll("[data-test]").forEach(function (button) { button.onclick = function () { testTarget(Number(button.dataset.test), button); }; });
        root.querySelectorAll("[data-drop]").forEach(function (button) { button.onclick = function () { dropTarget(Number(button.dataset.drop)); }; });
    }

    function editTarget(row) {
        row = row || {};
        var body = '<form data-target-form><div class="client-grid cols-2">' +
            field("目标名称", "name", row.name || "") +
            '<label class="client-field"><span>云服务商</span><select class="form-control" name="provider"><option value="aliyun_oss">阿里云 OSS</option><option value="tencent_cos">腾讯云 COS</option><option value="ucloud_us3">UCloud US3</option></select></label>' +
            field("区域", "region", row.region || "", "text", "腾讯云可用于自动生成 Endpoint，例如 ap-guangzhou") + field("Endpoint", "endpoint", row.endpoint || "", "text", "不含 Bucket，例如 oss-cn-hongkong.aliyuncs.com") +
            field("Bucket", "bucket", row.bucket || "") + field("对象路径", "object_key", row.object_key || "config.json") +
            '<label class="client-field span-2"><span>客户端公开访问地址</span><input class="form-control" name="public_url" value="' + esc(row.public_url || "") + '" placeholder="https://bucket.endpoint/config.json" required><small>必须能被客户端匿名 HTTPS 读取，用于发布后完整性校验。</small></label>' +
            field("AccessKey ID", "access_key_id", "", "password", row.has_credentials ? "已安全保存，留空保持不变" : "必填") + field("SecretKey", "secret_key", "", "password", row.has_credentials ? "已安全保存，留空保持不变" : "必填") +
            field("临时安全令牌", "security_token", "", "password", "仅使用临时密钥时填写") +
            '<div class="client-toggle-stack"><label class="client-check"><input type="checkbox" name="enabled" ' + (row.enabled === false ? '' : 'checked') + '><span>启用目标</span></label><label class="client-check"><input type="checkbox" name="is_primary" ' + (row.is_primary ? 'checked' : '') + '><span>设为主目标</span></label></div></div></form>';
        var modal = makeModal(row.id ? "编辑云存储目标" : "新增云存储目标", body, '<button class="btn btn-light" data-close>取消</button><button class="btn btn-primary" data-save>保存</button>');
        var form = modal.querySelector("[data-target-form]");
        form.provider.value = row.provider || "aliyun_oss";
        modal.querySelector("[data-save]").onclick = function () {
            var button = this;
            button.disabled = true;
            var payload = { id: row.id || null };
            ["name","provider","region","endpoint","bucket","object_key","public_url","access_key_id","secret_key","security_token"].forEach(function (key) { payload[key] = form[key].value.trim(); });
            payload.enabled = form.enabled.checked ? 1 : 0;
            payload.is_primary = form.is_primary.checked ? 1 : 0;
            api("/target/save", { method: "POST", body: JSON.stringify(payload) }).then(function () { modal.remove(); toast("云存储目标已保存"); load(); }).catch(function (error) { alert(error.message); button.disabled = false; });
        };
    }

    function testTarget(id, button) {
        button.disabled = true;
        button.textContent = "测试中…";
        api("/target/test", { method: "POST", body: JSON.stringify({ id: id }) }).then(function () { toast("连接和公开读取测试通过"); }).catch(function (error) { alert(error.message); }).finally(function () { button.disabled = false; button.textContent = "测试"; });
    }

    function dropTarget(id) {
        if (!confirm("确认删除这个云存储目标？历史发布记录会保留。")) return;
        api("/target/drop", { method: "POST", body: JSON.stringify({ id: id }) }).then(function () { toast("目标已删除"); load(); }).catch(function (error) { alert(error.message); });
    }

    function renderReleases() {
        var versions = state.versions || [];
        var publications = state.publications || [];
        setContent('<section class="client-panel"><div class="client-section-head"><div><h3>配置版本</h3><p>发布会先保存不可变版本文件，再更新客户端使用的固定地址。</p></div></div><div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr><th>版本</th><th>说明</th><th>格式</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead><tbody>' + versions.map(function (row) {
            return '<tr><td><strong>v' + esc(row.config_version) + '</strong></td><td>' + esc(row.change_summary || "-") + '</td><td>' + modeName(row.encryption_mode) + '</td><td>' + statusBadge(row.status) + '</td><td>' + dateTime(row.published_at) + '</td><td><div class="client-row-actions"><button class="btn btn-sm btn-light" data-clone="' + row.id + '">创建新草稿</button><button class="btn btn-sm btn-primary" data-publish="' + row.id + '" ' + (row.status === 'publishing' ? 'disabled' : '') + '>发布</button></div></td></tr>';
        }).join("") + '</tbody></table></div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>发布流水</h3><p>队列状态、远端校验结果和失败原因会保留在这里。</p></div></div><div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr><th>版本</th><th>目标</th><th>状态</th><th>尝试</th><th>完成时间</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
            (publications.length ? publications.map(function (row) {
                var version = versions.find(function (item) { return Number(item.id) === Number(row.config_id); });
                return '<tr><td>v' + esc(version ? version.config_version : row.config_id) + '</td><td><strong>' + esc(row.target ? row.target.name : "已删除目标") + '</strong><small>' + esc(row.target ? providerName(row.target.provider) : "-") + '</small></td><td>' + statusBadge(row.status) + '</td><td>' + esc(row.attempts) + '</td><td>' + dateTime(row.finished_at) + '</td><td class="client-publication-result">' + (row.error ? '<span class="text-danger" title="' + esc(row.error) + '">' + esc(row.error) + '</span>' : (row.public_url ? '<a href="' + esc(row.public_url) + '" target="_blank" rel="noopener">打开配置</a>' : '-')) + '</td><td>' + (row.status === 'failed' ? '<button class="btn btn-sm btn-light" data-retry="' + row.id + '">重试</button>' : '-') + '</td></tr>';
            }).join("") : '<tr><td colspan="7" class="text-center text-muted p-4">暂无发布记录</td></tr>') + '</tbody></table></div></section>');
        root.querySelectorAll("[data-clone]").forEach(function (button) { button.onclick = function () { cloneVersion(Number(button.dataset.clone)); }; });
        root.querySelectorAll("[data-publish]").forEach(function (button) { button.onclick = function () { openPublish(Number(button.dataset.publish)); }; });
        root.querySelectorAll("[data-retry]").forEach(function (button) { button.onclick = function () { retryPublication(Number(button.dataset.retry)); }; });
    }

    function openPublish(configId) {
        var targets = (state.targets || []).filter(function (row) { return row.enabled; });
        if (!targets.length) return alert("请先新增并启用至少一个云存储目标");
        var body = '<div class="alert alert-warning">发布后客户端会读取新配置。系统会先上传版本文件、校验，再替换固定地址。</div><div class="client-target-choices">' + targets.map(function (row) {
            return '<label><input type="checkbox" value="' + row.id + '" ' + (row.is_primary ? 'checked' : '') + '><span><strong>' + esc(row.name) + '</strong><small>' + providerName(row.provider) + ' · ' + esc(row.public_url) + '</small></span></label>';
        }).join("") + '</div>';
        var modal = makeModal("选择发布目标", body, '<button class="btn btn-light" data-close>取消</button><button class="btn btn-primary" data-confirm>进入发布队列</button>');
        modal.querySelector("[data-confirm]").onclick = function () {
            var ids = Array.prototype.map.call(modal.querySelectorAll('input[type="checkbox"]:checked'), function (input) { return Number(input.value); });
            if (!ids.length) return alert("请选择至少一个发布目标");
            var button = this;
            button.disabled = true;
            api("/publish", { method: "POST", body: JSON.stringify({ config_id: configId, target_ids: ids }) }).then(function () { modal.remove(); toast("发布任务已进入 default 队列"); load(); }).catch(function (error) { alert(error.message); button.disabled = false; });
        };
    }

    function cloneVersion(id) {
        api("/version/clone", { method: "POST", body: JSON.stringify({ id: id }) }).then(function () { activeTab = "editor"; toast("已创建新草稿"); load(); }).catch(function (error) { alert(error.message); });
    }

    function retryPublication(id) {
        api("/publication/retry", { method: "POST", body: JSON.stringify({ id: id }) }).then(function () { toast("任务已重新进入队列"); load(); }).catch(function (error) { alert(error.message); });
    }

    function makeModal(title, body, footer) {
        var modal = document.createElement("div");
        modal.className = "client-config-modal";
        modal.innerHTML = '<div class="client-config-dialog"><header><h3>' + esc(title) + '</h3><button type="button" data-close>×</button></header><div class="client-config-modal-body">' + body + '</div><footer>' + footer + '</footer></div>';
        document.body.appendChild(modal);
        modal.querySelectorAll("[data-close]").forEach(function (button) { button.onclick = function () { modal.remove(); }; });
        modal.onclick = function (event) { if (event.target === modal) modal.remove(); };
        return modal;
    }

    function providerName(value) { return ({ aliyun_oss: "阿里云 OSS", tencent_cos: "腾讯云 COS", ucloud_us3: "UCloud US3" })[value] || value; }
    function modeName(value) { return ({ xor_base64: "XOR + Base64", signed_xor_v2: "签名加密 v2", plain: "明文 JSON" })[value] || value; }
    function statusBadge(value) {
        var map = { draft: ["草稿", "secondary"], publishing: ["发布中", "warning"], published: ["已发布", "success"], partial: ["部分失败", "danger"], archived: ["历史版本", "light"], queued: ["等待队列", "warning"], success: ["成功", "success"], failed: ["失败", "danger"] };
        var item = map[value] || [value, "secondary"];
        return '<span class="badge badge-' + item[1] + '">' + item[0] + '</span>';
    }
    function copyText(value) {
        if (!value) return;
        navigator.clipboard.writeText(value).then(function () { toast("已复制"); }).catch(function () { alert("复制失败，请手动复制"); });
    }
    function toast(message) {
        var node = document.createElement("div");
        node.className = "client-config-toast";
        node.textContent = message;
        document.body.appendChild(node);
        setTimeout(function () { node.remove(); }, 2200);
    }
    function startPolling() {
        stopPolling();
        poller = setInterval(function () { if (isRoute()) load(); }, 5000);
    }
    function stopPolling() { if (poller) clearInterval(poller); poller = null; }

    function mountSidebarMenu() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return false;
        if (nav.querySelector(".client-config-menu-item")) return true;
        var labels = Array.prototype.slice.call(nav.querySelectorAll(".nav-main-link-name"));
        var anchorLabel = labels.find(function (node) { return ["系统配置", "主题配置"].indexOf(node.textContent.trim()) >= 0; });
        var anchorItem = anchorLabel && anchorLabel.closest(".nav-main-item");
        var item = document.createElement("li");
        item.className = "nav-main-item client-config-menu-item";
        item.innerHTML = '<a class="nav-main-link client-config-menu-link" href="#/client-config"><i class="nav-main-link-icon fa fa-cloud-upload-alt"></i><span class="nav-main-link-name">客户端配置</span></a>';
        if (anchorItem && anchorItem.parentNode) anchorItem.parentNode.insertBefore(item, anchorItem.nextSibling);
        else nav.appendChild(item);
        item.querySelector("a").onclick = function (event) {
            event.preventDefault();
            if (location.hash !== "#/client-config") history.pushState({}, "", "/#/client-config");
            open();
        };
        return true;
    }

    function syncRoute() { if (isRoute()) open(); else close(); }
    var observer = new MutationObserver(function () { if (mountSidebarMenu() && isRoute() && (!root || root.hidden)) open(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    mountSidebarMenu();
    if (isRoute()) setTimeout(open, 0);
})();
