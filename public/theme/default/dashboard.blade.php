<!doctype html>
<html lang="zh-CN">
<head>
  <base href="/theme/default/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no">
  <meta name="description" content="{{ $description }}">
  <title>{{ $title }}</title>
  <script>
    window.CATBOARD_THEME = Object.assign({}, @json($theme_config ?? []), {
      title: @json($title),
      title_zh: @json($title_zh ?? $title),
      title_en: @json($title_en ?? $title),
      description: @json($description),
      description_zh: @json($description_zh ?? $description),
      description_en: @json($description_en ?? $description),
      logo: @json($logo ?? '')
    });
    if (!window.location.hash) window.location.replace(window.location.pathname + window.location.search + '#/');
  </script>

  <script defer src="/theme/default/static/js/170.4efde90f.js?v={{ $version }}"></script>
  <script defer src="/theme/default/static/js/index.bf20e3c8.js?v={{ $version }}"></script>
</head>
<body>
  <div id="app"></div>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>
</html>
