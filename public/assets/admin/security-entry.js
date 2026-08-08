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
