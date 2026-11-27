const requestMessages = {
  'zh-CN': {
    missingOrderNumber: '订单号不能为空',
    configError: '请求配置错误',
    responseError: '响应数据处理错误',
    sessionExpired: '登录已过期，请重新登录',
    badRequest: '请求参数错误',
    unauthorized: '未授权，请重新登录',
    forbidden: '拒绝访问',
    notFound: '请求的资源不存在',
    failed: '请求失败',
    timeout: '请求超时',
    network: '网络错误，请检查您的网络连接'
  },
  'en-US': {
    missingOrderNumber: 'An order number is required',
    configError: 'Request configuration error',
    responseError: 'Failed to process response data',
    sessionExpired: 'Your session has expired. Please sign in again',
    badRequest: 'Invalid request parameters',
    unauthorized: 'Unauthorized. Please sign in again',
    forbidden: 'Access denied',
    notFound: 'The requested resource was not found',
    failed: 'Request failed',
    timeout: 'Request timed out',
    network: 'Network error. Please check your connection'
  }
};
export const requestMessageForLocale = (locale, key) =>
  (requestMessages[locale] || requestMessages['zh-CN'])[key];

export function localizeRequestError(error, locale) {
  const translate = key => requestMessageForLocale(locale, key);
  const response = error.response;
  const serverMessage = response?.data?.message;
  let message;
  if (response) {
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      message = serverMessage;
    } else {
      const key = { 400: 'badRequest', 401: 'unauthorized', 403: 'forbidden', 404: 'notFound', 422: 'badRequest' }[response.status];
      message = key ? translate(key) : `${translate('failed')} (${response.status})`;
    }
    // Keep both access patterns used by the existing views and preserve Axios metadata.
    response.message = message;
  } else if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) || /timeout/i.test(error.message || '')) {
    message = translate('timeout');
  } else if (error.code === 'ERR_NETWORK' || /Network Error/i.test(error.message || '')) {
    message = translate('network');
  } else {
    message = translate('configError');
  }
  error.message = message;
  return error;
}
