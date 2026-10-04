(function () {
    "use strict";

    var root = null;
    var activeTab = "editor";
    var state = null;
    var poller = null;
    var editingConfigId = null;
    var featureLabels = {
        balance_enabled: "钱包余额",
        devices_enabled: "设备管理",
        gift_card_enabled: "礼品卡",
        join_group_enabled: "加入群组",
        knowledge_base_enabled: "使用文档",
        orders_enabled: "订单记录",
        tickets_enabled: "工单",
        traffic_details_enabled: "流量明细",
    };
    var platforms = [
        { key: "android", label: "Android" },
        { key: "windows", label: "Windows" },
        { key: "macos", label: "macOS" },
        { key: "linux", label: "Linux" },
        { key: "ios", label: "iOS", appStore: true },
        { key: "tvos", label: "tvOS", appStore: true },
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
        var path = "/overview" + (editingConfigId ? "?edit_id=" + encodeURIComponent(editingConfigId) : "");
        api(path).then(function (payload) {
            state = payload.data;
            if (editingConfigId && (!state.draft || Number(state.draft.id) !== Number(editingConfigId))) editingConfigId = null;
            if (root) root.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item.dataset.tab === activeTab); });
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
        return '<label class="client-field"><span>' + label + '</span><input class="form-control" type="' + (type || "text") + '" name="' + name + '" value="' + esc(value == null ? "" : value) + '">' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
    }

    function textarea(label, name, value, rows, hint, className) {
        return '<label class="client-field ' + (className || "") + '"><span>' + label + '</span><textarea class="form-control" name="' + name + '" rows="' + (rows || 3) + '">' + esc(value || "") + '</textarea>' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
    }

    function lines(value) {
        if (Array.isArray(value)) return value.join("\n");
        return value || "";
    }

    function checked(value) {
        return value === false ? "" : " checked";
    }

    function featureValue(features, key) {
        if (Object.prototype.hasOwnProperty.call(features, key)) return features[key];
        var legacyKey = key.replace(/_enabled$/, "");
        return Object.prototype.hasOwnProperty.call(features, legacyKey) ? features[legacyKey] : true;
    }

    function platformEditor(platform, platformRows, legacyRows) {
        var row = platformRows[platform.key] || {};
        var legacy = legacyRows[platform.key] || {};
        var hasNewRow = Object.prototype.hasOwnProperty.call(platformRows, platform.key);
        var enabled = hasNewRow ? row.enabled !== false : Boolean(row.latest_version || row.version || legacy.version || legacy.url);
        var changelog = row.changelog || {};
        if (typeof changelog === "string") changelog = { zh_CN: changelog };
        return '<article class="client-platform-card" data-platform="' + platform.key + '">' +
            '<div class="client-platform-card-head"><div><strong>' + platform.label + '</strong><small>' + (platform.appStore ? '通过应用商店更新' : '通过安装包地址直接更新') + '</small></div>' +
            '<label class="client-switch"><input type="checkbox" name="enabled_' + platform.key + '"' + (enabled ? ' checked' : '') + '><span>启用</span></label></div>' +
            '<div class="client-grid cols-2">' +
            '<div class="client-readonly-field"><span>更新方式</span><strong>' + (platform.appStore ? '应用商店' : '直接下载') + '</strong></div>' +
            field("最新版本", "latest_version_" + platform.key, row.latest_version || row.version || legacy.version || "") +
            field("最低支持版本", "min_supported_version_" + platform.key, row.min_supported_version || "", "text", "低于该版本时强制升级") +
            (platform.appStore
                ? field("商店 ID", "app_id_" + platform.key, row.app_id || "", "text", "例如 123456789 或 id123456789")
                : field("下载地址", "url_" + platform.key, row.url || legacy.url || "", "url", "允许 HTTP 或 HTTPS")) +
            '<label class="client-check client-force-check span-2"><input type="checkbox" name="force_' + platform.key + '"' + ((row.force === true || (!hasNewRow && legacy.force === true)) ? ' checked' : '') + '><span>发现新版本时强制更新</span></label>' +
            textarea("中文更新说明", "changelog_zh_" + platform.key, changelog.zh_CN || changelog['zh-CN'] || "", 3, "", "span-2") +
            textarea("英文更新说明", "changelog_en_" + platform.key, changelog.en_US || changelog['en-US'] || "", 3, "", "span-2") +
            '</div></article>';
    }

    function renderEditor() {
        var config = state.draft || state.published;
        var content = config && config.content ? config.content : {};
        var update = content.update || {};
        var latest = update.latest || {};
        var platformRows = update.platforms || {};
        var contact = content.contact || {};
        var features = content.features || {};
        var latency = content.latency || {};
        var settings = state.settings || {};
        var sourceLabel = state.draft ? "草稿" : (state.published ? "已发布版本（保存时会创建新草稿）" : "新配置");
        setContent('<form class="client-config-form" data-editor>' +
            '<section class="client-panel client-summary"><div><span class="client-kicker">当前编辑</span><strong>v' + esc(config ? config.config_version : 1) + ' · ' + sourceLabel + '</strong></div><div><span class="client-kicker">上次发布</span><strong>' + (state.published ? 'v' + esc(state.published.config_version) + ' · ' + dateTime(state.published.published_at) : '尚未发布') + '</strong></div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>基础连接</h3><p>客户端会按顺序尝试连接；允许 HTTP 和 HTTPS，公开网络仍建议使用 HTTPS。</p></div></div><div class="client-grid cols-2">' +
            field("面板类型", "panel_type", content.panel_type || "v2board") +
            field("API 路径", "api_prefix", content.api_prefix || "/api/v1", "text", "通常保持 /api/v1") +
            textarea("面板 API 地址（每行一个）", "domains", lines(content.domains), 4, "支持 HTTP/HTTPS，顺序即客户端尝试顺序", "span-2") +
            textarea("网关地址（每行一个）", "gateway_urls", lines(content.gateway_urls || content.gateway_url), 4, "用于订阅和网关服务，支持 HTTP/HTTPS", "span-2") +
            '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>版本更新</h3><p>仅生成新版 platforms 配置，各平台独立设置版本、最低版本和双语更新说明。</p></div><span class="badge badge-primary">新版客户端</span></div>' +
            '<div class="client-platform-list">' + platforms.map(function (platform) { return platformEditor(platform, platformRows, latest); }).join("") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>联系与服务</h3><p>配置官网、邀请链接、群组和 Crisp 客服连接信息。</p></div></div><div class="client-grid cols-2">' +
            textarea("官网地址（每行一个）", "website", lines(contact.website), 3, "客户端会按顺序尝试打开", "span-2") + field("邀请链接域名", "invite_domain", contact.invite_domain || "", "url", "允许 HTTP 或 HTTPS") + field("Telegram 群组", "telegram_group", contact.telegram_group || contact.telegram || "") +
            field("Crisp Website ID", "crisp_website_id", contact.crisp_website_id || "") + field("Crisp 代理地址", "crisp_proxy_url", contact.crisp_proxy_url || "") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>功能开关</h3><p>控制客户端入口显示，不替代服务端权限校验。</p></div></div><div class="client-feature-grid">' + Object.keys(featureLabels).map(function (key) {
                return '<label><input type="checkbox" name="feature_' + key + '"' + checked(featureValue(features, key)) + '><span>' + featureLabels[key] + '</span></label>';
            }).join("") + '</div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>延迟显示</h3><p>控制客户端延迟数值的展示折扣，仅影响显示。</p></div></div><div class="client-grid cols-2">' +
            field("显示折扣百分比", "display_discount_percent", latency.display_discount_percent == null ? 0 : latency.display_discount_percent, "number", "允许 0–90，例如 20 表示显示值减少 20%") + '</div></section>' +
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
            api("/preview", { method: "POST", body: JSON.stringify({ id: state.draft.id, encryption_mode: form.encryption_mode.value }) }).then(showPreview).catch(function (error) { alert(error.message); });
        };
        root.querySelector("[data-copy-public]").onclick = function () { copyText(settings.signing_public_key || ""); };
    }

    function buildContent(form, current) {
        var source = current && current.content ? current.content : {};
        var content = JSON.parse(JSON.stringify(source || {}));
        var platformRows = {};
        platforms.forEach(function (platform) {
            var key = platform.key;
            var enabled = form["enabled_" + key].checked;
            var version = form["latest_version_" + key].value.trim();
            var url = platform.appStore ? "" : form["url_" + key].value.trim();
            var appId = platform.appStore ? form["app_id_" + key].value.trim() : "";
            var row = {
                enabled: enabled,
                source: platform.appStore ? "app_store" : "direct",
                latest_version: version,
                min_supported_version: form["min_supported_version_" + key].value.trim(),
                url: url,
                force: form["force_" + key].checked,
                changelog: {
                    zh_CN: form["changelog_zh_" + key].value.trim(),
                    en_US: form["changelog_en_" + key].value.trim(),
                },
            };
            if (appId) row.app_id = appId;
            platformRows[key] = row;
        });
        var features = {};
        Object.keys(featureLabels).forEach(function (key) { features[key] = form["feature_" + key].checked; });
        content.config_version = String(current ? current.config_version : 1);
        content.panel_type = form.panel_type.value.trim();
        content.api_prefix = form.api_prefix.value.trim() || "/api/v1";
        content.domains = splitLines(form.domains.value);
        content.gateway_urls = splitLines(form.gateway_urls.value);
        delete content.gateway_url;
        content.update = Object.assign({}, source.update || {}, {
            schema_version: 2,
            platforms: platformRows,
        });
        delete content.update.latest;
        delete content.update.min_version;
        delete content.update.changelog;
        delete content.update._comment_legacy;
        content.contact = Object.assign({}, source.contact || {}, {
            crisp_proxy_url: form.crisp_proxy_url.value.trim(),
            crisp_website_id: form.crisp_website_id.value.trim(),
            invite_domain: form.invite_domain.value.trim(),
            telegram_group: form.telegram_group.value.trim(),
            website: splitLines(form.website.value),
        });
        delete content.contact.salesmartly_token;
        content.features = features;
        content.latency = Object.assign({}, source.latency || {}, { display_discount_percent: Math.max(0, Math.min(90, Number(form.display_discount_percent.value) || 0)) });
        if (content.ticket) {
            delete content.ticket.imgbb_api_key;
            if (!Object.keys(content.ticket).length) delete content.ticket;
        }
        return content;
    }

    function splitLines(value) {
        return String(value || "").split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
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
        var automaticPublicUrl = defaultTargetPublicUrl(row);
        var hasCustomPublicUrl = Boolean(row.public_url && automaticPublicUrl && row.public_url !== automaticPublicUrl);
        var body = '<form data-target-form><div class="client-grid cols-2">' +
            field("目标名称", "name", row.name || "") +
            '<label class="client-field"><span>云服务商</span><select class="form-control" name="provider"><option value="aliyun_oss">阿里云 OSS</option><option value="tencent_cos">腾讯云 COS</option><option value="ucloud_us3">UCloud US3</option></select></label>' +
            field("区域", "region", row.region || "", "text", "腾讯云可用于自动生成 Endpoint，例如 ap-guangzhou") + field("Endpoint", "endpoint", row.endpoint || "", "text", "支持主机名、HTTP 或 HTTPS 地址") +
            field("Bucket", "bucket", row.bucket || "") + field("对象路径", "object_key", row.object_key || "config.json") +
            '<div class="client-readonly-field span-2"><span>自动生成的公开访问地址</span><strong data-generated-public-url>' + esc(automaticPublicUrl || "填写 Endpoint、Bucket 和对象路径后自动生成") + '</strong><small>后台会将配置对象设为公共读并使用该地址校验；如果 Bucket 开启了“阻止公共访问”，测试会失败。</small></div>' +
            '<label class="client-check span-2"><input type="checkbox" name="custom_public_url" ' + (hasCustomPublicUrl ? 'checked' : '') + '><span>使用 CDN 或自定义公开地址</span></label>' +
            '<label class="client-field span-2" data-custom-public-url ' + (hasCustomPublicUrl ? '' : 'hidden') + '><span>自定义公开访问地址</span><input class="form-control" name="public_url" value="' + esc(hasCustomPublicUrl ? row.public_url : "") + '" placeholder="https://config.example.com/client/config.json"><small>允许 HTTP 或 HTTPS，必须指向相同的对象路径并支持匿名读取。</small></label>' +
            field("AccessKey ID", "access_key_id", "", "password", row.has_credentials ? "已安全保存，留空保持不变" : "必填") + field("SecretKey", "secret_key", "", "password", row.has_credentials ? "已安全保存，留空保持不变" : "必填") +
            field("临时安全令牌", "security_token", "", "password", "仅使用临时密钥时填写") +
            '<div class="client-toggle-stack"><label class="client-check"><input type="checkbox" name="enabled" ' + (row.enabled === false ? '' : 'checked') + '><span>启用目标</span></label><label class="client-check"><input type="checkbox" name="is_primary" ' + (row.is_primary ? 'checked' : '') + '><span>设为主目标</span></label></div></div></form>';
        var modal = makeModal(row.id ? "编辑云存储目标" : "新增云存储目标", body, '<button class="btn btn-light" data-close>取消</button><button class="btn btn-primary" data-save>保存</button>');
        var form = modal.querySelector("[data-target-form]");
        form.provider.value = row.provider || "aliyun_oss";
        var generatedPublicUrl = modal.querySelector("[data-generated-public-url]");
        var customPublicUrlField = modal.querySelector("[data-custom-public-url]");
        function syncPublicUrl() {
            var url = defaultTargetPublicUrl({ endpoint: form.endpoint.value, bucket: form.bucket.value, object_key: form.object_key.value });
            generatedPublicUrl.textContent = url || "填写 Endpoint、Bucket 和对象路径后自动生成";
        }
        [form.endpoint, form.bucket, form.object_key].forEach(function (input) { input.addEventListener("input", syncPublicUrl); });
        form.custom_public_url.onchange = function () {
            customPublicUrlField.hidden = !form.custom_public_url.checked;
            if (!form.custom_public_url.checked) form.public_url.value = "";
        };
        modal.querySelector("[data-save]").onclick = function () {
            var button = this;
            button.disabled = true;
            var payload = { id: row.id || null };
            ["name","provider","region","endpoint","bucket","object_key","access_key_id","secret_key","security_token"].forEach(function (key) { payload[key] = form[key].value.trim(); });
            payload.public_url = form.custom_public_url.checked ? form.public_url.value.trim() : "";
            if (form.custom_public_url.checked && !payload.public_url) {
                button.disabled = false;
                return alert("请填写自定义公开访问地址");
            }
            payload.enabled = form.enabled.checked ? 1 : 0;
            payload.is_primary = form.is_primary.checked ? 1 : 0;
            api("/target/save", { method: "POST", body: JSON.stringify(payload) }).then(function () { modal.remove(); toast("云存储目标已保存"); load(); }).catch(function (error) { alert(error.message); button.disabled = false; });
        };
    }

    function defaultTargetPublicUrl(row) {
        var endpoint = String(row.endpoint || "").trim();
        var bucket = String(row.bucket || "").trim();
        var objectKey = String(row.object_key || "").trim().replace(/^\/+/, "");
        if (!endpoint || !bucket || !objectKey) return "";
        var scheme = endpoint.toLowerCase().indexOf("http://") === 0 ? "http" : "https";
        endpoint = endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        var host = endpoint.toLowerCase().indexOf(bucket.toLowerCase() + ".") === 0 ? endpoint : bucket + "." + endpoint;
        var path = objectKey.split("/").map(function (part) { return encodeURIComponent(part); }).join("/");
        return scheme + "://" + host + "/" + path;
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
            var isDraft = row.status === 'draft';
            var actions = isDraft
                ? '<button class="btn btn-sm btn-light" data-edit-version="' + row.id + '">编辑</button><button class="btn btn-sm btn-light text-danger" data-drop-version="' + row.id + '">删除</button>'
                : '<button class="btn btn-sm btn-light" data-clone="' + row.id + '">创建新草稿</button>';
            actions += '<button class="btn btn-sm btn-primary" data-publish="' + row.id + '" ' + (row.status === 'publishing' ? 'disabled' : '') + '>发布</button>';
            return '<tr><td><strong>v' + esc(row.config_version) + '</strong></td><td>' + esc(row.change_summary || "-") + '</td><td>' + modeName(row.encryption_mode) + '</td><td>' + statusBadge(row.status) + '</td><td>' + dateTime(row.published_at) + '</td><td><div class="client-row-actions">' + actions + '</div></td></tr>';
        }).join("") + '</tbody></table></div></section>' +
            '<section class="client-panel"><div class="client-section-head"><div><h3>发布流水</h3><p>队列状态、远端校验结果和失败原因会保留在这里。</p></div></div><div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr><th>版本</th><th>目标</th><th>状态</th><th>尝试</th><th>完成时间</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
            (publications.length ? publications.map(function (row) {
                var version = versions.find(function (item) { return Number(item.id) === Number(row.config_id); });
                return '<tr><td>v' + esc(version ? version.config_version : row.config_id) + '</td><td><strong>' + esc(row.target ? row.target.name : "已删除目标") + '</strong><small>' + esc(row.target ? providerName(row.target.provider) : "-") + '</small></td><td>' + statusBadge(row.status) + '</td><td>' + esc(row.attempts) + '</td><td>' + dateTime(row.finished_at) + '</td><td class="client-publication-result">' + (row.error ? '<span class="text-danger" title="' + esc(row.error) + '">' + esc(row.error) + '</span>' : (row.public_url ? '<a href="' + esc(row.public_url) + '" target="_blank" rel="noopener">打开配置</a>' : '-')) + '</td><td>' + (row.status === 'failed' ? '<button class="btn btn-sm btn-light" data-retry="' + row.id + '">重试</button>' : '-') + '</td></tr>';
            }).join("") : '<tr><td colspan="7" class="text-center text-muted p-4">暂无发布记录</td></tr>') + '</tbody></table></div></section>');
        root.querySelectorAll("[data-clone]").forEach(function (button) { button.onclick = function () { cloneVersion(Number(button.dataset.clone)); }; });
        root.querySelectorAll("[data-edit-version]").forEach(function (button) { button.onclick = function () { editVersion(Number(button.dataset.editVersion)); }; });
        root.querySelectorAll("[data-drop-version]").forEach(function (button) { button.onclick = function () { dropVersion(Number(button.dataset.dropVersion)); }; });
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
        api("/version/clone", { method: "POST", body: JSON.stringify({ id: id }) }).then(function (payload) { editingConfigId = payload.data.id; activeTab = "editor"; toast("已创建新草稿"); load(); }).catch(function (error) { alert(error.message); });
    }

    function editVersion(id) {
        editingConfigId = id;
        activeTab = "editor";
        load();
    }

    function dropVersion(id) {
        if (!confirm("确认删除这个未发布草稿？删除后无法恢复。")) return;
        api("/version/drop", { method: "POST", body: JSON.stringify({ id: id }) }).then(function () {
            if (Number(editingConfigId) === Number(id)) editingConfigId = null;
            toast("草稿已删除");
            load();
        }).catch(function (error) { alert(error.message); });
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
