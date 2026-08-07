(function () {
    "use strict";

    var mounting = false;

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
