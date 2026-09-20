<template>
  <main class="membership-page">
    <div v-if="loading" class="state">{{ text.loading }}</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else>
      <section class="hero">
        <div><span>{{ text.membership }}</span><h1>{{ levelName(program.level) || text.normal }}</h1><p>{{ levelDescription(program.level) || text.normalDescription }}</p></div>
        <div class="benefits">
          <div><small>{{ text.commission }}</small><strong>{{ program.level?.commission_rate ?? program.setting?.base_commission_rate ?? 0 }}%</strong></div>
          <div><small>{{ text.discount }}</small><strong>{{ program.level?.member_discount ?? 0 }}%</strong></div>
          <div><small>{{ text.effective }}</small><strong>{{ program.effective_invites || 0 }}</strong></div>
        </div>
      </section>

      <section v-if="program.next_level" class="progress-card">
        <div class="progress-heading"><div><small>{{ text.next }}</small><h2>{{ levelName(program.next_level) }}</h2></div><strong>{{ current }}/{{ program.next_level.required_invites }}</strong></div>
        <div class="progress"><i :style="{ width: `${progress}%` }"></i></div>
        <p>{{ text.remaining.replace('{count}', remaining) }}</p>
      </section>

      <section class="rights-card">
        <h2>{{ text.rights }}</h2>
        <div class="rights-grid">
          <article><span>↗</span><div><h3>{{ text.commission }}</h3><p>{{ text.commissionDesc }}</p></div></article>
          <article><span>％</span><div><h3>{{ text.discount }}</h3><p>{{ text.discountDesc }}</p></div></article>
          <article><span>★</span><div><h3>{{ text.rewards }}</h3><p>{{ text.rewardsDesc }}</p></div></article>
          <article><span>⌛</span><div><h3>{{ text.validity }}</h3><p>{{ expiry }}</p></div></article>
        </div>
        <button @click="$router.push('/invite')">{{ text.invite }}</button>
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
const text = computed(() => en.value ? { loading:'Loading…',membership:'Membership level',normal:'Member',normalDescription:'Invite friends to unlock more benefits.',commission:'Commission rate',discount:'Member discount',effective:'Qualified referrals',next:'Next level',remaining:'Complete {count} more qualified referrals to upgrade.',rights:'Your benefits',commissionDesc:'Earn commission from qualified referral orders.',discountDesc:'Your level discount is applied automatically to eligible plans.',rewards:'Milestone rewards',rewardsDesc:'Unlock balance, traffic and subscription duration rewards.',validity:'Level validity',permanent:'Permanent',invite:'Go to referral center' } : { loading:'加载中…',membership:'会员等级',normal:'普通会员',normalDescription:'邀请好友并完成有效首购，即可解锁更多权益。',commission:'返佣比例',discount:'会员优惠',effective:'有效邀请',next:'下一等级',remaining:'再完成 {count} 个有效邀请即可升级。',rights:'我的等级权益',commissionDesc:'好友完成符合条件的订单后获得推广佣金。',discountDesc:'购买符合条件的套餐时自动享受当前等级优惠。',rewards:'里程碑奖励',rewardsDesc:'达到邀请目标可获得余额、流量和套餐时长奖励。',validity:'等级有效期',permanent:'永久有效',invite:'前往邀请中心' });
const current = computed(() => Number(program.value.effective_invites || 0));
const remaining = computed(() => Math.max(0, Number(program.value.next_level?.required_invites || 0) - current.value));
const progress = computed(() => Math.min(100, current.value / Math.max(1, Number(program.value.next_level?.required_invites || 1)) * 100));
const levelName = row => !row ? '' : (en.value ? row.name_en : row.name) || row.name || row.name_en;
const levelDescription = row => !row ? '' : (en.value ? row.description_en : row.description) || row.description || row.description_en;
const expiry = computed(() => program.value.level_expires_at ? new Date(Number(program.value.level_expires_at) * 1000).toLocaleString(en.value ? 'en-US' : 'zh-CN') : text.value.permanent);
onMounted(async()=>{try{const result=await getInviteData();program.value=result.data?.program||{};}catch(e){error.value=e.response?.message||e.message;}finally{loading.value=false;}});
</script>

<style scoped lang="scss">
.membership-page{max-width:980px;margin:0 auto;padding:18px 20px 50px;color:var(--text-color)}.hero{display:flex;justify-content:space-between;gap:30px;padding:34px;border-radius:24px;background:linear-gradient(135deg,#263d78,var(--theme-color));color:white;box-shadow:0 18px 45px rgba(38,61,120,.2)}.hero span,.hero small{opacity:.76}.hero h1{font-size:34px;margin:8px 0}.hero p{max-width:480px;margin:0;opacity:.82}.benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;min-width:390px}.benefits div{display:flex;flex-direction:column;justify-content:center;padding:16px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(255,255,255,.1)}.benefits strong{font-size:23px;margin-top:8px}.progress-card,.rights-card{margin-top:18px;background:var(--card-background);border:1px solid var(--border-color);border-radius:20px;padding:24px}.progress-heading{display:flex;justify-content:space-between;align-items:center}.progress-heading h2{margin:4px 0}.progress{height:10px;background:rgba(var(--theme-color-rgb),.12);border-radius:20px;overflow:hidden}.progress i{display:block;height:100%;background:var(--theme-color);border-radius:inherit}.progress-card p{color:var(--secondary-text-color);margin-bottom:0}.rights-card h2{margin-top:0}.rights-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.rights-grid article{display:flex;gap:14px;padding:18px;border-radius:16px;background:rgba(var(--theme-color-rgb),.06)}.rights-grid article>span{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:12px;background:var(--theme-color);color:#fff}.rights-grid h3{margin:0 0 5px;font-size:16px}.rights-grid p{margin:0;color:var(--secondary-text-color);font-size:13px}.rights-card button{margin-top:20px;border:0;border-radius:12px;padding:12px 18px;background:var(--theme-color);color:#fff;font-weight:700}@media(max-width:760px){.membership-page{padding:8px 10px 100px}.hero{display:block;padding:24px}.benefits{min-width:0;margin-top:22px}.rights-grid{grid-template-columns:1fr}.hero h1{font-size:28px}}
</style>
