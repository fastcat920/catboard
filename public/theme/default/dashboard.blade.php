<!doctype html>
<html lang="zh-CN">
<head>
  <base href="/theme/default/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no">
  <meta name="description" content="{{ $description }}">
  <title>{{ $title }}</title>
  <script>
    window.CATBOARD_THEME = @json($theme_config ?? []);
    window.EZ_LOADER = { configFileName: '/theme/default/config.js', configTimeout: 3000, maxRetries: 2, configVersion: '{{ $version }}' };
  </script>

  <script defer src="/theme/default/static/js/756.59100790.js?v={{ $version }}"></script>
  <script defer src="/theme/default/static/js/index.b0aba811.js?v={{ $version }}"></script>
</head>
<body>
  <div id="app"></div>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>
</html>
