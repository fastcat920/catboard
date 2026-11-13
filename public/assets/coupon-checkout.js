(function () {
    "use strict";
    var state = {
        key: "",
        planId: null,
        period: null,
        mode: "none",
        selectedId: null,
        preview: null,
        loading: false,
        error: "",
    };
    var requestVersion = 0;
    function text(zh, en) {
        return localStorage.getItem("umi_locale") === "en-US" ? en : zh;
    }
    function esc(value) {
        var node = document.createElement("div");
        node.textContent = value == null ? "" : value;
        return node.innerHTML;
    }
    function money(value) {
        return (Number(value || 0) / 100).toFixed(2);
    }
    function remaining(value) {
        var seconds = Math.max(0, Number(value || 0) - Date.now() / 1000);
        if (!seconds) return text("即将结束", "Ending soon");
        var days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
        return days ? text("剩余 ", "") + days + text(" 天 ", "d ") + hours + text(" 小时", "h left") : text("剩余 ", "") + hours + text(" 小时 ", "h ") + minutes + text(" 分钟", "m left");
    }
    function localizedName(template) {
        if (!template) return "";
        return localStorage.getItem("umi_locale") === "en-US" &&
            template.name_en
            ? template.name_en
            : template.name;
    }
    function headers() {
        var result = {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            authorization = localStorage.getItem("authorization");
        if (authorization) result.authorization = authorization;
        return result;
    }
    function preview() {
        if (!state.planId || !state.period || state.loading) return;
        state.loading = true;
        state.error = "";
        render();
        var version = ++requestVersion;
        var payload = {
            plan_id: state.planId,
            period: state.period,
            disable_auto_coupon: state.mode === "none",
        };
        if (state.mode === "selected" && state.selectedId)
            payload.user_coupon_id = state.selectedId;
        fetch("/api/v1/user/order/preview", {
            method: "POST",
            credentials: "include",
            headers: headers(),
            body: JSON.stringify(payload),
        })
            .then(function (response) {
                return response.json().then(function (body) {
                    if (!response.ok)
                        throw new Error(
                            body.message ||
                                text("优惠券查询失败", "Coupon lookup failed"),
                        );
                    return body.data;
                });
            })
            .then(function (data) {
                if (version !== requestVersion) return;
                state.preview = data;
                state.error = "";
                if (state.mode !== "none") {
                    state.selectedId = data.selected_coupon
                        ? Number(data.selected_coupon.id)
                        : null;
                    state.mode = state.selectedId ? "selected" : "none";
                }
            })
            .catch(function (error) {
                if (version !== requestVersion) return;
                state.preview = null;
                state.error = error.message || "";
            })
            .finally(function () {
                if (version !== requestVersion) return;
                state.loading = false;
                render();
            });
    }
    function discountLabel(coupon) {
        var template = coupon.template || {};
        return template.discount_type === "fixed"
            ? text("减 ¥", "¥") + money(template.discount_value)
            : Number(template.discount_value || 0) + "% OFF";
    }
    function unavailableReason(reason, coupon) {
        return (
            {
                template_disabled: text("优惠券已停用", "Coupon is disabled"),
                plan_not_supported: text(
                    "不适用于当前套餐",
                    "Not valid for this plan",
                ),
                period_not_supported: text(
                    "不适用于当前付款周期",
                    "Not valid for this billing period",
                ),
                first_order_only: text(
                    "仅限首笔订单",
                    "First order only",
                ),
            }[reason] || reason
        );
    }
    function selectedCoupon() {
        if (!state.preview || !state.preview.available_coupons) return null;
        return state.preview.available_coupons.find(function (coupon) {
            return Number(coupon.id) === Number(state.selectedId);
        });
    }
    function pickerHtml() {
        var coupon = selectedCoupon(),
            count = state.preview
                ? (state.preview.available_coupons || []).length
                : 0;
        var title = coupon
            ? localizedName(coupon.template) +
              " · -¥" +
              money(state.preview.coupon_discount)
            : text("不使用优惠券", "Do not use a coupon");
        var detail = state.loading
            ? text("正在计算最优优惠…", "Finding the best coupon…")
            : count
              ? text("共有 ", "") +
                count +
                text(" 张可用优惠券", " coupon(s) available")
              : text(
                    "当前订单暂无可用优惠券",
                    "No coupons available for this order",
                );
        return (
            '<div class="coupon-checkout-title">' +
            text("优惠券", "Coupon") +
            '</div><button type="button" class="coupon-checkout-choice" data-coupon-open ' +
            (state.loading ? "disabled" : "") +
            "><span><strong>" +
            esc(title) +
            "</strong><small>" +
            esc(detail) +
            '</small></span><i class="fa fa-chevron-right"></i></button><div class="coupon-checkout-error" data-coupon-error>' +
            esc(state.error) +
            "</div>"
        );
    }
    function renderSummary(cashier) {
        if (!state.preview) return;
        var total = cashier.querySelector(".col-md-4 h1"),
            block = total && total.closest(".block");
        if (!block) return;
        var rows = block.querySelector(".coupon-checkout-summary");
        if (!rows) {
            rows = document.createElement("div");
            rows.className = "coupon-checkout-summary";
            total.parentNode.insertBefore(rows, total);
        }
        var signature = [
            state.key,
            state.preview.activity_discount,
            state.preview.coupon_discount,
            state.preview.vip_discount,
            state.preview.final_amount,
        ].join(":");
        if (rows.dataset.couponRender === signature) return;
        rows.dataset.couponRender = signature;
        rows.innerHTML =
            (state.preview.flash_sale ? "<div><span>" + text("限时特价", "Flash sale") + " · " + esc(localizedName(state.preview.flash_sale)) + "<small>" + esc(remaining(state.preview.flash_sale.ends_at)) + "</small></span><strong>-¥" + money(state.preview.activity_discount) + "</strong></div>" : "") +
            "<div><span>" +
            text("优惠券", "Coupon") +
            "</span><strong>-¥" +
            money(state.preview.coupon_discount) +
            "</strong></div><div><span>" +
            text("会员优惠", "Member discount") +
            "</span><strong>-¥" +
            money(state.preview.vip_discount) +
            "</strong></div>";
        if (!total.dataset.couponOriginalText)
            total.dataset.couponOriginalText = total.textContent;
        total.textContent = total.dataset.couponOriginalText.replace(
            /[\d,.]+/,
            money(state.preview.final_amount),
        );
    }
    function render() {
        var cashier = document.getElementById("cashier");
        if (!cashier) return;
        var input = cashier.querySelector(
                '.v2board-input-coupon,input[placeholder*="优惠券"],input[placeholder*="coupon" i]',
            ),
            legacy = input && input.closest(".block");
        if (legacy) legacy.style.display = "none";
        var side = cashier.querySelector(".col-md-4.col-sm-12");
        if (!side) return;
        var orderButton = side.querySelector(".btn-block.btn-primary");
        if (orderButton && state.loading) {
            orderButton.disabled = true;
            orderButton.dataset.couponDisabled = "1";
        } else if (
            orderButton &&
            orderButton.dataset.couponDisabled === "1"
        ) {
            orderButton.disabled = false;
            delete orderButton.dataset.couponDisabled;
        }
        var picker = side.querySelector(".coupon-checkout-picker");
        if (!picker) {
            picker = document.createElement("div");
            picker.className =
                "coupon-checkout-picker block block-link-pop block-rounded px-3 py-3 mb-2";
            side.insertBefore(picker, side.firstChild);
        }
        var signature = [
            state.key,
            state.loading ? 1 : 0,
            state.mode,
            state.selectedId || 0,
            state.preview ? state.preview.coupon_discount : 0,
            state.error,
        ].join(":");
        if (picker.dataset.couponRender !== signature) {
            picker.dataset.couponRender = signature;
            picker.innerHTML = pickerHtml();
            var openButton = picker.querySelector("[data-coupon-open]");
            if (openButton) openButton.onclick = openModal;
        }
        renderSummary(cashier);
    }
    function hideLegacyCoupon(cashier) {
        var input = cashier.querySelector(
            '.v2board-input-coupon,input[placeholder*="优惠券"],input[placeholder*="coupon" i]',
        );
        var legacy = input && input.closest(".block");
        if (legacy) legacy.style.display = "none";
    }
    function loadPlanMetadata(cashier, planId) {
        if (cashier.dataset.couponMetadataLoading === "1") return;
        cashier.dataset.couponMetadataLoading = "1";
        fetch("/api/v1/user/plan/fetch?id=" + encodeURIComponent(planId), {
            credentials: "include",
            headers: headers(),
        })
            .then(function (response) {
                return response.json();
            })
            .then(function (body) {
                var plan = body.data || {};
                var periods = [
                    "month_price",
                    "quarter_price",
                    "half_year_price",
                    "year_price",
                    "two_year_price",
                    "three_year_price",
                    "onetime_price",
                ].filter(function (period) {
                    return plan[period] !== null && plan[period] !== undefined;
                });
                cashier.dataset.couponPlan = planId;
                cashier
                    .querySelectorAll(".v2board-select")
                    .forEach(function (node, index) {
                        if (periods[index])
                            node.dataset.couponPeriod = periods[index];
                    });
                mount();
            })
            .catch(function () {
                cashier.dataset.couponMetadataLoading = "0";
            });
    }
    function openModal() {
        if (!state.preview) return;
        var coupons = state.preview.available_coupons || [],
            unavailable = state.preview.unavailable_coupons || [],
            modal = document.createElement("div");
        modal.className = "coupon-select-modal";
        modal.innerHTML =
            '<div class="coupon-select-dialog"><div class="coupon-select-head"><h3>' +
            text("选择优惠券", "Select coupon") +
            '</h3><button type="button" data-close>×</button></div><div class="coupon-select-list"><button type="button" class="coupon-select-item ' +
            (state.mode === "none" ? "active" : "") +
            '" data-none><span><strong>' +
            text("不使用优惠券", "Do not use a coupon") +
            "</strong><small>" +
            text("按原价结算当前订单", "Pay the regular order price") +
            '</small></span><i class="fa fa-check-circle"></i></button>' +
            coupons
                .map(function (coupon) {
                    return (
                        '<button type="button" class="coupon-select-item ' +
                        (Number(coupon.id) === Number(state.selectedId)
                            ? "active"
                            : "") +
                        '" data-id="' +
                        coupon.id +
                        '"><span><strong>' +
                        esc(localizedName(coupon.template)) +
                        " · " +
                        esc(discountLabel(coupon)) +
                        "</strong><small>" +
                        text("本单优惠 ¥", "Save ¥") +
                        money(coupon.calculated_discount) +
                        text(" · 有效期至 ", " · Expires ") +
                        new Date(
                            Number(coupon.expires_at) * 1000,
                        ).toLocaleString() +
                        '</small></span><i class="fa fa-check-circle"></i></button>'
                    );
                })
                .join("") +
            (coupons.length
                ? ""
                : '<div class="coupon-select-empty">' +
                  text("当前订单暂无可用优惠券", "No coupons available") +
                  "</div>") +
            (unavailable.length
                ? '<div class="coupon-select-subtitle">' +
                  text("不可用优惠券", "Unavailable coupons") +
                  "（" +
                  unavailable.length +
                  '）</div><div class="coupon-unavailable-list">' +
                  unavailable
                      .map(function (coupon) {
                          return (
                              '<div class="coupon-select-item disabled"><span><strong>' +
                              esc(localizedName(coupon.template)) +
                              " · " +
                              esc(discountLabel(coupon)) +
                              "</strong><small>" +
                              esc(
                                  unavailableReason(
                                      coupon.unavailable_reason,
                                      coupon,
                                  ),
                              ) +
                              "</small></span></div>"
                          );
                      })
                      .join("") +
                  "</div>"
                : "") +
            "</div></div>";
        document.body.appendChild(modal);
        function close() {
            modal.remove();
        }
        modal.querySelector("[data-close]").onclick = close;
        modal.onclick = function (event) {
            if (event.target === modal) close();
        };
        modal.querySelector("[data-none]").onclick = function () {
            state.mode = "none";
            state.selectedId = null;
            close();
            preview();
        };
        modal.querySelectorAll("[data-id]").forEach(function (button) {
            button.onclick = function () {
                state.mode = "selected";
                state.selectedId = Number(button.dataset.id);
                close();
                preview();
            };
        });
    }
    function mount() {
        if (!/#\/plan\//.test(location.hash)) return;
        var cashier = document.getElementById("cashier");
        if (!cashier) return;
        hideLegacyCoupon(cashier);
        var routeMatch = location.hash.match(/#\/plan\/(\d+)/);
        var active = cashier.querySelector("[data-coupon-period].active"),
            planId = Number(
                cashier.dataset.couponPlan ||
                    (routeMatch && routeMatch[1]) ||
                    0,
            ),
            period = active && active.dataset.couponPeriod;
        if (!planId) return;
        if (!period) {
            loadPlanMetadata(cashier, planId);
            return;
        }
        var key = planId + ":" + period;
        if (state.key !== key) {
            state.key = key;
            state.planId = planId;
            state.period = period;
            state.mode = "selected";
            state.selectedId = null;
            state.preview = null;
            preview();
        } else render();
    }
    var originalOpen = XMLHttpRequest.prototype.open,
        originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__couponOrderSave =
            typeof url === "string" && url.indexOf("/user/order/save") >= 0;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        if (this.__couponOrderSave)
            try {
                if (body instanceof FormData) {
                    if (state.mode === "selected" && state.selectedId)
                        body.set("user_coupon_id", String(state.selectedId));
                    else body.set("disable_auto_coupon", "1");
                } else if (typeof body === "string")
                    try {
                        var data = JSON.parse(body);
                        delete data.coupon_code;
                        if (state.mode === "selected" && state.selectedId)
                            data.user_coupon_id = state.selectedId;
                        else data.disable_auto_coupon = true;
                        body = JSON.stringify(data);
                    } catch (error) {
                        var params = new URLSearchParams(body);
                        params.delete("coupon_code");
                        if (state.mode === "selected" && state.selectedId)
                            params.set("user_coupon_id", state.selectedId);
                        else params.set("disable_auto_coupon", "1");
                        body = params.toString();
                    }
            } catch (error) {}
        return originalSend.call(this, body);
    };
    function summary() {
        if (!/#\/payment/.test(location.hash)) return;
        var query = location.hash.split("?")[1] || "",
            trade = new URLSearchParams(query).get("trade_no");
        if (!trade || document.querySelector(".coupon-order-summary")) return;
        fetch(
            "/api/v1/user/order/detail?trade_no=" + encodeURIComponent(trade),
            { credentials: "include", headers: headers() },
        )
            .then(function (response) {
                return response.json();
            })
            .then(function (payload) {
                var order = payload.data;
                if (!order || !order.user_coupon_id) return;
                var box = document.createElement("div");
                box.className = "alert alert-success coupon-order-summary";
                var snapshot = order.coupon_snapshot || {};
                box.innerHTML =
                    "<strong>" +
                    text("已使用优惠券", "Coupon applied") +
                    "</strong><div>" +
                    esc(
                        localStorage.getItem("umi_locale") === "en-US" &&
                            snapshot.name_en
                            ? snapshot.name_en
                            : snapshot.name || "",
                    ) +
                    "：- ¥" +
                    money(order.coupon_discount_amount) +
                    "</div>";
                var host = document.querySelector(".content,main,#root");
                if (host) host.insertBefore(box, host.firstChild);
            })
            .catch(function () {});
    }
    function run() {
        localStorage.removeItem("coupon_preference");
        mount();
        summary();
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", run);
    else run();
    window.addEventListener("hashchange", function () {
        setTimeout(run, 100);
    });
    new MutationObserver(function () {
        requestAnimationFrame(mount);
    }).observe(document.getElementById("root") || document.body, {
        childList: true,
        subtree: true,
    });
})();
