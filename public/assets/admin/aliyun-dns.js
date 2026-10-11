(function () {
    "use strict";

    var root = null;
    var state = { accounts: [], instances: [], topology: null };
    var selectedAccountId = null;
    var selectedConfigId = null;
    var selectedNode = null;
    var activeTab = "topology";

    function esc(value) {
        var node = document.createElement("div");
        node.textContent = value == null ? "" : String(value);
        return node.innerHTML;
    }

    function api(path, options) {
        options = options || {};
        var headers = { Accept: "application/json", "Content-Type": "application/json" };
        var authorization = localStorage.getItem("authorization");
        if (authorization) headers.authorization = authorization;
        return fetch("/api/v1/" + window.settings.secure_path + "/aliyun-dns" + path, Object.assign({
            credentials: "include",
            headers: headers,
        }, options)).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) {
                    var errors = payload.errors || {};
                    var first = errors[Object.keys(errors)[0]];
                    throw new Error(Array.isArray(first) ? first[0] : (first || payload.message || "请求失败"));
                }
                return payload;
            });
        });
    }

    function post(path, body) {
        return api(path, { method: "POST", body: JSON.stringify(body || {}) });
    }

    function formField(form, name) {
        return form.elements.namedItem(name);
    }

    function isRoute() {
        return location.hash === "#/aliyun-dns";
    }

    function routeUrl() {
        var securePath = String((window.settings && window.settings.secure_path) || "").replace(/^\/+|\/+$/g, "");
        return "/" + securePath + "/#/aliyun-dns";
    }

    function closeOthers() {
        document.querySelectorAll(".referral-admin,.coupon-center-admin,.marketing-admin,.security-admin,.client-config-admin").forEach(function (node) {
            node.hidden = true;
        });
    }

    function open() {
        closeOthers();
        if (!root || !root.isConnected) {
            root = document.createElement("section");
            root.className = "aliyun-dns-admin";
            (document.getElementById("page-container") || document.body).appendChild(root);
        }
        root.hidden = false;
        setMenuActive(true);
        renderShell();
        loadOverview();
    }

    function close() {
        if (root) root.hidden = true;
        setMenuActive(false);
    }

    function setMenuActive(active) {
        document.querySelectorAll(".aliyun-dns-menu-link").forEach(function (link) {
            link.classList.toggle("active", active);
        });
    }

    function renderShell() {
        root.innerHTML = '<div class="dns-page">' +
            '<header class="dns-heading"><div><h2>云解析 DNS</h2><p>管理阿里云全局流量管理 GTM 3.0 的接入域名、地址池与节点状态</p></div>' +
            '<button type="button" class="btn btn-light" data-refresh><i class="fa fa-sync-alt" aria-hidden="true"></i> 刷新</button></header>' +
            '<nav class="dns-tabs" aria-label="云解析 DNS 功能">' +
            '<button type="button" data-tab="topology" class="' + (activeTab === "topology" ? "active" : "") + '">流量拓扑</button>' +
            '<button type="button" data-tab="accounts" class="' + (activeTab === "accounts" ? "active" : "") + '">接入账号</button></nav>' +
            '<main data-content><div class="dns-loading">加载中…</div></main></div>';
        root.querySelector("[data-refresh]").onclick = function () {
            if (activeTab === "accounts") loadOverview();
            else loadInstances(true);
        };
        root.querySelectorAll("[data-tab]").forEach(function (button) {
            button.onclick = function () {
                activeTab = button.dataset.tab;
                root.querySelectorAll("[data-tab]").forEach(function (item) {
                    item.classList.toggle("active", item.dataset.tab === activeTab);
                });
                renderActiveTab();
            };
        });
    }

    function content(html) {
        var target = root && root.querySelector("[data-content]");
        if (target) target.innerHTML = html;
    }

    function loadOverview() {
        content('<div class="dns-loading">加载中…</div>');
        api("/overview").then(function (payload) {
            state.accounts = payload.data.accounts || [];
            state.endpoint = payload.data.endpoint || "";
            if (!selectedAccountId || !state.accounts.some(function (row) { return Number(row.id) === Number(selectedAccountId); })) {
                var preferred = state.accounts.find(function (row) { return row.is_default && row.enabled; }) || state.accounts.find(function (row) { return row.enabled; }) || state.accounts[0];
                selectedAccountId = preferred ? preferred.id : null;
            }
            if (activeTab === "accounts") renderAccounts();
            else loadInstances();
        }).catch(showError);
    }

    function selectedAccount() {
        return state.accounts.find(function (row) { return Number(row.id) === Number(selectedAccountId); }) || null;
    }

    function loadInstances(force) {
        if (!state.accounts.length) {
            renderEmptyAccount();
            return;
        }
        var account = selectedAccount();
        if (!account || !account.enabled) {
            content('<div class="dns-empty"><div class="dns-empty-icon"><i class="fa fa-user-lock"></i></div><h3>当前账号未启用</h3><p>请在“接入账号”中启用账号后再加载拓扑。</p><button class="btn btn-primary" data-go-accounts>管理账号</button></div>');
            root.querySelector("[data-go-accounts]").onclick = goAccounts;
            return;
        }
        content('<div class="dns-loading">正在读取阿里云 GTM 配置…</div>');
        api("/instances?account_id=" + encodeURIComponent(selectedAccountId) + (force ? "&_=" + Date.now() : "")).then(function (payload) {
            state.instances = payload.data.items || [];
            if (!state.instances.some(function (row) { return row.config_id === selectedConfigId; })) {
                selectedConfigId = state.instances.length ? state.instances[0].config_id : null;
            }
            state.topology = null;
            selectedNode = null;
            renderTopologyLayout();
            if (selectedConfigId) loadTopology(selectedConfigId);
        }).catch(showError);
    }

    function goAccounts() {
        activeTab = "accounts";
        root.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item.dataset.tab === activeTab); });
        renderAccounts();
    }

    function renderActiveTab() {
        if (activeTab === "accounts") renderAccounts();
        else if (!state.instances.length && selectedAccountId) loadInstances();
        else {
            renderTopologyLayout();
            if (state.topology && state.topology.config_id === selectedConfigId) {
                renderTree();
                renderInspector();
            } else if (selectedConfigId) {
                loadTopology(selectedConfigId);
            }
        }
    }

    function renderEmptyAccount() {
        content('<div class="dns-empty"><div class="dns-empty-icon"><i class="fa fa-cloud"></i></div><h3>先连接阿里云账号</h3>' +
            '<p>AccessKey 只会加密保存在服务端，不会下发到浏览器。</p><button type="button" class="btn btn-primary" data-add-account>添加账号</button></div>');
        root.querySelector("[data-add-account]").onclick = function () { goAccounts(); showAccountDialog(); };
    }

    function renderAccounts() {
        var rows = state.accounts.map(function (row) {
            return '<tr><td><div class="dns-account-name"><strong>' + esc(row.name) + '</strong>' + (row.is_default ? '<span class="badge badge-primary">默认</span>' : '') + '</div><small>' + esc(row.access_key_masked || "-") + '</small></td>' +
                '<td>' + statusPill(row.enabled ? "enable" : "disable", row.enabled ? "已启用" : "已停用") + '</td>' +
                '<td><span>' + (row.last_connected_at ? dateTime(row.last_connected_at) : "尚未测试") + '</span>' + (row.last_error ? '<small class="text-danger">' + esc(row.last_error) + '</small>' : '') + '</td>' +
                '<td><div class="dns-row-actions"><button class="btn btn-sm btn-light" data-test="' + row.id + '">测试</button><button class="btn btn-sm btn-light" data-edit="' + row.id + '">编辑</button><button class="btn btn-sm btn-outline-danger" data-drop="' + row.id + '">删除</button></div></td></tr>';
        }).join("");
        content('<section class="dns-panel"><div class="dns-section-head"><div><h3>阿里云接入账号</h3><p>建议使用仅授予云解析 DNS GTM 权限的 RAM 用户 AccessKey。</p></div><button class="btn btn-primary" data-add-account><i class="fa fa-plus"></i> 添加账号</button></div>' +
            '<div class="dns-endpoint"><span>API Endpoint</span><code>' + esc(state.endpoint || "-") + '</code></div>' +
            (rows ? '<div class="table-responsive"><table class="table table-hover"><thead><tr><th>账号</th><th>状态</th><th>最近连接</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="dns-table-empty">尚未添加账号</div>') + '</section>');
        root.querySelector("[data-add-account]").onclick = function () { showAccountDialog(); };
        root.querySelectorAll("[data-edit]").forEach(function (button) {
            button.onclick = function () { showAccountDialog(state.accounts.find(function (row) { return Number(row.id) === Number(button.dataset.edit); })); };
        });
        root.querySelectorAll("[data-test]").forEach(function (button) {
            button.onclick = function () { testAccount(button, Number(button.dataset.test)); };
        });
        root.querySelectorAll("[data-drop]").forEach(function (button) {
            button.onclick = function () { dropAccount(Number(button.dataset.drop)); };
        });
    }

    function showAccountDialog(account) {
        account = account || {};
        var modal = document.createElement("div");
        modal.className = "dns-modal";
        modal.innerHTML = '<form class="dns-dialog" aria-label="' + (account.id ? "编辑" : "添加") + '阿里云账号"><header><div><h3>' + (account.id ? "编辑接入账号" : "添加接入账号") + '</h3><p>凭证保存后仅显示掩码</p></div><button type="button" data-close aria-label="关闭">×</button></header><div class="dns-dialog-body">' +
            '<label><span>账号名称</span><input class="form-control" name="name" required maxlength="100" value="' + esc(account.name || "") + '" placeholder="例如：生产环境"></label>' +
            '<div class="dns-form-grid"><label><span>AccessKey ID</span><input class="form-control" name="access_key_id" autocomplete="off" placeholder="' + (account.id ? "留空保持不变" : "请输入 AccessKey ID") + '"></label>' +
            '<label><span>AccessKey Secret</span><input class="form-control" type="password" name="access_key_secret" autocomplete="new-password" placeholder="' + (account.id ? "留空保持不变" : "请输入 AccessKey Secret") + '"></label></div>' +
            '<label><span>STS SecurityToken（可选）</span><textarea class="form-control" name="security_token" rows="2" placeholder="使用临时凭证时填写；留空保持不变"></textarea></label>' +
            '<div class="dns-checks"><label><input type="checkbox" name="enabled" ' + (account.id && !account.enabled ? "" : "checked") + '> 启用账号</label><label><input type="checkbox" name="is_default" ' + (account.is_default ? "checked" : "") + '> 设为默认账号</label>' + (account.has_security_token ? '<label><input type="checkbox" name="clear_security_token"> 清除已保存的 SecurityToken</label>' : '') + '</div>' +
            '<div class="alert alert-info mb-0">请勿使用主账号 AccessKey。推荐创建 RAM 用户并仅授予所需的 AliDNS GTM 权限。</div></div>' +
            '<footer><button type="button" class="btn btn-light" data-close>取消</button><button type="submit" class="btn btn-primary">保存</button></footer></form>';
        document.body.appendChild(modal);
        modal.querySelectorAll("[data-close]").forEach(function (button) { button.onclick = function () { modal.remove(); }; });
        modal.onclick = function (event) { if (event.target === modal) modal.remove(); };
        modal.onkeydown = function (event) { if (event.key === "Escape") modal.remove(); };
        modal.querySelector("form").onsubmit = function (event) {
            event.preventDefault();
            var form = event.currentTarget;
            var submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            post("/account/save", {
                id: account.id || null,
                name: formField(form, "name").value.trim(),
                access_key_id: formField(form, "access_key_id").value.trim(),
                access_key_secret: formField(form, "access_key_secret").value,
                security_token: formField(form, "security_token").value.trim(),
                clear_security_token: formField(form, "clear_security_token") ? formField(form, "clear_security_token").checked : false,
                enabled: formField(form, "enabled").checked,
                is_default: formField(form, "is_default").checked,
            }).then(function (payload) {
                selectedAccountId = payload.data.id;
                modal.remove();
                toast("账号已保存");
                loadOverview();
            }).catch(function (error) { submit.disabled = false; alert(error.message); });
        };
        setTimeout(function () { modal.querySelector('[name="name"]').focus(); }, 0);
    }

    function testAccount(button, id) {
        var original = button.textContent;
        button.disabled = true;
        button.textContent = "测试中…";
        post("/account/test", { id: id }).then(function (payload) {
            toast("连接成功，读取到 " + Number(payload.data.total || 0) + " 个接入配置");
            loadOverview();
        }).catch(function (error) {
            button.disabled = false;
            button.textContent = original;
            alert("连接失败：" + error.message);
        });
    }

    function dropAccount(id) {
        if (!confirm("确定删除这个阿里云接入账号吗？已加密保存的凭证也会一并删除。")) return;
        post("/account/drop", { id: id }).then(function () {
            if (Number(selectedAccountId) === Number(id)) selectedAccountId = null;
            toast("账号已删除");
            loadOverview();
        }).catch(function (error) { alert(error.message); });
    }

    function renderTopologyLayout() {
        if (!state.accounts.length) return renderEmptyAccount();
        var accountOptions = state.accounts.map(function (row) {
            return '<option value="' + row.id + '" ' + (Number(row.id) === Number(selectedAccountId) ? "selected" : "") + ' ' + (!row.enabled ? "disabled" : "") + '>' + esc(row.name) + (row.is_default ? "（默认）" : "") + '</option>';
        }).join("");
        var instances = state.instances.map(function (row) {
            return '<button type="button" class="dns-instance-item ' + (row.config_id === selectedConfigId ? "active" : "") + '" data-config="' + esc(row.config_id) + '">' +
                '<span class="dns-instance-top"><strong>' + esc(row.domain || "未命名接入域名") + '</strong>' + statusDot(row) + '</span>' +
                '<span>' + esc(row.record_type || "-") + ' · TTL ' + esc(row.ttl == null ? "-" : row.ttl + "s") + ' · ' + esc(strategyName(row.strategy)) + '</span></button>';
        }).join("");
        content('<div class="dns-toolbar"><label><span>接入账号</span><select class="form-control" data-account>' + accountOptions + '</select></label><div class="dns-toolbar-summary"><strong>' + state.instances.length + '</strong><span>个接入配置</span></div><button class="btn btn-light" data-account-settings><i class="fa fa-cog"></i> 账号设置</button></div>' +
            (state.instances.length ? '<div class="dns-workspace"><aside class="dns-instance-list" aria-label="接入域名列表">' + instances + '</aside><section class="dns-canvas-wrap"><div class="dns-canvas-head"><div><h3 data-topology-title>选择接入域名</h3><p data-topology-summary>查看完整调度链路</p></div><div class="dns-legend"><span><i class="ok"></i>正常</span><span><i class="warn"></i>警告</span><span><i class="bad"></i>异常</span><span><i class="off"></i>停用</span></div></div><div class="dns-canvas" data-canvas><div class="dns-loading">正在加载拓扑…</div></div></section><aside class="dns-inspector" data-inspector><div class="dns-inspector-empty"><i class="fa fa-mouse-pointer"></i><p>点击拓扑节点查看和修改配置</p></div></aside></div>' : '<div class="dns-empty dns-empty-compact"><div class="dns-empty-icon"><i class="fa fa-project-diagram"></i></div><h3>暂无 GTM 3.0 接入配置</h3><p>当前阿里云账号未返回可管理的接入域名。</p></div>'));
        root.querySelector("[data-account]").onchange = function (event) {
            selectedAccountId = Number(event.target.value);
            selectedConfigId = null;
            loadInstances();
        };
        root.querySelector("[data-account-settings]").onclick = goAccounts;
        root.querySelectorAll("[data-config]").forEach(function (button) {
            button.onclick = function () {
                selectedConfigId = button.dataset.config;
                selectedNode = null;
                root.querySelectorAll("[data-config]").forEach(function (item) { item.classList.toggle("active", item.dataset.config === selectedConfigId); });
                loadTopology(selectedConfigId);
            };
        });
    }

    function loadTopology(configId) {
        var instance = state.instances.find(function (row) { return row.config_id === configId; });
        if (!instance) return;
        var canvas = root.querySelector("[data-canvas]");
        if (canvas) canvas.innerHTML = '<div class="dns-loading">正在加载拓扑…</div>';
        api("/topology?account_id=" + encodeURIComponent(selectedAccountId) + "&instance_id=" + encodeURIComponent(instance.instance_id) + "&config_id=" + encodeURIComponent(instance.config_id)).then(function (payload) {
            if (selectedConfigId !== configId) return;
            state.topology = payload.data;
            selectedNode = { type: "instance", data: state.topology };
            renderTree();
            renderInspector();
        }).catch(function (error) {
            if (canvas) canvas.innerHTML = '<div class="alert alert-danger m-3">' + esc(error.message) + '</div>';
        });
    }

    function renderTree() {
        var topology = state.topology;
        if (!topology) return;
        var title = root.querySelector("[data-topology-title]");
        var summary = root.querySelector("[data-topology-summary]");
        if (title) title.textContent = topology.domain || "接入域名";
        if (summary) summary.textContent = topology.pools.length + " 个地址池 · " + topology.pools.reduce(function (count, pool) { return count + pool.addresses.length; }, 0) + " 个地址";
        var pools = topology.pools.map(function (pool, poolIndex) {
            var addresses = pool.addresses.map(function (address, addressIndex) {
                return '<button type="button" class="dns-tree-node dns-address-node ' + nodeClass(address) + '" data-node="address" data-pool-index="' + poolIndex + '" data-address-index="' + addressIndex + '">' +
                    '<i class="fa fa-server" aria-hidden="true"></i><span><strong>' + esc(address.name || address.address || "未命名地址") + '</strong><small>' + esc(address.address || "-") + '</small></span>' + statusLabel(address) + '</button>';
            }).join("");
            if (!addresses) addresses = '<div class="dns-no-address">地址池内暂无地址</div>';
            return '<div class="dns-pool-branch"><button type="button" class="dns-tree-node dns-pool-node ' + nodeClass(pool) + '" data-node="pool" data-pool-index="' + poolIndex + '">' +
                '<i class="fa fa-cubes" aria-hidden="true"></i><span><strong>' + esc(pool.name || "未命名地址池") + '</strong><small>' + esc(strategyName(pool.strategy)) + ' · ' + pool.addresses.length + ' 个地址</small></span>' + statusLabel(pool) + '</button><div class="dns-address-list">' + addresses + '</div></div>';
        }).join("");
        if (!pools) pools = '<div class="dns-no-pool">当前接入域名尚未关联地址池</div>';
        var canvas = root.querySelector("[data-canvas]");
        canvas.innerHTML = '<div class="dns-tree"><button type="button" class="dns-tree-node dns-root-node ' + nodeClass(topology) + '" data-node="instance">' +
            '<i class="fa fa-globe-asia" aria-hidden="true"></i><span><strong>' + esc(topology.domain || "接入域名") + '</strong><small>' + esc(topology.record_type || "-") + ' · TTL ' + esc(topology.ttl == null ? "-" : topology.ttl + "s") + '</small></span>' + statusLabel(topology) + '</button><div class="dns-pool-list">' + pools + '</div></div>';
        canvas.querySelectorAll("[data-node]").forEach(function (button) {
            button.onclick = function () {
                var type = button.dataset.node;
                if (type === "instance") selectedNode = { type: type, data: topology };
                else if (type === "pool") selectedNode = { type: type, data: topology.pools[Number(button.dataset.poolIndex)] };
                else selectedNode = { type: type, data: topology.pools[Number(button.dataset.poolIndex)].addresses[Number(button.dataset.addressIndex)] };
                canvas.querySelectorAll("[data-node]").forEach(function (item) { item.classList.remove("selected"); });
                button.classList.add("selected");
                renderInspector();
            };
        });
        var selectedButton = canvas.querySelector('[data-node="' + (selectedNode ? selectedNode.type : "instance") + '"]');
        if (selectedButton) selectedButton.classList.add("selected");
    }

    function renderInspector() {
        var host = root.querySelector("[data-inspector]");
        if (!host || !selectedNode) return;
        var data = selectedNode.data;
        if (selectedNode.type === "instance") {
            host.innerHTML = '<div class="dns-inspector-head"><span class="dns-node-type">接入域名</span><h3>' + esc(data.domain || "-") + '</h3><p>' + esc(data.instance_name || data.remark || "GTM 实例配置") + '</p></div>' +
                detailRows([["运行状态", { html: statusLabel(data) }], ["记录类型", data.record_type || "-"], ["配置 ID", data.config_id || "-"], ["实例 ID", data.instance_id || "-"]]) +
                '<form data-node-form class="dns-inspector-form"><label><span>全局 TTL（秒）</span><input class="form-control" type="number" min="1" max="86400" name="ttl" value="' + esc(data.ttl || 60) + '"></label>' +
                strategyFields(data.strategy, data.sequence_mode) + statusFields(data.enable_status) + '<button class="btn btn-primary btn-block" type="submit">保存域名配置</button></form>';
        } else if (selectedNode.type === "pool") {
            host.innerHTML = '<div class="dns-inspector-head"><span class="dns-node-type">地址池</span><h3>' + esc(data.name || "-") + '</h3><p>' + esc(data.id || "-") + '</p></div>' +
                detailRows([["健康状态", healthName(data.health_status)], ["可用状态", availableName(data.available_status)], ["地址数量", data.addresses.length], ["健康判定", judgementName(data.health_judgement)]]) +
                '<form data-node-form class="dns-inspector-form">' + strategyFields(data.strategy, data.sequence_mode) + statusFields(data.enable_status) + '<button class="btn btn-primary btn-block" type="submit">保存地址池配置</button></form>';
        } else {
            host.innerHTML = '<div class="dns-inspector-head"><span class="dns-node-type">节点地址</span><h3>' + esc(data.name || data.address || "-") + '</h3><p>' + esc(data.address || "-") + '</p></div>' +
                detailRows([["健康状态", healthName(data.health_status)], ["可用状态", availableName(data.available_status)], ["地址类型", data.type || "-"], ["调度模式", data.available_mode === "manual" ? "手动" : "自动"]]) +
                '<form data-node-form class="dns-inspector-form">' + statusFields(data.enable_status) + '<button class="btn btn-primary btn-block" type="submit">保存节点状态</button></form>';
        }
        host.querySelector("[data-node-form]").onsubmit = saveNode;
        var strategy = host.querySelector('[name="strategy"]');
        if (strategy) strategy.onchange = function () {
            var mode = host.querySelector("[data-sequence-mode]");
            if (mode) mode.hidden = strategy.value !== "sequence";
        };
    }

    function saveNode(event) {
        event.preventDefault();
        var form = event.currentTarget;
        var button = form.querySelector('[type="submit"]');
        var body = { account_id: selectedAccountId };
        if (selectedNode.type === "instance") {
            body.instance_id = state.topology.instance_id;
            body.config_id = state.topology.config_id;
            var currentStatus = state.topology.enable_status || "enable";
            var nextStatus = formField(form, "status").value;
            if (nextStatus === "disable" && nextStatus !== currentStatus && !confirm("停用接入域名后，GTM 智能调度将不可用。确定继续吗？")) return;
            var ttl = Number(formField(form, "ttl").value);
            var strategy = formField(form, "strategy").value;
            var jobs = [];
            var sequenceMode = strategy === "sequence" ? formField(form, "sequence_mode").value : null;
            if (ttl !== Number(state.topology.ttl)) jobs.push(post("/update", Object.assign({}, body, {
                operation: "instance_basic",
                schedule_zone_name: state.topology.zone_name,
                schedule_hostname: state.topology.hostname,
                ttl: ttl,
            })));
            if (strategy !== state.topology.strategy || (strategy === "sequence" && sequenceMode !== state.topology.sequence_mode)) jobs.push(post("/update", Object.assign({}, body, {
                operation: "instance_strategy",
                strategy: strategy,
                sequence_mode: sequenceMode,
            })));
            if (nextStatus !== currentStatus) jobs.push(post("/update", Object.assign({}, body, { operation: "instance_status", status: nextStatus })));
            if (!jobs.length) return toast("配置没有变化");
            saveJobs(button, jobs);
            return;
        }
        if (selectedNode.type === "pool") {
            var pool = selectedNode.data;
            var poolStrategy = formField(form, "strategy").value;
            var poolSequenceMode = poolStrategy === "sequence" ? formField(form, "sequence_mode").value : null;
            if (formField(form, "status").value === "disable" && formField(form, "status").value !== pool.enable_status && !confirm("停用地址池后，该池将不再参与解析。确定继续吗？")) return;
            var poolJobs = [];
            if (poolStrategy !== pool.strategy || (poolStrategy === "sequence" && poolSequenceMode !== pool.sequence_mode)) poolJobs.push(post("/update", Object.assign({}, body, {
                operation: "pool_strategy",
                pool_id: pool.id,
                strategy: poolStrategy,
                sequence_mode: poolSequenceMode,
            })));
            if (formField(form, "status").value !== pool.enable_status) poolJobs.push(post("/update", Object.assign({}, body, { operation: "pool_status", pool_id: pool.id, status: formField(form, "status").value })));
            if (!poolJobs.length) return toast("配置没有变化");
            saveJobs(button, poolJobs);
            return;
        }
        var address = selectedNode.data;
        if (formField(form, "status").value === "disable" && formField(form, "status").value !== address.enable_status && !confirm("停用节点后，该地址将不再参与解析。确定继续吗？")) return;
        if (formField(form, "status").value === address.enable_status) {
            toast("节点状态没有变化");
            return;
        }
        saveJobs(button, [post("/update", Object.assign({}, body, { operation: "address_status", address_id: address.id, status: formField(form, "status").value }))]);
    }

    function saveJobs(button, jobs) {
        var original = button.textContent;
        button.disabled = true;
        button.textContent = "保存中…";
        Promise.all(jobs).then(function () {
            toast("配置已更新");
            loadTopology(selectedConfigId);
        }).catch(function (error) {
            button.disabled = false;
            button.textContent = original;
            alert("保存失败：" + error.message);
        });
    }

    function strategyFields(strategy, sequenceMode) {
        var options = [["sequence", "顺序（主备）"], ["round_robin", "轮询"], ["weight", "权重"], ["source_nearest", "来源就近"]];
        return '<label><span>负载均衡策略</span><select class="form-control" name="strategy">' + options.map(function (item) { return '<option value="' + item[0] + '" ' + (strategy === item[0] ? "selected" : "") + '>' + item[1] + '</option>'; }).join("") + '</select></label>' +
            '<label data-sequence-mode ' + (strategy === "sequence" ? "" : "hidden") + '><span>恢复模式</span><select class="form-control" name="sequence_mode"><option value="preemptive" ' + (sequenceMode !== "non_preemptive" ? "selected" : "") + '>抢占模式</option><option value="non_preemptive" ' + (sequenceMode === "non_preemptive" ? "selected" : "") + '>非抢占模式</option></select></label>';
    }

    function statusFields(status) {
        return '<label><span>启用状态</span><select class="form-control" name="status"><option value="enable" ' + (status !== "disable" ? "selected" : "") + '>启用</option><option value="disable" ' + (status === "disable" ? "selected" : "") + '>停用</option></select></label>';
    }

    function detailRows(rows) {
        return '<dl class="dns-detail-list">' + rows.map(function (row) {
            var value = row[1] && typeof row[1] === "object" && row[1].html ? row[1].html : esc(row[1]);
            return '<div><dt>' + esc(row[0]) + '</dt><dd>' + value + '</dd></div>';
        }).join("") + '</dl>';
    }

    function strategyName(value) {
        return ({ sequence: "顺序（主备）", round_robin: "轮询", weight: "权重", source_nearest: "来源就近" })[value] || value || "未配置";
    }
    function healthName(value) {
        return ({ ok: "正常", ok_alert: "警告", ok_no_monitor: "正常（无监控）", exceptional: "异常" })[value] || value || "未知";
    }
    function availableName(value) {
        return ({ available: "可用", unavailable: "不可用" })[value] || value || "未知";
    }
    function judgementName(value) {
        return ({ any_ok: "至少一个地址正常", p30_ok: "至少 30% 正常", p50_ok: "至少 50% 正常", p70_ok: "至少 70% 正常", all_ok: "全部地址正常" })[value] || value || "-";
    }
    function nodeClass(data) {
        if (data.enable_status === "disable") return "is-off";
        if (data.health_status === "exceptional" || data.available_status === "unavailable") return "is-bad";
        if (data.health_status === "ok_alert") return "is-warn";
        return "is-ok";
    }
    function statusDot(data) {
        return '<i class="dns-dot ' + nodeClass(data) + '" title="' + esc(healthName(data.health_status)) + '"></i>';
    }
    function statusLabel(data) {
        var label = data.enable_status === "disable" ? "已停用" : (data.available_status === "unavailable" ? "不可用" : healthName(data.health_status));
        return '<span class="dns-status ' + nodeClass(data) + '">' + esc(label) + '</span>';
    }
    function statusPill(status, label) {
        return '<span class="dns-status ' + (status === "enable" ? "is-ok" : "is-off") + '">' + esc(label) + '</span>';
    }
    function dateTime(value) {
        if (!value) return "-";
        var date = new Date(Number(value) * 1000);
        return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
    }
    function showError(error) {
        content('<div class="alert alert-danger m-4">' + esc(error.message) + '</div>');
    }
    function toast(message) {
        var node = document.createElement("div");
        node.className = "dns-toast";
        node.textContent = message;
        document.body.appendChild(node);
        setTimeout(function () { node.remove(); }, 2200);
    }

    function mountSidebarMenu() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return false;
        if (nav.querySelector(".aliyun-dns-menu-item")) return true;
        var labels = Array.prototype.slice.call(nav.querySelectorAll(".nav-main-link-name"));
        var anchorLabel = labels.find(function (node) { return node.textContent.trim() === "客户端配置"; }) || labels.find(function (node) { return node.textContent.trim() === "系统配置"; });
        var anchorItem = anchorLabel && anchorLabel.closest(".nav-main-item");
        var item = document.createElement("li");
        item.className = "nav-main-item aliyun-dns-menu-item";
        item.innerHTML = '<a class="nav-main-link aliyun-dns-menu-link" href="#/aliyun-dns"><i class="nav-main-link-icon fa fa-project-diagram"></i><span class="nav-main-link-name">云解析 DNS</span></a>';
        if (anchorItem && anchorItem.parentNode) anchorItem.parentNode.insertBefore(item, anchorItem.nextSibling);
        else nav.appendChild(item);
        item.querySelector("a").onclick = function (event) {
            event.preventDefault();
            if (!isRoute() || location.pathname.replace(/\/+$/, "") !== routeUrl().split("/#/")[0]) history.pushState({}, "", routeUrl());
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
