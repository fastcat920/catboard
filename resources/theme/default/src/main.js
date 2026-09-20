// 默认主题启动入口：业务默认值随主题编译，后台主题配置通过页面直接注入。
localStorage.removeItem('savedPassword');

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  return fallback;
};

const valueOr = (value, fallback) => typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
const theme = window.CATBOARD_THEME || {};
const primaryColor = /^#[0-9a-f]{6}$/i.test(theme.primary_color || '') ? theme.primary_color : '#4566AE';

window.EZ_CONFIG = {
  SITE_CONFIG: {
    siteName: theme.title || theme.site_name,
    siteDescription: theme.description,
    showLogo: normalizeBoolean(theme.show_logo, true),
    logo: theme.logo || ''
  },
  DEFAULT_CONFIG: {
    defaultLanguage: ['zh-CN', 'en-US'].includes(theme.default_language) ? theme.default_language : 'zh-CN',
    defaultTheme: ['light', 'dark'].includes(theme.default_theme) ? theme.default_theme : 'light',
    primaryColor,
    enableLandingPage: normalizeBoolean(theme.enable_landing_page, true)
  },
  CLIENT_CONFIG: {
    showDownloadCard: normalizeBoolean(theme.show_download_card, true),
    showIOS: normalizeBoolean(theme.show_ios, true),
    showAndroid: normalizeBoolean(theme.show_android, true),
    showMacOS: normalizeBoolean(theme.show_macos, true),
    showWindows: normalizeBoolean(theme.show_windows, true),
    showLinux: normalizeBoolean(theme.show_linux, false),
    showOpenWrt: normalizeBoolean(theme.show_openwrt, false),
    clientLinks: {
      ios: valueOr(theme.client_link_ios, '/#/docs/13'),
      android: valueOr(theme.client_link_android, '/#/docs/2'),
      macos: valueOr(theme.client_link_macos, '/#/docs/5'),
      windows: valueOr(theme.client_link_windows, '/#/docs/3'),
      linux: valueOr(theme.client_link_linux, 'https://github.com/xxx/releases/latest'),
      openwrt: valueOr(theme.client_link_openwrt, 'https://github.com/xxx/releases/latest')
    }
  },
  CUSTOMER_SERVICE_CONFIG: {
    enabled: normalizeBoolean(theme.customer_service_enabled, false),
    type: ['crisp', 'other'].includes(theme.customer_service_type) ? theme.customer_service_type : 'crisp',
    customHtml: theme.customer_service_html || '',
    embedMode: ['popup', 'embed'].includes(theme.customer_service_embed_mode) ? theme.customer_service_embed_mode : 'embed',
    showWhenNotLoggedIn: normalizeBoolean(theme.customer_service_guest_visible, true)
  }
};

import('./appInit.js');
