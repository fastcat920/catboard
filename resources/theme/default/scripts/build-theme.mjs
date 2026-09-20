import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(sourceDir, '../../..');
const distDir = path.join(sourceDir, 'dist');
const outputDir = path.join(projectRoot, 'public/theme/default');

const copyDir = async (source, target) => {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
};

const assetTags = html => ({
  css: [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g)].map(x => x[1]),
  js: [...html.matchAll(/<script[^>]+defer="defer"[^>]+src="([^"]+\.js(?:\?[^"]*)?)"[^>]*><\/script>/g)].map(x => x[1])
});

const blade = ({ css, js }) => `<!doctype html>
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
    window.EZ_LOADER = { configFileName: '/theme/default/config.js', configTimeout: 3000, maxRetries: 2, configVersion: '{{ $version }}' };
    if (!window.location.hash) window.location.replace(window.location.pathname + window.location.search + '#/');
  </script>
${css.map(href => `  <link rel="stylesheet" href="${href.split('?')[0]}?v={{ $version }}">`).join('\n')}
${js.map(src => `  <script defer src="${src.split('?')[0]}?v={{ $version }}"></script>`).join('\n')}
</head>
<body>
  <div id="app"></div>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>
</html>
`;

const main = async () => {
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const tags = assetTags(html);
  if (!tags.js.length) throw new Error('No compiled JavaScript assets found');

  // 保留历史哈希资源，避免发布过程中浏览器/CDN 缓存的旧入口请求到已删除分包而白屏。
  // 新入口会引用新哈希文件；历史资源可在确认缓存完全失效后单独清理。
  await fs.mkdir(outputDir, { recursive: true });
  await copyDir(path.join(distDir, 'static'), path.join(outputDir, 'static'));
  for (const name of ['config.js', 'landingpage.html']) {
    try { await fs.copyFile(path.join(distDir, name), path.join(outputDir, name)); } catch (_) {}
  }
  try { await copyDir(path.join(sourceDir, 'public/images'), path.join(outputDir, 'images')); } catch (_) {}
  await fs.writeFile(path.join(outputDir, 'dashboard.blade.php'), blade(tags));
  await fs.writeFile(path.join(outputDir, 'config.json'), JSON.stringify({
    name: 'default',
    description: 'Catboard 默认用户主题',
    version: '2.0.0',
    images: '/theme/default/images/background.jpg',
    configs: [
      { label: '主题主色', placeholder: '例如 #4566AE', field_name: 'primary_color', field_type: 'input', default_value: '#4566AE' },
      { label: '显示标题 Logo', placeholder: '请选择是否显示', field_name: 'show_logo', field_type: 'select', select_options: { '1': '显示', '0': '隐藏' }, default_value: '1' },
      { label: '启用落地页', placeholder: '请选择是否启用', field_name: 'enable_landing_page', field_type: 'select', select_options: { '1': '启用', '0': '关闭' }, default_value: '1' },
      { label: '自定义页脚 HTML', placeholder: '可填写客服、统计等 HTML 或 JavaScript', field_name: 'custom_html', field_type: 'textarea', default_value: '' }
    ]
  }, null, 2) + '\n');
  console.log(`Default theme deployed to ${outputDir}`);
};

main().catch(error => { console.error(error); process.exit(1); });
