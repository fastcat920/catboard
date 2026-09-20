<template>
  <main class="wallet-page">
    <header class="page-intro">
      <div><span class="eyebrow">{{ copy.eyebrow }}</span><h1>{{ copy.title }}</h1><p>{{ copy.description }}</p></div>
      <button class="refresh-button" :disabled="loading" @click="load">{{ loading ? copy.loading : copy.refresh }}</button>
    </header>

    <div class="tabs" role="tablist">
      <button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" @click="tab = item.key">
        {{ item.label }} <span>{{ count(item.key) }}</span>
      </button>
    </div>

    <div v-if="loading" class="state-card">{{ copy.loading }}</div>
    <div v-else-if="error" class="state-card error">{{ error }}</div>
    <div v-else-if="!filtered.length" class="state-card">{{ copy.empty }}</div>
    <section v-else class="coupon-grid">
      <article v-for="coupon in filtered" :key="coupon.id" class="coupon-card" :class="coupon.status">
        <div class="coupon-value">
          <strong>{{ discount(coupon.template) }}</strong>
          <span>{{ minimum(coupon.template) }}</span>
        </div>
        <div class="coupon-content">
          <div class="coupon-heading"><h2>{{ localized(coupon.template, 'name') }}</h2><span>{{ statusText(coupon.status) }}</span></div>
          <p>{{ localized(coupon.template, 'description') || copy.noDescription }}</p>
          <dl>
            <div><dt>{{ copy.source }}</dt><dd>{{ sourceText(coupon.source) }}</dd></div>
            <div><dt>{{ copy.validity }}</dt><dd>{{ date(coupon.starts_at) }} – {{ date(coupon.expires_at) }}</dd></div>
          </dl>
          <button v-if="coupon.status === 'available'" @click="$router.push('/shop')">{{ copy.useNow }}</button>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchCouponWallet } from '@/api/shop';

const { locale } = useI18n();
const coupons = ref([]); const loading = ref(true); const error = ref(''); const tab = ref('available');
const en = computed(() => locale.value === 'en-US');
const copy = computed(() => en.value ? {
  eyebrow: 'Account benefits', title: 'My coupons', description: 'Eligible coupons are selected automatically at checkout, and you can choose not to use one.', refresh: 'Refresh', loading: 'Loading…', empty: 'No coupons in this category', noDescription: 'No description', source: 'Source', validity: 'Valid', useNow: 'Use now'
} : {
  eyebrow: '账户权益', title: '我的优惠券', description: '购买套餐时会自动推荐符合条件的优惠券，也可以选择不使用。', refresh: '刷新', loading: '加载中…', empty: '暂无此类优惠券', noDescription: '暂无说明', source: '来源', validity: '有效期', useNow: '立即使用'
});
const tabs = computed(() => [
  { key: 'available', label: en.value ? 'Available' : '可用' },
  { key: 'pending', label: en.value ? 'Upcoming' : '待生效' },
  { key: 'used', label: en.value ? 'Used' : '已使用' },
  { key: 'expired', label: en.value ? 'Expired' : '已过期' }
]);
const groupedStatus = status => status === 'locked' ? 'available' : status;
const filtered = computed(() => coupons.value.filter(x => groupedStatus(x.status) === tab.value));
const count = key => coupons.value.filter(x => groupedStatus(x.status) === key).length;
const localized = (row, key) => !row ? '' : (en.value ? row[`${key}_en`] : row[key]) || row[key] || row[`${key}_en`] || '';
const discount = item => {
  if (!item) return '—';
  const value = Number(item.discount_value || 0);
  return item.discount_type === 'percentage' || item.discount_type === 2 ? `${value}% OFF` : `¥${(value / 100).toFixed(2)}`;
};
const minimum = item => Number(item?.minimum_amount || 0) > 0 ? (en.value ? `Min. ¥${(item.minimum_amount / 100).toFixed(2)}` : `满 ¥${(item.minimum_amount / 100).toFixed(2)} 可用`) : (en.value ? 'No minimum' : '无门槛');
const date = value => value ? new Date(Number(value) * 1000).toLocaleDateString(en.value ? 'en-US' : 'zh-CN') : '—';
const statusText = status => ({ available: en.value ? 'Available' : '可用', locked: en.value ? 'Reserved' : '已锁定', pending: en.value ? 'Upcoming' : '待生效', used: en.value ? 'Used' : '已使用', expired: en.value ? 'Expired' : '已过期', revoked: en.value ? 'Revoked' : '已撤销' }[status] || status);
const sourceText = source => ({ manual: en.value ? 'Manual grant' : '后台手动发放', newcomer: en.value ? 'Newcomer reward' : '新人邀请奖励', referral_newcomer: en.value ? 'Newcomer reward' : '新人邀请奖励', distribution_task: en.value ? 'Platform distribution' : '平台批量发放', campaign: en.value ? 'Campaign reward' : '邀请活动奖励' }[source] || source || '—');
const load = async () => { loading.value = true; error.value = ''; try { const result = await fetchCouponWallet(); coupons.value = Array.isArray(result.data) ? result.data : []; } catch (e) { error.value = e.response?.message || e.message || (en.value ? 'Failed to load coupons' : '优惠券加载失败'); } finally { loading.value = false; } };
onMounted(load);
</script>

