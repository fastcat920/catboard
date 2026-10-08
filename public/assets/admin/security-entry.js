(function () {
    "use strict";

    var mounting = false;
    var lastUserFetch = null;

    function api(path, options) {
        options = options || {};
        var headers = Object.assign(
            { Accept: "application/json", "Content-Type": "application/json" },
            options.headers || {},
        );
        var authorization = localStorage.getItem("authorization");
        if (authorization) headers.authorization = authorization;
        return window.fetch(
            "/api/v1/" + window.settings.secure_path + path,
            Object.assign({ credentials: "include" }, options, { headers: headers }),
        ).then(function (response) {
            return response.json().then(function (payload) {
                if (!response.ok) {
                    var errors = payload.errors || {};
                    throw new Error(payload.message || errors[Object.keys(errors)[0]] || "请求失败");
                }
                return payload.data;
            });
        });
    }

    function captureUserFetch() {
        if (window.__fastcatUserFetchCaptured) return;
        window.__fastcatUserFetchCaptured = true;
        var originalFetch = window.fetch;
        window.fetch = function (input, options) {
            var responsePromise = originalFetch.apply(this, arguments);
            try {
                var raw = typeof input === "string" ? input : input.url;
                var url = new URL(raw, location.origin);
                if (/\/user\/fetch$/.test(url.pathname)) {
                    responsePromise.then(function (response) {
                        response.clone().json().then(function (payload) {
                            if (response.ok && Array.isArray(payload.data)) {
                                lastUserFetch = {
                                    sourceQuery: url.search.replace(/^\?/, ""),
                                    total: Number(payload.total || 0),
                                };
                                window.requestAnimationFrame(mountBatchGroup);
                            }
                        }).catch(function () {});
                    }).catch(function () {});
                }
            } catch (e) {}
            return responsePromise;
        };
    }

    function recoverUserFetch() {
        if (!window.performance) return;
        var entries = performance.getEntriesByType("resource").filter(function (entry) {
            try { return /\/user\/fetch$/.test(new URL(entry.name).pathname); } catch (e) { return false; }
        });
        if (!entries.length) return;
        var url = new URL(entries[entries.length - 1].name);
        var sourceQuery = url.search.replace(/^\?/, "");
        if (lastUserFetch && lastUserFetch.sourceQuery === sourceQuery) return;
        lastUserFetch = { sourceQuery: sourceQuery, total: null };
    }

    function isUserPage() {
        return /\/user\/?$/.test(location.pathname);
    }

    function mountBatchGroup() {
        var old = document.querySelector(".user-batch-group-entry");
        if (!isUserPage() || !lastUserFetch) {
            if (old) old.remove();
            return;
        }
        var actionHost = document.querySelector(".v2board-table-action") || document.body;
        if (old) {
            old.querySelector("span").textContent = lastUserFetch.total == null ? "批量加入权限组" : "批量加入权限组（" + lastUserFetch.total + "人）";
            if (old.parentNode !== actionHost) actionHost.appendChild(old);
            return;
        }
        var button = document.createElement("button");
        button.type = "button";
        button.className = "user-batch-group-entry";
        button.innerHTML = "<span>" + (lastUserFetch.total == null ? "批量加入权限组" : "批量加入权限组（" + lastUserFetch.total + "人）") + "</span>";
        button.title = "将当前全部筛选结果修改到指定权限组";
        button.onclick = openBatchGroupModal;
        actionHost.appendChild(button);
    }

    function closeBatchGroupModal() {
        var modal = document.querySelector(".user-batch-group-modal");
        if (modal) modal.remove();
    }

    function openBatchGroupModal() {
        if (!lastUserFetch || lastUserFetch.total === 0) {
            alert("当前筛选条件没有匹配用户");
            return;
        }
        var selection = { sourceQuery: lastUserFetch.sourceQuery, total: lastUserFetch.total };
        api("/server/group/fetch", { method: "GET", headers: { "Content-Type": "application/json" } })
            .then(function (groups) {
                var modal = document.createElement("div");
                modal.className = "user-batch-group-modal";
                modal.style.setProperty("--batch-theme-color", themeColor());
                modal.innerHTML = '<div class="user-batch-group-box"><div class="user-batch-group-head"><div><b>批量修改权限组</b><small>只修改用户权限组，不修改套餐、流量和到期时间</small></div><button type="button" data-batch-close>×</button></div><div class="user-batch-group-body"><div class="user-batch-warning">操作范围：当前全部筛选结果' + (selection.total == null ? '' : '，共 <b>' + selection.total + '</b> 名用户') + '。请确认筛选条件无误。</div><label>目标权限组<select data-batch-group><option value="">请选择权限组</option>' + groups.map(function (group) { return '<option value="' + group.id + '">' + escapeHtml(group.name) + '（当前 ' + Number(group.user_count || 0) + ' 人 / ' + Number(group.server_count || 0) + ' 节点）</option>'; }).join("") + '</select></label><div data-batch-error class="user-batch-error" hidden></div></div><div class="user-batch-group-actions"><button type="button" data-batch-close>取消</button><button type="button" data-batch-submit disabled>确定</button></div></div>';
                document.body.appendChild(modal);
                bindBatchGroupModal(modal, selection);
            })
            .catch(function (error) { alert(error.message); });
    }

    function escapeHtml(value) {
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function themeColor() {
        var name = ((window.settings || {}).theme || {}).color || "default";
        return { default: "#0665d0", darkblue: "#3b5998", black: "#343a40", green: "#319795" }[name] || "#0665d0";
    }

    function bindBatchGroupModal(modal, selection) {
        var groupSelect = modal.querySelector("[data-batch-group]");
        var submit = modal.querySelector("[data-batch-submit]");
        var errorBox = modal.querySelector("[data-batch-error]");
        modal.querySelectorAll("[data-batch-close]").forEach(function (button) { button.onclick = closeBatchGroupModal; });
        modal.onclick = function (event) { if (event.target === modal) closeBatchGroupModal(); };
        groupSelect.onchange = function () {
            showBatchError(errorBox, "");
            submit.disabled = !groupSelect.value;
        };
        submit.onclick = function () {
            if (!groupSelect.value) return;
            submit.disabled = true;
            submit.textContent = "正在修改……";
            showBatchError(errorBox, "");
            api("/user/batchGroup", {
                method: "POST",
                body: JSON.stringify({ group_id: Number(groupSelect.value), source_query: selection.sourceQuery }),
            }).then(function (data) {
                alert("修改完成：匹配 " + data.matched + " 人，实际更新 " + data.affected + " 人。");
                closeBatchGroupModal();
                location.reload();
            }).catch(function (error) {
                submit.disabled = false;
                submit.textContent = "确定";
                showBatchError(errorBox, error.message);
            });
        };
    }

    function showBatchError(box, message) {
        box.hidden = !message;
        box.textContent = message || "";
    }

    function serializeFilter(filters) {
        var parts = [];
        function append(prefix, value) {
            if (value == null) {
                parts.push(prefix + "=");
            } else if (typeof value === "object") {
                Object.keys(value).forEach(function (key) {
                    append(prefix + "[" + key + "]", value[key]);
                });
            } else {
                parts.push(prefix + "=" + encodeURIComponent(value));
            }
        }
        append("filter", filters || []);
        return parts.join("&");
    }

    window.FastCatBatchGroup = {
        open: function (filters, total) {
            if (!Array.isArray(filters) || !filters.length) {
                alert("请先使用过滤器筛选用户");
                return;
            }
            lastUserFetch = {
                sourceQuery: serializeFilter(filters),
                total: Number(total || 0),
            };
            openBatchGroupModal();
        },
    };

    var entryPoolState = null;
    var entryPoolRefresh = null;

    function refreshNodeManagement() {
        if (typeof entryPoolRefresh === "function") entryPoolRefresh();
    }

    function closeEntryPoolModal() {
        var modal = document.querySelector(".node-entry-pool-modal");
        if (modal) modal.remove();
        entryPoolState = null;
        entryPoolRefresh = null;
    }

    function entryHealthText(status) {
        return {
            healthy: "双向正常",
            domestic_blocked: "国内方向异常",
            overseas_blocked: "海外方向异常",
            unreachable: "全部不可达",
            insufficient_probes: "探测点不足",
            waiting: "等待探测",
        }[status] || status || "等待探测";
    }

    function loadEntryPool(type, id) {
        return api("/security/entry-pools?server_type=" + encodeURIComponent(type) + "&server_id=" + encodeURIComponent(id), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        }).then(function (page) {
            if (!page || !page.data || !page.data[0]) throw new Error("节点不存在或已停用");
            return page.data[0];
        });
    }

    function entryForm(node, entry) {
        entry = entry || {};
        return '<form class="node-entry-form" data-entry-id="' + (entry.id || "") + '">' +
            '<div class="node-entry-grid"><label>入口名称<input name="name" required value="' + escapeHtml(entry.name || "") + '" placeholder="例如：备用入口 1"></label>' +
            '<label>优先级<input name="priority" type="number" min="1" max="10000" required value="' + escapeHtml(entry.priority || 100) + '"></label>' +
            '<label>地址 / 域名<input name="host" required value="' + escapeHtml(entry.host || "") + '"></label>' +
            '<label>端口<input name="port" type="number" min="1" max="65535" required value="' + escapeHtml(entry.port || node.original_address.split(":").pop() || "") + '"></label></div>' +
            '<div class="node-entry-checks"><label><input name="is_primary" type="checkbox"' + (entry.is_primary ? " checked" : "") + '> 设为主入口</label>' +
            '<label><input name="enabled" type="checkbox"' + (entry.id && !entry.enabled ? "" : " checked") + '> 启用并参与下发和探测</label></div>' +
            '<div class="node-entry-form-actions">' + (entry.id ? '<button type="button" data-entry-cancel>取消编辑</button>' : "") + '<button type="submit" class="primary">' + (entry.id ? "保存入口" : "添加入口") + '</button></div></form>';
    }

    function clientPolicyForm(node, policy) {
        policy = policy || {};
        var families = ["*", "FastCat", "FlClash", "Digilink", "Clash Verge", "Clash Meta / Mihomo", "Shadowrocket", "Stash", "Surge", "v2rayN", "v2rayNG", "sing-box", "浏览器", "其他 / 未识别", "未提供"];
        var platforms = ["*", "Windows", "macOS", "Android", "iOS", "Linux", "未知"];
        function options(values, current, allLabel) {
            return values.map(function (value) { return '<option value="' + escapeHtml(value) + '"' + (value === current ? " selected" : "") + '>' + (value === "*" ? allLabel : escapeHtml(value)) + '</option>'; }).join("");
        }
        var defaultVisibility = node.client_visibility_mode === "denylist" ? "hide" : "show";
        var deliveryModes = ["primary_only", "manual_backup", "auto_fallback"];
        var defaultDeliveryMode = deliveryModes.indexOf(node.delivery_mode) !== -1 ? node.delivery_mode : "primary_only";
        var selectedDeliveryMode = policy.delivery_mode || defaultDeliveryMode;
        return '<form class="node-entry-client-policy" data-policy-id="' + (policy.id || "") + '"><div class="node-entry-grid">' +
            '<label>客户端<select name="client_family">' + options(families, policy.client_family || "*", "全部客户端") + '</select></label>' +
            '<label>平台<select name="client_platform">' + options(platforms, policy.client_platform || "*", "全部平台") + '</select></label>' +
            '<label>最低版本<input name="min_version" value="' + escapeHtml(policy.min_version || "") + '" placeholder="留空不限"></label>' +
            '<label>最高版本<input name="max_version" value="' + escapeHtml(policy.max_version || "") + '" placeholder="留空不限"></label>' +
            '<label>下发模式<select name="delivery_mode"><option value="primary_only"' + (selectedDeliveryMode === "primary_only" ? " selected" : "") + '>仅主入口</option><option value="manual_backup"' + (selectedDeliveryMode === "manual_backup" ? " selected" : "") + '>主入口＋备用入口</option><option value="auto_fallback"' + (selectedDeliveryMode === "auto_fallback" ? " selected" : "") + '>自动故障转移</option></select></label>' +
            '<label>节点动作<select name="visibility"><option value="show"' + ((policy.visibility || defaultVisibility) === "show" ? " selected" : "") + '>显示节点</option><option value="hide"' + ((policy.visibility || defaultVisibility) === "hide" ? " selected" : "") + '>隐藏节点</option></select></label>' +
            '<label>规则优先级<input name="priority" type="number" min="1" max="10000" required value="' + Number(policy.priority || 100) + '"></label>' +
            '<label>检测间隔（秒）<input name="check_interval" type="number" min="30" max="86400" required value="' + Number(policy.check_interval || node.check_interval || 60) + '"></label>' +
            '<label class="wide">检测 URL<input name="check_url" type="url" required value="' + escapeHtml(policy.check_url || node.check_url || "") + '"></label></div>' +
            '<div class="node-entry-checks"><label><input name="enabled" type="checkbox"' + (policy.id && !policy.enabled ? "" : " checked") + '> 启用规则</label></div>' +
            '<div class="node-entry-form-actions">' + (policy.id ? '<button type="button" data-policy-cancel>取消编辑</button>' : "") + '<button type="submit" class="primary">' + (policy.id ? "保存客户端规则" : "添加客户端规则") + '</button></div></form>';
    }

    function renderEntryPoolModal(node, editingId, editingPolicyId) {
        var old = document.querySelector(".node-entry-pool-modal");
        var oldBox = old && old.querySelector(".node-entry-pool-box");
        var scrollTop = oldBox ? oldBox.scrollTop : 0;
        if (old) old.remove();
        var entries = node.entries || [];
        var policies = node.client_policies || [];
        var editing = entries.find(function (item) { return Number(item.id) === Number(editingId); });
        var editingPolicy = policies.find(function (item) { return Number(item.id) === Number(editingPolicyId); });
        var modal = document.createElement("div");
        modal.className = "node-entry-pool-modal";
        modal.style.setProperty("--entry-theme-color", themeColor());
        modal.innerHTML = '<div class="node-entry-pool-box"><div class="node-entry-pool-head"><div><b>管理节点入口 · ' + escapeHtml(node.server_name) + '</b><small>节点 ID ' + node.server_id + ' · ' + escapeHtml(node.server_type) + ' · 原地址 ' + escapeHtml(node.original_address) + '</small></div><button type="button" data-entry-close>×</button></div>' +
            '<div class="node-entry-pool-body"><section><h3>下发设置</h3><form class="node-entry-setting"><div class="node-entry-grid"><label>下发模式<select name="delivery_mode"><option value="primary_only"' + (node.delivery_mode === "primary_only" ? " selected" : "") + '>仅主入口</option><option value="manual_backup"' + (node.delivery_mode === "manual_backup" ? " selected" : "") + '>主入口＋备用入口</option><option value="auto_fallback"' + (node.delivery_mode === "auto_fallback" ? " selected" : "") + '>自动故障转移</option></select></label><label>节点可见范围<select name="client_visibility_mode"><option value="all"' + (node.client_visibility_mode === "all" ? " selected" : "") + '>所有客户端可见</option><option value="allowlist"' + (node.client_visibility_mode === "allowlist" ? " selected" : "") + '>仅匹配规则的客户端可见</option><option value="denylist"' + (node.client_visibility_mode === "denylist" ? " selected" : "") + '>匹配隐藏规则的客户端不可见</option></select></label><label>客户端检测间隔（秒）<input name="check_interval" type="number" min="30" max="86400" required value="' + Number(node.check_interval || 60) + '"></label><label class="wide">客户端检测 URL<input name="check_url" type="url" required value="' + escapeHtml(node.check_url || "") + '"></label></div><div class="node-entry-checks"><label><input name="sync_primary_host" type="checkbox"' + (node.sync_primary_host ? " checked" : "") + '> 主入口地址与节点管理双向同步</label><label><input name="sync_primary_port" type="checkbox"' + (node.sync_primary_port ? " checked" : "") + '> 主入口端口与节点管理双向同步</label></div><p class="muted">开启时以节点管理当前值初始化；之后修改任意一处，另一处会同步更新。</p><div class="node-entry-form-actions"><button type="submit" class="primary">保存下发设置</button></div></form></section>' +
            '<section><h3>入口列表</h3><div class="node-entry-table-wrap"><table><thead><tr><th>名称</th><th>地址</th><th>优先级</th><th>角色</th><th>探测状态</th><th>操作</th></tr></thead><tbody>' + (entries.length ? entries.map(function (entry) { return '<tr><td>' + escapeHtml(entry.name) + '</td><td>' + escapeHtml(entry.host) + ':' + entry.port + '</td><td>' + entry.priority + '</td><td>' + (entry.is_primary ? "主入口" : "备用") + (entry.enabled ? "" : " · 已停用") + '</td><td>' + escapeHtml(entryHealthText(entry.health_status)) + '</td><td><button type="button" data-entry-edit="' + entry.id + '">编辑</button> <button type="button" class="danger" data-entry-delete="' + entry.id + '">删除</button></td></tr>'; }).join("") : '<tr><td colspan="6" class="empty">尚未启用入口池；首次保存设置时会自动导入节点原地址作为主入口</td></tr>') + '</tbody></table></div></section>' +
            '<section><h3>' + (editing ? "编辑入口" : "添加入口") + '</h3>' + entryForm(node, editing) + '</section>' +
            '<section><h3>客户端 UA 下发规则</h3><p class="muted">命中规则时决定节点显示/隐藏，并覆盖默认下发设置；数字越小优先级越高。UA 可伪造，规则不会扩大用户的节点权限。</p><div class="node-entry-table-wrap"><table><thead><tr><th>客户端</th><th>平台 / 版本</th><th>节点动作</th><th>下发模式</th><th>优先级</th><th>状态</th><th>操作</th></tr></thead><tbody>' + (policies.length ? policies.map(function (policy) { var versionRange = (policy.min_version ? "≥ " + policy.min_version : "") + (policy.min_version && policy.max_version ? "，" : "") + (policy.max_version ? "≤ " + policy.max_version : ""); return '<tr><td>' + escapeHtml(policy.client_family === "*" ? "全部客户端" : policy.client_family) + '</td><td>' + escapeHtml(!policy.client_platform || policy.client_platform === "*" ? "全部平台" : policy.client_platform) + '<br><span class="muted">' + escapeHtml(versionRange || "全部版本") + '</span></td><td>' + ((policy.visibility || "show") === "hide" ? "隐藏" : "显示") + '</td><td>' + escapeHtml({ primary_only: "仅主入口", manual_backup: "主入口＋备用入口", auto_fallback: "自动故障转移" }[policy.delivery_mode] || policy.delivery_mode) + '</td><td>' + policy.priority + '</td><td>' + (policy.enabled ? "启用" : "停用") + '</td><td><button type="button" data-policy-edit="' + policy.id + '">编辑</button> <button type="button" class="danger" data-policy-delete="' + policy.id + '">删除</button></td></tr>'; }).join("") : '<tr><td colspan="7" class="empty">尚未添加客户端规则，节点按上方可见范围处理</td></tr>') + '</tbody></table></div><h3>' + (editingPolicy ? "编辑客户端规则" : "添加客户端规则") + '</h3>' + clientPolicyForm(node, editingPolicy) + '</section>' +
            '<div class="node-entry-message" hidden></div></div></div>';
        document.body.appendChild(modal);
        entryPoolState = { type: node.server_type, id: node.server_id };
        var box = modal.querySelector(".node-entry-pool-box");
        if (box && scrollTop) {
            box.scrollTop = scrollTop;
            requestAnimationFrame(function () { box.scrollTop = scrollTop; });
        }
        bindEntryPoolModal(modal, node);
    }

    function entryPayload(form, node) {
        return {
            id: form.dataset.entryId ? Number(form.dataset.entryId) : null,
            server_type: node.server_type,
            server_id: Number(node.server_id),
            name: form.elements.name.value.trim(),
            host: form.elements.host.value.trim(),
            port: Number(form.elements.port.value),
            priority: Number(form.elements.priority.value),
            is_primary: form.elements.is_primary.checked,
            enabled: form.elements.enabled.checked,
        };
    }

    function reloadEntryPool(editingId, editingPolicyId) {
        return loadEntryPool(entryPoolState.type, entryPoolState.id).then(function (node) {
            renderEntryPoolModal(node, editingId, editingPolicyId);
        });
    }

    function entryError(modal, error) {
        var box = modal.querySelector(".node-entry-message");
        box.hidden = false;
        box.textContent = error.message || "请求失败";
    }

    function bindEntryPoolModal(modal, node) {
        modal.querySelector("[data-entry-close]").onclick = closeEntryPoolModal;
        modal.onclick = function (event) { if (event.target === modal) closeEntryPoolModal(); };
        modal.querySelector(".node-entry-setting").onsubmit = function (event) {
            event.preventDefault();
            var form = event.currentTarget, submit = form.querySelector('[type="submit"]');
            submit.disabled = true; submit.textContent = "正在保存……";
            api("/security/entry-setting/save", { method: "POST", body: JSON.stringify({ server_type: node.server_type, server_id: Number(node.server_id), delivery_mode: form.elements.delivery_mode.value, client_visibility_mode: form.elements.client_visibility_mode.value, sync_primary_host: form.elements.sync_primary_host.checked, sync_primary_port: form.elements.sync_primary_port.checked, check_interval: Number(form.elements.check_interval.value), check_url: form.elements.check_url.value.trim() }) })
                .then(function () { refreshNodeManagement(); return reloadEntryPool(); }).catch(function (error) { submit.disabled = false; submit.textContent = "保存下发设置"; entryError(modal, error); });
        };
        modal.querySelector(".node-entry-client-policy").onsubmit = function (event) {
            event.preventDefault();
            var form = event.currentTarget, submit = form.querySelector('[type="submit"]');
            submit.disabled = true; submit.textContent = "正在保存……";
            api("/security/entry-client-policy/save", { method: "POST", body: JSON.stringify({
                id: form.dataset.policyId ? Number(form.dataset.policyId) : null,
                server_type: node.server_type, server_id: Number(node.server_id),
                client_family: form.elements.client_family.value, client_platform: form.elements.client_platform.value,
                min_version: form.elements.min_version.value.trim(), max_version: form.elements.max_version.value.trim(),
                delivery_mode: form.elements.delivery_mode.value, visibility: form.elements.visibility.value,
                priority: Number(form.elements.priority.value),
                check_interval: Number(form.elements.check_interval.value), check_url: form.elements.check_url.value.trim(),
                enabled: form.elements.enabled.checked,
            }) }).then(function () { return reloadEntryPool(); }).catch(function (error) { submit.disabled = false; submit.textContent = form.dataset.policyId ? "保存客户端规则" : "添加客户端规则"; entryError(modal, error); });
        };
        var policyCancel = modal.querySelector("[data-policy-cancel]");
        if (policyCancel) policyCancel.onclick = function () { renderEntryPoolModal(node); };
        modal.querySelectorAll("[data-policy-edit]").forEach(function (button) { button.onclick = function () { renderEntryPoolModal(node, null, button.dataset.policyEdit); }; });
        modal.querySelectorAll("[data-policy-delete]").forEach(function (button) { button.onclick = function () {
            if (!confirm("确认删除这条客户端下发规则？")) return;
            button.disabled = true;
            api("/security/entry-client-policy/delete", { method: "POST", body: JSON.stringify({ id: Number(button.dataset.policyDelete) }) })
                .then(function () { return reloadEntryPool(); }).catch(function (error) { button.disabled = false; entryError(modal, error); });
        }; });
        modal.querySelector(".node-entry-form").onsubmit = function (event) {
            event.preventDefault();
            var form = event.currentTarget, submit = form.querySelector('[type="submit"]');
            submit.disabled = true; submit.textContent = "正在保存……";
            api("/security/entry/save", { method: "POST", body: JSON.stringify(entryPayload(form, node)) })
                .then(function () { refreshNodeManagement(); return reloadEntryPool(); }).catch(function (error) { submit.disabled = false; submit.textContent = form.dataset.entryId ? "保存入口" : "添加入口"; entryError(modal, error); });
        };
        var cancel = modal.querySelector("[data-entry-cancel]");
        if (cancel) cancel.onclick = function () { renderEntryPoolModal(node); };
        modal.querySelectorAll("[data-entry-edit]").forEach(function (button) { button.onclick = function () { renderEntryPoolModal(node, button.dataset.entryEdit); }; });
        modal.querySelectorAll("[data-entry-delete]").forEach(function (button) { button.onclick = function () {
            if (!confirm("确认删除这个入口？已下载到客户端的旧配置不会被远程删除。")) return;
            button.disabled = true;
            api("/security/entry/delete", { method: "POST", body: JSON.stringify({ id: Number(button.dataset.entryDelete) }) })
                .then(function () { return reloadEntryPool(); }).catch(function (error) { button.disabled = false; entryError(modal, error); });
        }; });
    }

    window.FastCatEntryPool = {
        open: function (type, id, name, refresh) {
            entryPoolRefresh = refresh;
            loadEntryPool(type, id).then(function (node) { renderEntryPoolModal(node); }).catch(function (error) { alert(error.message); });
        },
    };

    function headerActions() {
        var header = document.querySelector("#page-header .content-header");
        if (!header) return null;
        return (
            header.querySelector(".content-header-section:last-child") ||
            header.lastElementChild ||
            header
        );
    }

    function mount() {
        if (mounting || !window.settings || !window.settings.secure_path) return;
        var host = headerActions();
        if (!host) return;
        var link = document.querySelector(".node-security-entry");
        if (!link) {
            link = document.createElement("a");
            link.className = "node-security-entry";
            link.textContent = "节点安全";
            link.href =
                "/" + window.settings.secure_path + "/security/dashboard";
            link.title = "打开节点泄露追踪与风控中心";
            link.setAttribute("aria-label", "打开节点安全中心");
        }
        if (link.parentNode !== host) {
            mounting = true;
            host.appendChild(link);
            mounting = false;
        }
    }

    function start() {
        mount();
        new MutationObserver(function () {
            window.requestAnimationFrame(mount);
        }).observe(document.getElementById("root") || document.body, {
            childList: true,
            subtree: true,
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
