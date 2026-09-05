(function () {
    "use strict";

    var panelId = "account-deletion-panel";

    function onProfilePage() {
        return window.location.hash.indexOf("#/profile") === 0;
    }

    function request(path, body) {
        return fetch(window.location.origin + "/api/v1" + path, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Content-Language": window.localStorage.getItem("umi_locale") || "zh-CN",
                "authorization": window.localStorage.getItem("authorization") || ""
            },
            body: JSON.stringify(body || {})
        }).then(function (response) {
            return response.json().then(function (payload) {
                if (!response.ok) {
                    var errors = payload.errors ? Object.values(payload.errors) : [];
                    var message = errors.length && errors[0].length ? errors[0][0] : payload.message;
                    throw new Error(message || "请求失败");
                }
                return payload;
            });
        });
    }

    function injectPanel() {
        if (!onProfilePage() || document.getElementById(panelId)) return;
        var container = document.querySelector("main#main-container .content.content-full");
        if (!container) return;

        var wrapper = document.createElement("div");
        wrapper.id = panelId;
        wrapper.className = "row mb-3 mb-md-0";
        wrapper.innerHTML = [
            '<div class="col-md-12">',
            '<div class="block block-rounded">',
            '<div class="block-header block-header-default"><h3 class="block-title">注销账号</h3></div>',
            '<div class="block-content"><div class="row push"><div class="col-lg-8 col-xl-5">',
            '<div class="alert alert-danger" role="alert">注销后登录和订阅将立即失效。历史订单会保留在已匿名化账号下，原邮箱可以重新注册，但不能再次领取新用户试用。</div>',
            '<div class="form-group"><label>当前邮箱验证码</label><div class="input-group">',
            '<input id="delete-account-code" class="form-control" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="请输入6位邮箱验证码">',
            '<div class="input-group-append"><button id="send-delete-account-code" class="btn btn-secondary" type="button">发送验证码</button></div>',
            '</div></div>',
            '<button id="delete-account-submit" class="btn btn-danger" type="button">永久注销账号</button>',
            '</div></div></div></div></div>'
        ].join("");
        container.appendChild(wrapper);

        document.getElementById("send-delete-account-code").addEventListener("click", function () {
            var button = this;
            button.disabled = true;
            request("/user/account/sendDeleteVerify").then(function () {
                window.alert("验证码已发送到当前账号邮箱，有效期5分钟。");
            }).catch(function (error) {
                window.alert(error.message);
            }).then(function () {
                button.disabled = false;
            });
        });

        document.getElementById("delete-account-submit").addEventListener("click", function () {
            var code = document.getElementById("delete-account-code").value.trim();
            if (!/^\d{6}$/.test(code)) {
                window.alert("请输入6位邮箱验证码。");
                return;
            }
            if (!window.confirm("账号注销后无法恢复，登录和订阅将立即失效。确定继续吗？")) return;

            var button = this;
            button.disabled = true;
            request("/user/account/delete", { email_code: code, confirm: "DELETE" }).then(function () {
                window.localStorage.removeItem("authorization");
                window.alert("账号已注销。");
                window.location.href = "/#/login";
            }).catch(function (error) {
                window.alert(error.message);
                button.disabled = false;
            });
        });
    }

    new MutationObserver(injectPanel).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("hashchange", injectPanel);
    injectPanel();
})();
