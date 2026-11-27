import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localizeRequestError } from '../src/api/utils/requestError.mjs';

const useCases = [
  'The current required minimum withdrawal commission is :limit',
  'There is not enough subscription time left to start the next period',
  'The selected coupon cannot be used for this order',
];

for (const locale of ['zh-CN', 'en-US']) {
  const messages = JSON.parse(readFileSync(new URL(`../../../lang/${locale}.json`, import.meta.url)));
  test(`${locale}: HTTP errors expose the translated business message to all views`, () => {
    for (const key of useCases) {
      const message = messages[key].replace(':limit', '¥100');
      const error = Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { message } },
      });
      assert.equal(localizeRequestError(error, locale), error);
      assert.equal(error.message, message);
      assert.equal(error.response.message, message);
      assert.equal(/[\u3400-\u9fff]/u.test(message), locale === 'zh-CN');
    }
  });

  test(`${locale}: gateway errors and timeouts use the theme language`, () => {
    const gateway = Object.assign(new Error(), { response: { status: 502, data: '<html>' } });
    assert.equal(
      localizeRequestError(gateway, locale).message,
      locale === 'zh-CN' ? '请求失败 (502)' : 'Request failed (502)',
    );
    const timeout = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ETIMEDOUT' });
    assert.equal(
      localizeRequestError(timeout, locale).message,
      locale === 'zh-CN' ? '请求超时' : 'Request timed out',
    );
  });
}
