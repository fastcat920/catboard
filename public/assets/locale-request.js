(function () {
    function locale() {
        var selected = window.localStorage.getItem('umi_locale') || window.navigator.language || 'zh-CN';
        var supported = selected.toLowerCase().indexOf('en') === 0 ? 'en-US' : 'zh-CN';
        if (window.localStorage.getItem('umi_locale') !== supported) {
            window.localStorage.setItem('umi_locale', supported);
        }
        return supported;
    }

    var activeLocale = locale();
    if (window.settings) {
        var useEnglish = activeLocale === 'en-US';
        window.settings.title = useEnglish && window.settings.title_en ? window.settings.title_en : window.settings.title_zh;
        window.settings.description = useEnglish && window.settings.description_en ? window.settings.description_en : window.settings.description_zh;
        if (window.settings.title) {
            document.title = window.settings.title;
        }
    }

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function () {
        var requestUrl = new URL(arguments[1], window.location.href);
        originalOpen.apply(this, arguments);
        this.__catboardLocalRequest = requestUrl.origin === window.location.origin;
    };

    XMLHttpRequest.prototype.send = function () {
        if (this.__catboardLocalRequest) {
            this.setRequestHeader('X-Locale', locale());
        }
        originalSend.apply(this, arguments);
    };

    if (window.fetch) {
        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var requestUrl = new URL(input instanceof Request ? input.url : input, window.location.href);
            if (requestUrl.origin !== window.location.origin) {
                return originalFetch.call(this, input, init);
            }
            init = init || {};
            init.headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            init.headers.set('X-Locale', locale());
            return originalFetch.call(this, input, init);
        };
    }
})();
