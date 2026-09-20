<template>
  <main class="membership-page">
    <div v-if="loading" class="state">{{ text.loading }}</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else>
      <section class="hero">
        <div><span>{{ text.membership }}</span><h1>{{ levelName(program.level) || text.normal }}</h1><p>{{ levelDescription(program.level) || text.normalDescription }}</p></div>
        <div class="benefits">
          <div><small>{{ text.commission }}</small><strong>{{ program.commission_rate ?? program.level?.commission_rate ?? program.setting?.base_commission_rate ?? 0 }}%</strong></div>
          <div><small>{{ text.discount }}</small><strong>{{ program.level?.member_discount ?? 0 }}%</strong></div>
          <div><small>{{ text.effective }}</small><strong>{{ program.effective_invites || 0 }}</strong></div>
          <div><small>{{ text.revenue }}</small><strong>¥{{ revenue }}</strong></div>
          <div class="validity-benefit"><small>{{ text.validity }}</small><strong>{{ expiry }}</strong></div>
        </div>
      </section>

      <section v-if="program.next_level" class="progress-card">
        <div class="progress-heading"><div><small>{{ text.next }}</small><h2>{{ levelName(program.next_level) }}</h2></div><strong>{{ current }}/{{ program.next_level.required_invites }} · ¥{{ revenue }}/¥{{ requiredRevenue }}</strong></div>
        <div class="next-benefits">
          <span>{{ text.nextCommission }} <strong>{{ program.next_level.commission_rate ?? 0 }}%</strong></span>
          <span>{{ text.nextDiscount }} <strong>{{ program.next_level.member_discount ?? 0 }}%</strong></span>
        </div>
        <div class="progress"><i :style="{ width: `${progress}%` }"></i></div>
        <p>{{ text.remaining.replace('{count}', remaining).replace('{amount}', remainingRevenue) }}</p>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getInviteData } from '@/api/invite';
const { locale } = useI18n(); const loading = ref(true); const error = ref(''); const program = ref({});
const en = computed(() => locale.value === 'en-US');
const text = computed(() => en.value ? { loading:'Loading…',membership:'Membership level',normal:'Member',normalDescription:'Invite friends to unlock more benefits.',commission:'Commission rate',discount:'Plan discount',effective:'Qualified referrals',revenue:'Referral revenue',next:'Next level',nextCommission:'Commission rate',nextDiscount:'Plan discount',remaining:'Complete {count} more qualified referrals and ¥{amount} more revenue to upgrade.',validity:'Level validity',permanent:'Permanent' } : { loading:'加载中…',membership:'会员等级',normal:'普通会员',normalDescription:'邀请好友并完成有效首购，即可解锁更多权益。',commission:'返佣比例',discount:'套餐优惠',effective:'有效邀请',revenue:'邀请成交额',next:'下一等级',nextCommission:'佣金比例',nextDiscount:'套餐优惠',remaining:'还需 {count} 个有效邀请和 ¥{amount} 成交额即可升级。',validity:'等级有效期',permanent:'永久有效' });
const current = computed(() => Number(program.value.effective_invites || 0));
const revenueCents = computed(() => Number(program.value.referral_revenue || 0));
const revenue = computed(() => (revenueCents.value / 100).toFixed(2));
const requiredRevenueCents = computed(() => Number(program.value.next_level?.required_revenue || 0));
const requiredRevenue = computed(() => (requiredRevenueCents.value / 100).toFixed(2));
const remaining = computed(() => Math.max(0, Number(program.value.next_level?.required_invites || 0) - current.value));
const remainingRevenue = computed(() => (Math.max(0, requiredRevenueCents.value - revenueCents.value) / 100).toFixed(2));
const progress = computed(() => Math.min(100, current.value / Math.max(1, Number(program.value.next_level?.required_invites || 1)) * 100, requiredRevenueCents.value ? revenueCents.value / requiredRevenueCents.value * 100 : 100));
const levelName = row => !row ? '' : (en.value ? row.name_en : row.name) || row.name || row.name_en;
const levelDescription = row => !row ? '' : (en.value ? row.description_en : row.description) || row.description || row.description_en;
const expiry = computed(() => program.value.level_expires_at ? new Date(Number(program.value.level_expires_at) * 1000).toLocaleString(en.value ? 'en-US' : 'zh-CN') : text.value.permanent);
onMounted(async()=>{try{const result=await getInviteData();program.value=result.data?.program||{};}catch(e){error.value=e.response?.message||e.message;}finally{loading.value=false;}});
</script>

<style scoped lang="scss">
.membership-page{max-width:980px;margin:0 auto;padding:18px 20px 50px;color:var(--text-color)}.hero{display:flex;justify-content:space-between;gap:30px;padding:34px;border-radius:24px;background:linear-gradient(135deg,#263d78,var(--theme-color));color:white;box-shadow:0 18px 45px rgba(38,61,120,.2)}.hero span,.hero small{opacity:.76}.hero h1{font-size:34px;margin:8px 0}.hero p{max-width:480px;margin:0;opacity:.82}.benefits{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;min-width:390px}.benefits div{display:flex;flex-direction:column;justify-content:center;padding:16px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(255,255,255,.1)}.benefits strong{font-size:23px;margin-top:8px}.benefits .validity-benefit{grid-column:1/-1}.benefits .validity-benefit strong{font-size:16px}.progress-card{margin-top:18px;background:var(--card-background);border:1px solid var(--border-color);border-radius:20px;padding:24px}.progress-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.progress-heading>strong{text-align:right}.progress-heading h2{margin:4px 0}.next-benefits{display:flex;gap:10px;margin:18px 0 12px}.next-benefits span{padding:9px 12px;border-radius:10px;color:var(--secondary-text-color);background:rgba(var(--theme-color-rgb),.08)}.next-benefits strong{margin-left:5px;color:var(--theme-color)}.progress{height:10px;background:rgba(var(--theme-color-rgb),.12);border-radius:20px;overflow:hidden}.progress i{display:block;height:100%;background:var(--theme-color);border-radius:inherit}.progress-card p{color:var(--secondary-text-color);margin-bottom:0}@media(max-width:760px){.membership-page{padding:8px 10px 100px}.hero{display:block;padding:24px}.benefits{min-width:0;margin-top:22px}.hero h1{font-size:28px}.progress-heading{align-items:flex-start;flex-direction:column}.progress-heading>strong{text-align:left}.next-benefits{flex-direction:column}}
</style>
