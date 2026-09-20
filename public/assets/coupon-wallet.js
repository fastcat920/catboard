(function () {
    "use strict";
    var root,
        current = "available";
    function text(z, e) {
        return localStorage.getItem("umi_locale") === "en-US" ? e : z;
    }
    function esc(v) {
        var d = document.createElement("div");
        d.textContent = v == null ? "" : v;
        return d.innerHTML;
    }
    function api(path, opt) {
        opt = opt || {};
        var h = {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            a = localStorage.getItem("authorization");
        if (a) h.authorization = a;
        return fetch(
            "/api/v1/user/coupon" + path,
            Object.assign({ credentials: "include", headers: h }, opt),
        ).then(function (r) {
            return r.json().then(function (p) {
                if (!r.ok)
                    throw new Error(
                        p.message || text("请求失败", "Request failed"),
                    );
                return p;
            });
        });
    }
    function dt(v) {
        return v ? new Date(Number(v) * 1000).toLocaleString() : "-";
    }
    function status(v) {
        return (
            {
                pending: text("待生效", "Pending"),
                available: text("可使用", "Available"),
                locked: text("已锁定", "Locked"),
                used: text("已使用", "Used"),
                expired: text("已过期", "Expired"),
                revoked: text("已撤销", "Revoked"),
            }[v] || v
        );
    }
    function sourceLabel(source) {
        var labels = {
            manual: ["后台手动发放", "Manual issuance"],
            newcomer: ["新人邀请奖励", "Newcomer referral reward"],
            referral_newcomer: ["新人邀请奖励", "Newcomer referral reward"],
            distribution_task: [
                "平台批量发放",
                "Platform bulk distribution",
            ],
            campaign: ["邀请活动奖励", "Referral campaign reward"],
        };
        return labels[source]
            ? text(labels[source][0], labels[source][1])
            : source;
    }
    function isCouponRoute() {
        return location.hash === "#/coupon" || location.pathname === "/coupon";
    }
    function open() {
        if (!root || !root.isConnected) {
            root = document.createElement("div");
            root.className = "coupon-wallet-page";
            (
                document.getElementById("page-container") || document.body
            ).appendChild(root);
        }
        root.hidden = false;
        document.querySelectorAll(".coupon-wallet-menu .nav-main-link").forEach(function (link) {
            link.classList.add("active");
        });
        load();
    }
    function close() {
        if (root) root.hidden = true;
        document.querySelectorAll(".coupon-wallet-menu .nav-main-link").forEach(function (link) {
            link.classList.remove("active");
        });
    }
    function load() {
        root.innerHTML =
            '<div class="coupon-wallet-loading">' +
            text("加载中…", "Loading…") +
            "</div>";
        api("/wallet")
            .then(function (p) {
                var rows = p.data || [],
                    shown = rows.filter(function (x) {
                        return current === "history"
                            ? ["used", "expired", "revoked"].indexOf(
                                  x.status,
                              ) >= 0
                            : x.status === current;
                    });
                root.innerHTML =
                    '<div class="coupon-wallet-shell"><div class="block"><div class="block-header block-header-default"><h3 class="block-title">' +
                    text("我的优惠券", "My coupons") +
                    '</h3></div><div class="block-content"><div class="coupon-wallet-controls"><button class="btn ' +
                    (current === "available" ? "btn-primary" : "btn-light") +
                    '" data-status="available">' +
                    text("可使用", "Available") +
                    '</button><button class="btn ' +
                    (current === "locked" ? "btn-primary" : "btn-light") +
                    '" data-status="locked">' +
                    text("使用中", "Locked") +
                    '</button><button class="btn ' +
                    (current === "history" ? "btn-primary" : "btn-light") +
                    '" data-status="history">' +
                    text("历史记录", "History") +
                    '</button></div><div class="coupon-list">' +
                    (shown.length
                        ? shown
                              .map(function (x) {
                                  var t = x.template || {},
                                      discount =
                                          t.discount_type === "fixed"
                                              ? text("减 ¥", "¥") +
                                                (
                                                    Number(
                                                        t.discount_value || 0,
                                                    ) / 100
                                                ).toFixed(2)
                                              : 100 -
                                                Number(t.discount_value || 0) +
                                                text(" 折", "% off");
                                  return (
                                      '<article class="coupon-card ' +
                                      x.status +
                                      '"><div class="coupon-value">' +
                                      discount +
                                      '</div><div class="coupon-info"><strong>' +
                                      esc(
                                          localStorage.getItem("umi_locale") ===
                                              "en-US" && t.name_en
                                              ? t.name_en
                                              : t.name,
                                      ) +
                                      "</strong><span>" +
                                      text("满 ¥", "Min ¥") +
                                      (
                                          Number(t.minimum_amount || 0) / 100
                                      ).toFixed(2) +
                                      " · " +
                                      text("有效期至 ", "Expires ") +
                                      dt(x.expires_at) +
                                      "</span><small>" +
                                      status(x.status) +
                                      " · " +
                                      esc(sourceLabel(x.source)) +
                                      "</small></div>" +
                                      "</article>"
                                  );
                              })
                              .join("")
                        : '<div class="coupon-empty">' +
                          text("暂无优惠券", "No coupons") +
                          "</div>") +
                    "</div></div></div></div>";
                root.querySelectorAll("[data-status]").forEach(function (b) {
                    b.onclick = function () {
                        current = b.dataset.status;
                        load();
                    };
                });
            })
            .catch(function (e) {
                root.innerHTML =
                    '<div class="alert alert-danger">' +
                    esc(e.message) +
                    "</div>";
            });
    }
    function mount() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return;
        var item = nav.querySelector(".coupon-wallet-menu");
        if (!item) {
            item = document.createElement("li");
            item.className = "nav-main-item coupon-wallet-menu";
            item.innerHTML =
                '<a class="nav-main-link" href="javascript:void(0)"><i class="nav-main-link-icon si si-wallet"></i><span class="nav-main-link-name">' +
                text("我的优惠券", "My coupons") +
                "</span></a>";
            var invite = Array.prototype.find.call(
                nav.querySelectorAll(".nav-main-link-name"),
                function (n) {
                    return /邀请|Invite/i.test(n.textContent);
                },
            );
            var target = invite && invite.closest(".nav-main-item");
            target ? nav.insertBefore(item, target) : nav.appendChild(item);
            item.querySelector("a").onclick = function (e) {
                e.preventDefault();
                if (!isCouponRoute() && window.g_history)
                    window.g_history.push("/coupon");
                setTimeout(open, 0);
            };
        }
    }
    function start() {
        mount();
        if (isCouponRoute()) setTimeout(open, 0);
        if (window.g_history)
            window.g_history.listen(function (location) {
                if (location.pathname === "/coupon") setTimeout(open, 0);
                else close();
            });
        document.addEventListener("click", function (e) {
            var a = e.target.closest && e.target.closest(".nav-main-link");
            if (a && !a.closest(".coupon-wallet-menu")) close();
        });
        new MutationObserver(function () {
            requestAnimationFrame(mount);
        }).observe(document.getElementById("root") || document.body, {
            childList: true,
            subtree: true,
        });
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", start);
    else start();
})();
