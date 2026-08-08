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
        if (lastUserFetch || !window.performance) return;
        var entries = performance.getEntriesByType("resource").filter(function (entry) {
            try { return /\/user\/fetch$/.test(new URL(entry.name).pathname); } catch (e) { return false; }
        });
        if (!entries.length) return;
        var url = new URL(entries[entries.length - 1].name);
        lastUserFetch = { sourceQuery: url.search.replace(/^\?/, ""), total: null };
        mountBatchGroup();
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
        if (old) {
            old.querySelector("span").textContent = lastUserFetch.total == null ? "批量加入权限组" : "批量加入权限组（" + lastUserFetch.total + "人）";
            return;
        }
        var button = document.createElement("button");
        button.type = "button";
        button.className = "user-batch-group-entry";
        button.innerHTML = "<span>" + (lastUserFetch.total == null ? "批量加入权限组" : "批量加入权限组（" + lastUserFetch.total + "人）") + "</span>";
        button.title = "将当前全部筛选结果修改到指定权限组";
        button.onclick = openBatchGroupModal;
        document.body.appendChild(button);
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
                modal.innerHTML = '<div class="user-batch-group-box"><div class="user-batch-group-head"><div><b>批量加入权限组</b><small>只修改用户权限组，不修改套餐、流量和到期时间</small></div><button type="button" data-batch-close>×</button></div><div class="user-batch-group-body"><div class="user-batch-warning">操作范围：当前全部筛选结果' + (selection.total == null ? '，实际人数将在预览时从服务器核对' : '，页面显示共 <b>' + selection.total + '</b> 名用户') + '。请确认筛选条件无误。</div><label>目标权限组<select data-batch-group><option value="">请选择权限组</option>' + groups.map(function (group) { return '<option value="' + group.id + '">' + escapeHtml(group.name) + '（当前 ' + Number(group.user_count || 0) + ' 人 / ' + Number(group.server_count || 0) + ' 节点）</option>'; }).join("") + '</select></label><div data-batch-preview class="user-batch-preview muted">选择权限组后点击“预览影响”。</div><label data-batch-confirm-wrap hidden>输入权限组名称确认<input data-batch-confirm autocomplete="off" placeholder="请输入完整权限组名称"></label><div data-batch-error class="user-batch-error" hidden></div></div><div class="user-batch-group-actions"><button type="button" data-batch-close>取消</button><button type="button" data-batch-preview-button>预览影响</button><button type="button" data-batch-submit disabled>确认修改</button></div></div>';
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

    function bindBatchGroupModal(modal, selection) {
        var groupSelect = modal.querySelector("[data-batch-group]");
        var preview = modal.querySelector("[data-batch-preview]");
        var confirmWrap = modal.querySelector("[data-batch-confirm-wrap]");
        var confirmInput = modal.querySelector("[data-batch-confirm]");
        var submit = modal.querySelector("[data-batch-submit]");
        var errorBox = modal.querySelector("[data-batch-error]");
        var previewData = null;
        modal.querySelectorAll("[data-batch-close]").forEach(function (button) { button.onclick = closeBatchGroupModal; });
        modal.onclick = function (event) { if (event.target === modal) closeBatchGroupModal(); };
        groupSelect.onchange = function () {
            previewData = null;
            preview.textContent = "选择权限组后点击“预览影响”。";
            confirmWrap.hidden = true;
            confirmInput.value = "";
            submit.disabled = true;
        };
        modal.querySelector("[data-batch-preview-button]").onclick = function () {
            if (!groupSelect.value) { showBatchError(errorBox, "请先选择目标权限组"); return; }
            showBatchError(errorBox, "");
            preview.textContent = "正在核对服务器上的最新筛选结果……";
            api("/user/batchGroupPreview", {
                method: "POST",
                body: JSON.stringify({ group_id: Number(groupSelect.value), source_query: selection.sourceQuery }),
            }).then(function (data) {
                previewData = data;
                var sample = data.samples.map(function (user) { return "ID " + user.id + " · " + escapeHtml(user.email); }).join("<br>");
                preview.innerHTML = '<div class="user-batch-preview-summary">服务器实际匹配 <b>' + data.total + '</b> 人，将统一修改为 <b>' + escapeHtml(data.group.name) + '</b>。</div><details><summary>查看前 ' + data.samples.length + ' 名匹配用户</summary><div>' + sample + '</div></details>';
                confirmWrap.hidden = false;
                confirmWrap.firstChild.textContent = "输入权限组名称 “" + data.group.name + "” 确认";
                confirmInput.oninput = function () { submit.disabled = confirmInput.value !== data.group.name; };
                submit.disabled = true;
            }).catch(function (error) { preview.textContent = "预览失败"; showBatchError(errorBox, error.message); });
        };
        submit.onclick = function () {
            if (!previewData || confirmInput.value !== previewData.group.name) return;
            submit.disabled = true;
            submit.textContent = "正在修改……";
            showBatchError(errorBox, "");
            api("/user/batchGroup", {
                method: "POST",
                body: JSON.stringify({ group_id: previewData.group.id, source_query: selection.sourceQuery, confirm_name: confirmInput.value }),
            }).then(function (data) {
                alert("修改完成：匹配 " + data.matched + " 人，实际更新 " + data.affected + " 人。");
                closeBatchGroupModal();
                location.reload();
            }).catch(function (error) {
                submit.disabled = false;
                submit.textContent = "确认修改";
                showBatchError(errorBox, error.message);
            });
        };
    }

    function showBatchError(box, message) {
        box.hidden = !message;
        box.textContent = message || "";
    }

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
        mountBatchGroup();
    }

    function start() {
        captureUserFetch();
        recoverUserFetch();
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
