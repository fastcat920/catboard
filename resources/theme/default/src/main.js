// 应用引导文件
// 负责按需加载 public/config.js，并在成功加载后再初始化 Vue 应用

// 若在 index.html 中定义了 window.EZ_LOADER，则优先使用其中的参数，以便无需重新打包即可调整
const {
  configFileName: CONFIG_FILE_NAME = 'config.js',
  configTimeout: CONFIG_TIMEOUT = 3000,
  maxRetries: MAX_RETRIES = 2,
  configVersion: CONFIG_VERSION = '1.2.3'
} = window.EZ_LOADER || {};

// 清理旧版本曾保存到浏览器中的明文密码。
localStorage.removeItem('savedPassword');

const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

const mergeRuntimeConfig = (baseConfig, runtimeConfig) => {
  const result = { ...(baseConfig || {}) };
  if (!isPlainObject(runtimeConfig)) return result;

  Object.keys(runtimeConfig).forEach(key => {
    result[key] = isPlainObject(result[key]) && isPlainObject(runtimeConfig[key])
      ? mergeRuntimeConfig(result[key], runtimeConfig[key])
      : runtimeConfig[key];
  });
  return result;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no', ''].includes(normalized)) return false;
  }
  return fallback;
};

const applyRuntimeThemeConfig = () => {
  // CatBoard 在 dashboard.blade.php 中注入后台主题设置，优先级应高于静态 config.js。
  const theme = window.CATBOARD_THEME || {};
  const runtime = {
    SITE_CONFIG: {
      siteName: theme.title || theme.site_name,
      siteDescription: theme.description,
      showLogo: normalizeBoolean(theme.show_logo, true),
      logo: theme.logo || ''
    },
    DEFAULT_CONFIG: {
      primaryColor: theme.primary_color,
      enableLandingPage: normalizeBoolean(theme.enable_landing_page, true)
    }
  };
  Object.keys(runtime).forEach(key => {
    Object.keys(runtime[key]).forEach(field => runtime[key][field] === undefined && delete runtime[key][field]);
  });
  window.EZ_CONFIG = mergeRuntimeConfig(window.EZ_CONFIG, runtime);
  const defaultConfig = window.EZ_CONFIG?.DEFAULT_CONFIG;
  if (defaultConfig && Object.prototype.hasOwnProperty.call(defaultConfig, 'enableLandingPage')) {
    defaultConfig.enableLandingPage = normalizeBoolean(defaultConfig.enableLandingPage, true);
  }
};

/**
 * 动态加载 config.js
 * @returns {Promise<void>} 当脚本成功加载并且 window.EZ_CONFIG 存在时 resolve
 */
function loadConfigScript(attempt = 0) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // 正常访问使用稳定版本号以利用缓存；仅重试时绕过可能损坏的缓存。
    const cacheKey = attempt === 0 ? `v=${encodeURIComponent(CONFIG_VERSION)}` : `retry=${Date.now()}`;
    script.src = `${CONFIG_FILE_NAME}?${cacheKey}`;
    script.async = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Config load timeout'));
    }, CONFIG_TIMEOUT);

    script.onload = () => {
      if (window.EZ_CONFIG && Object.keys(window.EZ_CONFIG).length > 0) {
        applyRuntimeThemeConfig();
        cleanup();
        resolve();
      } else {
        cleanup();
        reject(new Error('EZ_CONFIG is empty'));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Config script error'));
    };

    function cleanup() {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }

    document.head.appendChild(script);
  });
}

/**
 * 带重试逻辑的加载函数
 */
async function ensureConfigLoaded() {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await loadConfigScript(attempt);
      return true;
    } catch (err) {
      console.warn(`加载配置失败，正在重试(${attempt + 1}/${MAX_RETRIES})`, err);
    }
  }
  return false;
}

(async () => {
  const loaded = await ensureConfigLoaded();
  if (!loaded) {
    alert('网站配置加载失败，系统将自动刷新页面');
    // 强制从服务器重新加载，避免缓存
    location.reload(true);
    return;
  }

  // 成功加载配置后再初始化 Vue 应用
  await import('./appInit.js');
})(); 
