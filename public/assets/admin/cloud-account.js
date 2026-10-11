(function () {
    "use strict";

    var root = null;
    var state = { accounts: [], periods: {} };
    var providerLabels = { aliyun: "阿里云", tencent: "腾讯云", ucloud: "UCloud" };
    var providerKeys = {
        aliyun: ["AccessKey ID", "AccessKey Secret"],
        tencent: ["SecretId", "SecretKey"],
        ucloud: ["公钥", "私钥"],
    };
    var healthLabels = {
        healthy: "余额充足",
        low: "余额偏低",
        recharge: "建议充值",
        error: "同步失败",
        unknown: "等待同步",
        disabled: "已停用",
    };

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
        return fetch("/api/v1/" + window.settings.secure_path + "/cloud-account" + path, Object.assign({
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

    function isRoute() {
        return location.hash === "#/cloud-accounts";
    }

    function routeUrl() {
        var securePath = String((window.settings && window.settings.secure_path) || "").replace(/^\/+|\/+$/g, "");
        return "/" + securePath + "/#/cloud-accounts";
    }

    function closeOthers() {
        document.querySelectorAll(".referral-admin,.coupon-center-admin,.marketing-admin,.security-admin,.client-config-admin,.aliyun-dns-admin").forEach(function (node) {
            node.hidden = true;
        });
    }

    function open() {
        closeOthers();
        if (!root || !root.isConnected) {
            root = document.createElement("section");
            root.className = "cloud-account-admin";
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
        closeModal();
    }

    function setMenuActive(active) {
        document.querySelectorAll(".cloud-account-menu-link").forEach(function (link) {
            link.classList.toggle("active", active);
        });
    }

    function renderShell() {
        root.innerHTML = '<div class="cloud-account-page">' +
            '<header class="cloud-account-heading"><div><h2>云账号管理</h2><p>集中查看阿里云、腾讯云和 UCloud 的余额与月度消费</p></div>' +
            '<div class="cloud-account-heading-actions"><button type="button" class="btn btn-light" data-refresh-all><i class="fa fa-sync-alt" aria-hidden="true"></i> 刷新全部</button>' +
            '<button type="button" class="btn btn-primary" data-add><i class="fa fa-plus" aria-hidden="true"></i> 添加账号</button></div></header>' +
            '<main data-content><div class="cloud-account-loading">加载中…</div></main></div>';
        root.querySelector("[data-add]").onclick = function () { openEditor(null); };
        root.querySelector("[data-refresh-all]").onclick = refreshAll;
    }

    function load() {
        setContent('<div class="cloud-account-loading">加载中…</div>');
        api("/overview").then(function (payload) {
            state = payload.data || { accounts: [], periods: {} };
            renderAccounts();
        }).catch(showError);
    }

    function setContent(html) {
        var target = root && root.querySelector("[data-content]");
        if (target) target.innerHTML = html;
    }

    function renderAccounts() {
        var accounts = state.accounts || [];
        if (!accounts.length) {
            setContent('<div class="cloud-account-empty"><span><i class="fa fa-cloud" aria-hidden="true"></i></span><h3>还没有云账号</h3><p>添加账号后即可查看余额、上月账单和本月账单。</p><button type="button" class="btn btn-primary" data-empty-add>添加第一个账号</button></div>');
            root.querySelector("[data-empty-add]").onclick = function () { openEditor(null); };
            return;
        }
        var periods = state.periods || {};
        setContent('<div class="cloud-account-summary"><p><i class="fa fa-info-circle" aria-hidden="true"></i> 账单金额使用各云厂商的折后应付口径；本月数据可能存在延迟，仅用于充值判断。</p>' +
            '<span>共 ' + accounts.length + ' 个账号</span></div><div class="cloud-account-grid">' + accounts.map(function (account) {
                return accountCard(account, periods);
            }).join("") + '</div>');
        bindAccountActions();
    }

    function accountCard(account, periods) {
        var provider = providerLabels[account.provider] || account.provider;
        var health = healthLabels[account.health] || "等待同步";
        var coverage = account.coverage_months == null ? "" : '<span class="cloud-account-coverage">约可覆盖 ' + esc(account.coverage_months) + ' 个月</span>';
        var error = account.last_error ? '<div class="cloud-account-error"><i class="fa fa-exclamation-circle" aria-hidden="true"></i><span>' + esc(account.last_error) + '</span></div>' : "";
        return '<article class="cloud-account-card" data-id="' + account.id + '">' +
            '<header><div class="cloud-provider cloud-provider-' + esc(account.provider) + '">' + provider.substring(0, 1) + '</div><div><div class="cloud-account-title"><h3>' + esc(account.name) + '</h3><span>' + esc(provider) + '</span></div><p>更新于 ' + dateTime(account.last_synced_at) + '</p></div>' +
            '<span class="cloud-health is-' + esc(account.health) + '">' + esc(health) + '</span></header>' +
            '<div class="cloud-account-metrics">' +
            metric("账户余额", money(account.balance, account.currency), "balance") +
            metric((periods.previous || "上月") + " 账单", money(account.previous_month_amount, account.currency), "previous") +
            metric((periods.current || "本月") + " 账单", money(account.current_month_amount, account.currency), "current") +
            '</div><footer><div>' + coverage + '</div><div class="cloud-account-actions">' +
            '<button type="button" class="btn btn-sm btn-light" data-refresh-account><i class="fa fa-sync-alt" aria-hidden="true"></i> 刷新</button>' +
            '<button type="button" class="btn btn-sm btn-light" data-edit-account><i class="fa fa-pen" aria-hidden="true"></i> 编辑</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-drop-account>删除</button></div></footer>' + error + '</article>';
    }

    function metric(label, value, type) {
        return '<div class="cloud-account-metric is-' + type + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    }

    function money(value, currency) {
        if (value == null || value === "") return "--";
        var symbol = { CNY: "¥", USD: "$", JPY: "¥" }[String(currency || "CNY").toUpperCase()] || (currency ? currency + " " : "");
        return symbol + Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function dateTime(value) {
        if (!value) return "尚未同步";
        var date = new Date(Number(value) * 1000);
        return Number.isNaN(date.getTime()) ? "尚未同步" : date.toLocaleString("zh-CN", { hour12: false });
    }

    function bindAccountActions() {
        root.querySelectorAll("[data-refresh-account]").forEach(function (button) {
            button.onclick = function () { refreshOne(cardAccount(button), button); };
        });
        root.querySelectorAll("[data-edit-account]").forEach(function (button) {
            button.onclick = function () { openEditor(cardAccount(button)); };
        });
        root.querySelectorAll("[data-drop-account]").forEach(function (button) {
            button.onclick = function () { dropAccount(cardAccount(button)); };
        });
    }

    function cardAccount(node) {
        var id = Number(node.closest("[data-id]").dataset.id);
        return (state.accounts || []).find(function (account) { return Number(account.id) === id; });
    }

    function refreshOne(account, button) {
        if (!account || !account.enabled) {
            toast("请先启用该账号");
            return;
        }
        setBusy(button, true, "同步中…");
        post("/refresh", { id: account.id }).then(function () {
            toast("账号数据已更新");
            load();
        }).catch(function (error) {
            toast(error.message, true);
            load();
        }).finally(function () { setBusy(button, false); });
    }

    function refreshAll() {
        var button = root.querySelector("[data-refresh-all]");
        setBusy(button, true, "同步中…");
        post("/refresh-all", {}).then(function (payload) {
            var failed = ((payload.data && payload.data.accounts) || []).filter(function (account) { return account.last_error; }).length;
            toast(failed ? "同步完成，" + failed + " 个账号失败" : "所有账号已更新", failed > 0);
            load();
        }).catch(function (error) {
            toast(error.message, true);
        }).finally(function () { setBusy(button, false); });
    }

    function openEditor(account) {
        closeModal();
        var provider = account ? account.provider : "aliyun";
        var modal = document.createElement("div");
        modal.className = "cloud-account-modal";
        modal.innerHTML = '<section class="cloud-account-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-account-dialog-title">' +
            '<header><div><h3 id="cloud-account-dialog-title">' + (account ? "编辑云账号" : "添加云账号") + '</h3><p>访问密钥仅加密保存在服务器中</p></div><button type="button" data-close aria-label="关闭">×</button></header>' +
            '<form><div class="cloud-account-form">' +
            field("账号名称", "name", account ? account.name : "", "例如：阿里云主账号") +
            '<label><span>云服务商</span><select class="form-control" name="provider"><option value="aliyun">阿里云</option><option value="tencent">腾讯云</option><option value="ucloud">UCloud</option></select></label>' +
            '<div class="cloud-key-grid" data-key-fields></div>' +
            '<label class="cloud-token-field"><span>临时安全令牌 <small>（可选）</small></span><input class="form-control" type="password" name="security_token" autocomplete="new-password" placeholder="使用临时凭证时填写"></label>' +
            '<label class="cloud-account-check"><input type="checkbox" name="enabled" ' + (!account || account.enabled ? "checked" : "") + '><span>启用账号并允许刷新余额与账单</span></label>' +
            '<div class="cloud-account-permission"><i class="fa fa-shield-alt" aria-hidden="true"></i><p><strong>建议使用只读子账号密钥</strong><br><span data-permission-hint></span></p></div>' +
            '</div><footer><button type="button" class="btn btn-light" data-cancel>取消</button><button type="submit" class="btn btn-primary">保存并同步</button></footer></form></section>';
        document.body.appendChild(modal);
        var form = modal.querySelector("form");
        form.elements.provider.value = provider;
        renderKeyFields(modal, account);
        form.elements.provider.onchange = function () { renderKeyFields(modal, account); };
        modal.querySelector("[data-close]").onclick = closeModal;
        modal.querySelector("[data-cancel]").onclick = closeModal;
        modal.onclick = function (event) { if (event.target === modal) closeModal(); };
        modal.onkeydown = function (event) {
            if (event.key === "Escape") {
                closeModal();
                return;
            }
            if (event.key !== "Tab") return;
            var focusable = Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled])'));
            if (!focusable.length) return;
            var first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        form.onsubmit = function (event) {
            event.preventDefault();
            var submit = form.querySelector('[type="submit"]');
            var data = {
                id: account ? account.id : null,
                name: form.elements.name.value.trim(),
                provider: form.elements.provider.value,
                access_key_id: form.elements.access_key_id.value.trim(),
                access_key_secret: form.elements.access_key_secret.value.trim(),
                security_token: form.elements.security_token.value.trim(),
                enabled: form.elements.enabled.checked,
            };
            setBusy(submit, true, "同步中…");
            post("/save", data).then(function (payload) {
                var saved = payload.data || {};
                closeModal();
                toast(saved.last_error ? "账号已保存，但首次同步失败" : "账号已保存并同步", !!saved.last_error);
                load();
            }).catch(function (error) {
                toast(error.message, true);
                setBusy(submit, false);
            });
        };
        setTimeout(function () { form.elements.name.focus(); }, 0);
    }

    function renderKeyFields(modal, account) {
        var provider = modal.querySelector('[name="provider"]').value;
        var labels = providerKeys[provider] || providerKeys.aliyun;
        var sameProvider = account && account.provider === provider;
        var placeholderId = sameProvider && account.has_access_key ? "已安全保存，留空保持不变" : "请输入" + labels[0];
        var placeholderSecret = sameProvider && account.has_secret_key ? "已安全保存，留空保持不变" : "请输入" + labels[1];
        modal.querySelector("[data-key-fields]").innerHTML =
            '<label><span>' + esc(labels[0]) + '</span><input class="form-control" type="password" name="access_key_id" autocomplete="new-password" placeholder="' + esc(placeholderId) + '"></label>' +
            '<label><span>' + esc(labels[1]) + '</span><input class="form-control" type="password" name="access_key_secret" autocomplete="new-password" placeholder="' + esc(placeholderSecret) + '"></label>';
        var hints = {
            aliyun: "需要 AliyunBSSReadOnlyAccess，或 QueryAccountBalance 与 QueryBillOverview 的只读权限。",
            tencent: "需要 QcloudFinanceReadOnlyAccess，至少允许 DescribeAccountBalance 与 DescribeBillSummary。",
            ucloud: "需要 GetBalance 与 ListUBillOverview 的只读权限。",
        };
        modal.querySelector("[data-permission-hint]").textContent = hints[provider];
        modal.querySelector(".cloud-token-field").hidden = provider === "ucloud";
        modal.querySelector('[name="security_token"]').placeholder = sameProvider && account.has_security_token ? "已安全保存，留空保持不变" : "使用临时凭证时填写";
    }

    function field(label, name, value, placeholder) {
        return '<label><span>' + esc(label) + '</span><input class="form-control" type="text" name="' + esc(name) + '" value="' + esc(value) + '" placeholder="' + esc(placeholder || "") + '" required></label>';
    }

    function dropAccount(account) {
        if (!account || !window.confirm("确定删除云账号“" + account.name + "”吗？已同步的余额与账单数据也会一并删除。")) return;
        post("/drop", { id: account.id }).then(function () {
            toast("云账号已删除");
            load();
        }).catch(function (error) { toast(error.message, true); });
    }

    function closeModal() {
        document.querySelectorAll(".cloud-account-modal").forEach(function (modal) { modal.remove(); });
    }

    function setBusy(button, busy, text) {
        if (!button) return;
        if (busy) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.textContent = text || "处理中…";
        } else {
            button.disabled = false;
            if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
        }
    }

    function showError(error) {
        setContent('<div class="alert alert-danger m-4">' + esc(error.message) + '</div>');
    }

    function toast(message, danger) {
        var node = document.createElement("div");
        node.className = "cloud-account-toast" + (danger ? " is-danger" : "");
        node.textContent = message;
        document.body.appendChild(node);
        setTimeout(function () { node.remove(); }, 3000);
    }

    function mountSidebarMenu() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return false;
        if (nav.querySelector(".cloud-account-menu-item")) return true;
        var labels = Array.prototype.slice.call(nav.querySelectorAll(".nav-main-link-name"));
        var anchorLabel = labels.find(function (node) { return node.textContent.trim() === "云解析 DNS"; }) ||
            labels.find(function (node) { return node.textContent.trim() === "客户端配置"; }) ||
            labels.find(function (node) { return node.textContent.trim() === "系统配置"; });
        var anchorItem = anchorLabel && anchorLabel.closest(".nav-main-item");
        var item = document.createElement("li");
        item.className = "nav-main-item cloud-account-menu-item";
        item.innerHTML = '<a class="nav-main-link cloud-account-menu-link" href="#/cloud-accounts"><i class="nav-main-link-icon fa fa-cloud"></i><span class="nav-main-link-name">云账号管理</span></a>';
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
    document.addEventListener("click", function (event) {
        var link = event.target.closest && event.target.closest(".nav-main-link");
        if (link && !link.classList.contains("cloud-account-menu-link")) close();
    });
    mountSidebarMenu();
    if (isRoute()) setTimeout(open, 0);
})();