<style scoped lang="scss">
.wallet-page{max-width:1040px;margin:0 auto;padding:18px 20px 48px;color:var(--text-color)}.page-intro{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:24px}.eyebrow{color:var(--theme-color);font-size:13px;font-weight:700}.page-intro h1{font-size:30px;margin:6px 0}.page-intro p{margin:0;color:var(--secondary-text-color);max-width:680px}.refresh-button,.coupon-content button{border:0;border-radius:12px;background:var(--theme-color);color:#fff;padding:11px 18px;font-weight:700}.tabs{display:flex;gap:8px;overflow:auto;margin-bottom:20px}.tabs button{border:1px solid var(--border-color);background:var(--card-background);color:var(--text-color);padding:10px 15px;border-radius:12px;white-space:nowrap}.tabs button.active{background:var(--theme-color);border-color:var(--theme-color);color:#fff}.tabs span{opacity:.72;margin-left:5px}.coupon-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.coupon-card{display:grid;grid-template-columns:150px 1fr;background:var(--card-background);border:1px solid var(--border-color);border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(28,42,72,.06)}.coupon-value{background:linear-gradient(145deg,var(--theme-color),rgba(var(--theme-color-rgb),.72));color:#fff;display:flex;flex-direction:column;justify-content:center;padding:22px}.coupon-value strong{font-size:27px}.coupon-value span{font-size:12px;margin-top:7px}.coupon-content{padding:20px}.coupon-heading{display:flex;justify-content:space-between;gap:12px}.coupon-heading h2{font-size:18px;margin:0}.coupon-heading span{font-size:12px;color:var(--theme-color);white-space:nowrap}.coupon-content p{min-height:38px;color:var(--secondary-text-color);font-size:13px}.coupon-content dl{font-size:12px}.coupon-content dl div{display:flex;justify-content:space-between;gap:14px;margin:7px 0}.coupon-content dt{color:var(--secondary-text-color)}.coupon-content dd{margin:0;text-align:right}.coupon-card.used,.coupon-card.expired,.coupon-card.revoked{filter:saturate(.15);opacity:.7}.state-card{background:var(--card-background);border:1px solid var(--border-color);border-radius:18px;padding:50px;text-align:center}.state-card.error{color:#d94b4b}@media(max-width:760px){.wallet-page{padding:8px 10px 100px}.page-intro{align-items:flex-start}.page-intro h1{font-size:25px}.coupon-grid{grid-template-columns:1fr}.coupon-card{grid-template-columns:112px 1fr}.coupon-value{padding:16px}.coupon-value strong{font-size:21px}}
</style>
