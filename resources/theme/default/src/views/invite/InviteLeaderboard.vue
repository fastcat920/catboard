<template>
  <main class="leaderboard-page">
    <section class="leaderboard-card">
      <div class="period-tabs">
        <button v-for="option in periods" :key="option.value" type="button" :class="{ active: period === option.value }" @click="changePeriod(option.value)">{{ option.label }}</button>
      </div>

      <div v-if="loading" class="state">{{ $t('invite.leaderboard.loading') }}</div>
      <div v-else-if="error" class="state error"><span>{{ error }}</span><button type="button" @click="load">{{ $t('common.retry') }}</button></div>
      <div v-else-if="!enabled" class="state">{{ $t('invite.leaderboard.disabled') }}</div>
      <template v-else>
        <div v-if="rules.length" class="reward-panel">
          <div class="reward-title"><IconGift :size="20" />{{ $t('invite.leaderboard.rewards') }}</div>
          <div class="reward-rules">
            <span v-for="(rule, index) in rules" :key="index">{{ ruleText(rule) }}</span>
          </div>
        </div>
        <div v-else-if="period !== 'total'" class="reward-panel muted">{{ $t('invite.leaderboard.noRewards') }}</div>

        <div v-if="rows.length" class="ranking-list">
          <article v-for="row in rows" :key="row.rank" :class="{ me: row.is_me, podium: row.rank <= 3 }">
            <div class="rank" :class="`rank-${row.rank}`">{{ row.rank }}</div>
            <div class="identity"><strong>{{ row.email }}</strong><small v-if="row.is_me">{{ $t('invite.leaderboard.me') }}</small></div>
            <div class="metric"><strong>{{ row.value }}</strong><small>{{ $t('invite.leaderboard.effectiveInvites') }}</small></div>
            <div class="reward"><strong>{{ row.reward_value > 0 ? `¥${money(row.reward_value)}` : '—' }}</strong><small>{{ $t('invite.leaderboard.reward') }}</small></div>
          </article>
        </div>
        <div v-else class="state compact">{{ $t('invite.leaderboard.empty') }}</div>
      </template>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconGift } from '@tabler/icons-vue';
import { getInviteLeaderboard } from '@/api/invite';

const { t } = useI18n();
const period = ref('month');
const rows = ref([]);
const rules = ref([]);
const enabled = ref(true);
const loading = ref(true);
const error = ref('');
const periods = computed(() => [
  { value: 'week', label: t('invite.leaderboard.periods.week') },
  { value: 'month', label: t('invite.leaderboard.periods.month') },
  { value: 'total', label: t('invite.leaderboard.periods.total') }
]);
const money = cents => (Number(cents || 0) / 100).toFixed(2);
const ruleText = rule => {
  const from = Number(rule.rank_from || 1);
  const to = Number(rule.rank_to || from);
  const min = Number(rule.min_value || 0);
  const rank = from === to
    ? t('invite.leaderboard.ruleRank', { rank: from })
    : t('invite.leaderboard.ruleRange', { from, to });
  const threshold = min > 0 ? t('invite.leaderboard.ruleThreshold', { count: min }) : '';
  return `${rank}${threshold} · ¥${money(rule.reward_value)}`;
};
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await getInviteLeaderboard(period.value);
    rows.value = Array.isArray(response?.data) ? response.data : [];
    rules.value = Array.isArray(response?.reward_rules) ? response.reward_rules : [];
    enabled.value = response?.enabled !== false;
  } catch (requestError) {
    error.value = requestError?.response?.data?.message || requestError?.message || t('invite.leaderboard.loadFailed');
  } finally {
    loading.value = false;
  }
};
const changePeriod = value => { if (period.value !== value) { period.value = value; load(); } };
onMounted(load);
</script>

<style scoped lang="scss">
.leaderboard-page { width: 100%; max-width: var(--page-max-width); margin: 0 auto; padding: 18px 0 60px; color: var(--text-color); }
.leaderboard-card { overflow: hidden; border: 1px solid var(--border-color); border-radius: 20px; background: var(--card-background); }
.period-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 8px; border-bottom: 1px solid var(--border-color); background: rgba(var(--theme-color-rgb), .04); }
.period-tabs button { min-height: 42px; color: var(--secondary-text-color); border: 0; border-radius: 12px; background: transparent; font-weight: 600; cursor: pointer; }
.period-tabs button.active { color: #fff; background: var(--theme-color); box-shadow: 0 5px 14px rgba(var(--theme-color-rgb), .22); }
.state { display: flex; min-height: 280px; align-items: center; justify-content: center; gap: 12px; color: var(--secondary-text-color); }
.state.compact { min-height: 180px; }
.state.error { color: #dc3545; }
.state button { padding: 8px 13px; color: var(--theme-color); border: 1px solid rgba(var(--theme-color-rgb), .25); border-radius: 10px; background: transparent; }
.reward-panel { margin: 18px; padding: 16px; border-radius: 16px; background: linear-gradient(135deg, rgba(var(--theme-color-rgb), .14), rgba(var(--theme-color-rgb), .05)); }
.reward-panel.muted { color: var(--secondary-text-color); text-align: center; }
.reward-title { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.reward-rules { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.reward-rules span { padding: 7px 10px; border: 1px solid rgba(var(--theme-color-rgb), .14); border-radius: 10px; background: var(--card-background); font-size: 13px; }
.ranking-list { padding: 0 18px 18px; }
.ranking-list article { display: grid; grid-template-columns: 48px minmax(0, 1fr) 130px 130px; align-items: center; gap: 12px; min-height: 70px; padding: 10px 14px; border-bottom: 1px solid var(--border-color); }
.ranking-list article:last-child { border-bottom: 0; }
.ranking-list article.me { margin-block: 4px; border: 1px solid rgba(var(--theme-color-rgb), .28); border-radius: 14px; background: rgba(var(--theme-color-rgb), .07); }
.rank { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; color: var(--secondary-text-color); border-radius: 50%; background: rgba(var(--theme-color-rgb), .08); font-weight: 800; }
.rank-1 { color: #8a5b00; background: #ffe6a3; }.rank-2 { color: #5f6873; background: #e9edf2; }.rank-3 { color: #8a4d2a; background: #f4d0ba; }
.identity { min-width: 0; }.identity strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.identity small { color: var(--theme-color); }
.metric,.reward { text-align: right; }.metric strong,.reward strong { display: block; font-size: 16px; }.metric small,.reward small { color: var(--secondary-text-color); font-size: 12px; }
@media (max-width: 700px) {
  .leaderboard-page { padding: 8px 10px 100px; }
  .reward-panel { margin: 12px; }
  .ranking-list { padding: 0 12px 12px; }
  .ranking-list article { grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; padding-inline: 6px; }
  .metric { text-align: right; }
  .reward { grid-column: 2 / 4; display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: -8px; }
  .reward strong { order: 2; color: var(--theme-color); }
}
</style>
