<template>
  <div class="deposit-container">
    <div class="deposit-inner">

      <!-- FastCatAPP 钱包摘要：余额 + 自动续费 -->
      <div class="wallet-summary-card">
        <div class="wallet-balance-column">
          <div class="wallet-summary-title"><span class="wallet-icon"><IconWallet :size="14" /></span>{{ $t('wallet.balance.title') }}</div>
          <div v-if="!loading.balance" class="wallet-summary-value">{{ currencySymbol }}{{ formatAmount(userBalance) }}</div>
          <div v-else class="skeleton-balance-value"></div>
        </div>
        <div class="wallet-renewal-column">
          <label class="renewal-heading">
            <span>{{ $t('wallet.autoRenewal.title') }}</span>
            <span class="switch" :class="{ disabled: loading.renewal }">
              <input type="checkbox" v-model="autoRenewal" :disabled="loading.renewal || !canEnableAutoRenewal" @change="updateAutoRenewal" />
              <span class="slider round"></span>
            </span>
          </label>
          <p>{{ hasPlan ? $t('wallet.autoRenewal.description') : $t('wallet.autoRenewal.noPlan') }}</p>
        </div>
      </div>

      <!-- 充值卡片 -->
      <div class="dashboard-card deposit-card">
        <div class="card-header">
          <h2 class="card-title">{{ $t('wallet.deposit.title') }}</h2>
        </div>
        <div class="card-body">
          <div class="deposit-notice">
            <IconAlertCircle :size="20" class="notice-icon" />
            <span>{{ $t('wallet.deposit.notice') }}</span>
          </div>

          <div v-if="loading.config || configError || presetOptions.length" class="amount-selection">
            <div class="period-cards">
              <template v-if="loading.config">
                <div v-for="i in 4" :key="`skeleton-${i}`" class="period-card skeleton-card">
                  <div class="period-card-inner">
                    <div class="skeleton-price"></div>
                  </div>
                </div>
              </template>
              <div v-else-if="configError" class="config-error">
                <span>{{ $t('wallet.deposit.configLoadFailed') }}</span>
                <button type="button" @click="fetchUserConfig">{{ $t('common.retry') }}</button>
              </div>
              <template v-else>
                <div
                  v-for="option in presetOptions"
                  :key="option.amount"
                  class="period-card"
                  :class="{ active: selectedAmount === option.amount }"
                  @click="selectAmount(option.amount)"
                >
                  <div class="period-card-inner">
                    <div class="period-price">
                      <span class="currency">{{ currencySymbol }}</span>
                      <span class="amount">{{ formatPresetAmount(option.amount) }}</span>
                    </div>
                  </div>
                  <span v-if="option.bonus > 0" class="bonus-badge">+{{ formatPresetAmount(option.bonus) }}</span>
                </div>
              </template>
            </div>
          </div>

          <div class="custom-amount">
            <label for="customAmount">{{ $t('wallet.deposit.customAmount') }}</label>
            <div v-if="loading.config" class="input-container skeleton-input">
              <div class="skeleton-input-field"></div>
            </div>
            <div v-else class="input-container">
              <span class="currency-symbol">{{ currencySymbol }}</span>
              <input
                id="customAmount"
                v-model="customAmount"
                type="number"
                min="1"
                :placeholder="$t('wallet.deposit.customAmountPlaceholder')"
                @input="onCustomAmountInput"
              />
            </div>
            <small v-if="amountError" class="error-message">{{ amountError }}</small>
          </div>

          <div class="deposit-actions">
            <div v-if="loading.config" class="btn-order-skeleton"></div>
            <button 
              v-else
              class="btn-order"
              :disabled="loading.submitting || !isValidAmount" 
              @click="handleDeposit"
            >
              <span v-if="loading.submitting" class="loader"></span>
              <span>{{ $t('wallet.deposit.button') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup name="WalletDeposit">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@/composables/useToast';
import { IconAlertCircle, IconWallet } from '@tabler/icons-vue';
import { getUserInfo, updateRemindSettings as updateUserSettings } from '@/api/user';
import { createOrderDeposit, getUserConfig } from '@/api/wallet';
import { useRouter } from 'vue-router';
import { WALLET_CONFIG } from '@/utils/baseConfig';

const { t } = useI18n();
const { showToast } = useToast();
const router = useRouter();

// 响应式数据
const userBalance = ref(0);
const autoRenewal = ref(false);
const hasPlan = ref(false);
const currencySymbol = ref('$');
const presetOptions = ref([]);
const selectedAmount = ref(null);
const customAmount = ref('');
const amountError = ref('');
const configError = ref(false);
const minimumDepositAmount = WALLET_CONFIG.minimumDepositAmount || 1;

const loading = ref({
  balance: true,
  submitting: false,
  config: true,
  renewal: false
});

const canEnableAutoRenewal = computed(() => hasPlan.value || autoRenewal.value);

// 格式化金额（分转元）
const formatAmount = (amount) => {
  return (parseFloat(amount) / 100).toFixed(2);
};

const formatPresetAmount = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const parseDepositBonusOptions = (rawOptions) => {
  if (!Array.isArray(rawOptions)) return [];
  const seenAmounts = new Set();
  return rawOptions.reduce((options, rawOption) => {
    const parts = String(rawOption ?? '').trim().split(':');
    if (parts.length !== 2) return options;
    const amount = Number(parts[0].trim());
    const bonus = Number(parts[1].trim());
    if (!Number.isFinite(amount) || !Number.isFinite(bonus) || amount <= 0 || bonus < 0 || seenAmounts.has(amount)) {
      return options;
    }
    seenAmounts.add(amount);
    options.push({ amount, bonus });
    return options;
  }, []);
};

// 获取用户配置（货币符号等）
const fetchUserConfig = async () => {
  loading.value.config = true;
  configError.value = false;
  try {
    const response = await getUserConfig();
    if (response?.data) {
      if (response.data.currency_symbol) currencySymbol.value = response.data.currency_symbol;
      presetOptions.value = parseDepositBonusOptions(response.data.deposit_bounus);
      if (!presetOptions.value.some(option => option.amount === selectedAmount.value)) {
        selectedAmount.value = null;
      }
    }
  } catch (error) {
    console.error('获取用户配置失败:', error);
    presetOptions.value = [];
    selectedAmount.value = null;
    configError.value = true;
  } finally {
    loading.value.config = false;
  }
};

// 获取用户余额
const fetchUserBalance = async () => {
  loading.value.balance = true;
  try {
    const response = await getUserInfo();
    if (response && response.data) {
      userBalance.value = response.data.balance || 0;
      autoRenewal.value = !!response.data.auto_renewal;
      hasPlan.value = Number(response.data.plan_id || 0) > 0;
    }
  } catch (error) {
    console.error('获取用户余额失败:', error);
    showToast(error.response?.message || error.message || t('common.error_occurred'), 'error');
  } finally {
    loading.value.balance = false;
  }
};

const updateAutoRenewal = async () => {
  const nextValue = autoRenewal.value;
  loading.value.renewal = true;
  try {
    await updateUserSettings({ auto_renewal: nextValue ? 1 : 0 });
    showToast(t(nextValue ? 'wallet.autoRenewal.enabled' : 'wallet.autoRenewal.disabled'), 'success');
  } catch (error) {
    autoRenewal.value = !nextValue;
    showToast(t('wallet.autoRenewal.failed'), 'error');
  } finally {
    loading.value.renewal = false;
  }
};

// 选择预设金额
const selectAmount = (amount) => {
  selectedAmount.value = amount;
  customAmount.value = '';
  amountError.value = '';
};

// 自定义金额输入验证
const onCustomAmountInput = () => {
  selectedAmount.value = null;
  if (customAmount.value === '') {
    amountError.value = '';
    return;
  }
  const amount = parseFloat(customAmount.value);
  if (isNaN(amount) || amount <= 0) {
    amountError.value = t('wallet.deposit.amountError.invalid');
  } else if (amount < minimumDepositAmount) {
    amountError.value = t('wallet.deposit.amountError.minimum', { min: minimumDepositAmount });
  } else {
    amountError.value = '';
  }
};

// 最终充值金额
const currentAmount = computed(() => {
  if (selectedAmount.value) return selectedAmount.value;
  if (customAmount.value && parseFloat(customAmount.value) >= 1) return parseFloat(customAmount.value);
  return null;
});

const isValidAmount = computed(() => currentAmount.value !== null);

// 提交充值订单
const handleDeposit = async () => {
  if (!isValidAmount.value) {
    showToast(t('wallet.deposit.amountError.required'), 'warning');
    return;
  }
  try {
    loading.value.submitting = true;
    const amountInCents = Math.round(currentAmount.value * 100);
    const response = await createOrderDeposit(amountInCents);
    if (response && response.data) {
      const orderId = response.data;
      showToast(t('wallet.deposit.success'), 'success');
      router.push({
        path: '/payment',
        query: { trade_no: orderId, type: 'deposit' }
      });
    }
  } catch (error) {
    console.error('创建充值订单失败:', error);
    showToast(error.response?.message || error.message || t('wallet.deposit.failed'), 'error');
  } finally {
    loading.value.submitting = false;
  }
};

onMounted(() => {
  fetchUserBalance();
  fetchUserConfig();
});
</script>

<style lang="scss" scoped>
.deposit-container {
  padding: 20px;
  display: flex;
  justify-content: center;
  padding-bottom: 80px;
  
  .deposit-inner {
    width: 100%;
    max-width: 900px;
  }

  .wallet-summary-card {
    display: flex;
    margin-bottom: 24px;
    padding: 16px 20px;
    align-items: center;
    gap: 16px;
    color: var(--theme-color);
    background: rgba(var(--theme-color-rgb), .12);
    border: 1px solid rgba(var(--theme-color-rgb), .28);
    border-radius: 20px;
    box-shadow: 0 6px 16px rgba(var(--theme-color-rgb), .12);
  }

  .wallet-balance-column { min-width: 0; flex: 1; }
  .wallet-summary-title { display: flex; align-items: center; gap: 8px; font-size: 14px; opacity: .88; }
  .wallet-icon { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; background: rgba(var(--theme-color-rgb), .18); border-radius: 8px; }
  .wallet-summary-value { margin-top: 8px; font-size: 28px; font-weight: 700; }

  .wallet-renewal-column {
    width: 50%;
    color: inherit;
    text-align: right;

    .renewal-heading { display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-size: 14px; font-weight: 600; }
    p { margin: 4px 0 0; color: inherit; font-size: 12px; line-height: 1.4; }
  }

  .switch {
    position: relative;
    display: inline-flex;
    width: 42px;
    height: 24px;
    flex: 0 0 auto;

    input { width: 0; height: 0; opacity: 0; }
    .slider { position: absolute; inset: 0; background: var(--switch-track-off); border-radius: 999px; box-shadow: inset 0 0 0 1px var(--switch-track-border); cursor: pointer; transition: .2s; }
    .slider::before { position: absolute; width: 18px; height: 18px; top: 3px; left: 3px; content: ''; background: var(--switch-thumb-off); border-radius: 50%; transition: .2s; }
    input:checked + .slider { background: var(--switch-track-on); box-shadow: none; }
    input:checked + .slider::before { background: var(--switch-thumb-on); }
    input:checked + .slider::before { transform: translateX(18px); }
    &.disabled { opacity: .5; }
  }
  
  .dashboard-card {
    background-color: #ffffff;
    border-radius: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid var(--card-border);
    transition: all 0.3s ease;
    
    &:hover {
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
      border-color: rgba(var(--theme-color-rgb), 0.3);
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;        // 进一步减小标题与内容间距
      
      .card-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }
    }
  }
  
  /* 余额卡片高度和内容行距压缩 */
  .balance-card {
    .card-body {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 6px 16px;         // 减少上下内边距
    }
    
    .balance-display {
      text-align: center;
      
      .balance-value {
        font-size: 2.4rem;       // 原 3rem，减小
        font-weight: bold;
        color: var(--theme-color);
        margin-bottom: 4px;       // 原 6px，减小
        text-shadow: 0 2px 4px rgba(var(--theme-color-rgb), 0.1);
      }
      
      .balance-label {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
      }
    }
    
    .balance-skeleton {
      .skeleton-balance-value {
        height: 2.2rem;
        width: 160px;
        margin: 0 auto 4px;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 20px;
        position: relative;
        overflow: hidden;
      }
      .skeleton-balance-label {
        height: 0.85rem;
        width: 120px;
        margin: 0 auto;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 6px;
        position: relative;
        overflow: hidden;
      }
    }
  }
  
  /* 充值卡片内部间距压缩 */
  .deposit-card {
    .card-body {
      display: flex;
      flex-direction: column;
      gap: 12px;                 // 原 15px，减小
    }
    
    .deposit-notice {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background-color: rgba(var(--theme-color-rgb), 0.1);
      border-radius: 20px;
      
      .notice-icon {
        color: var(--primary-color);
      }
      
      span {
        font-size: 0.85rem;
      }
    }
    
    .amount-selection {
      margin-bottom: 4px;        // 原 5px
      width: 100%;
      
      .period-cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        width: 100%;
        
        .period-card {
          position: relative;
          cursor: pointer;
          border-radius: 20px;
          overflow: visible;
          border: 2px solid var(--border-color);
          transition: all 0.3s ease;
          
          &.active {
            border-color: var(--theme-color);
            box-shadow: 0 5px 15px rgba(var(--theme-color-rgb), 0.15);
            .period-card-inner {
              background-color: rgba(var(--theme-color-rgb), 0.1);
            }
            .period-price .currency,
            .period-price .amount {
              color: var(--theme-color);
            }
          }
          
          &:hover {
            border-color: rgba(var(--theme-color-rgb), 0.5);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          }
          
          .period-card-inner {
            padding: 8px 6px;      // 原 10px 8px，进一步减小
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100%;
            transition: background-color 0.3s ease;
            border-radius: 18px;
          }
          
          .period-price {
            display: flex;
            align-items: baseline;
            justify-content: center;
            
            .currency {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-color);
              margin-right: 2px;
            }
            .amount {
              font-size: 18px;
              font-weight: 700;
              color: var(--text-color);
            }
          }

          .bonus-badge {
            position: absolute;
            top: -8px;
            right: -6px;
            z-index: 1;
            min-width: 28px;
            padding: 3px 7px;
            color: #fff;
            background: var(--danger-color, #ef4444);
            border: 2px solid var(--card-background, #fff);
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
            text-align: center;
          }
        }

        .config-error {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 56px;
          color: var(--secondary-text-color);
          font-size: 13px;

          button {
            padding: 6px 12px;
            color: var(--theme-color);
            background: transparent;
            border: 1px solid rgba(var(--theme-color-rgb), 0.35);
            border-radius: 999px;
            cursor: pointer;
          }
        }
      }
    }
    
    .custom-amount {
      margin-top: 6px;           // 原 8px
      
      label {
        display: block;
        font-size: 0.85rem;
        color: var(--secondary-text-color);
        margin-bottom: 6px;
        font-weight: 500;
      }
      
      .input-container {
        position: relative;
        display: flex;
        align-items: center;
        height: 44px;             // 原 50px，降低高度
        
        .currency-symbol {
          position: absolute;
          left: 12px;
          color: var(--text-color);
          font-weight: 600;
          font-size: 1.1rem;
        }
        
        input {
          width: 100%;
          height: 100%;
          border: 2px solid var(--border-color);
          border-radius: 10px;
          background-color: var(--input-bg, rgba(0, 0, 0, 0.02));
          padding: 0 12px 0 32px;
          font-size: 1.1rem;
          color: var(--text-color);
          transition: all 0.3s ease;
          
          &:focus {
            outline: none;
            border-color: var(--theme-color);
            box-shadow: 0 0 0 3px rgba(var(--theme-color-rgb), 0.15);
          }
        }
      }
      
      .error-message {
        display: block;
        margin-top: 6px;
        color: #ff4757;
        font-size: 0.8rem;
      }
    }
    
    .deposit-actions {
      margin-top: 12px;          // 原 15px
      display: flex;
      justify-content: center;
      
      .btn-order {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background-color: var(--theme-color);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 0 24px;
        height: 44px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 180px;
        box-shadow: 0 4px 12px rgba(var(--theme-color-rgb), 0.3);
        
        &:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 15px rgba(var(--theme-color-rgb), 0.4);
        }
        
        &:disabled {
          background-color: var(--disabled-bg, #cccccc);
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        
        .loader {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s linear infinite;
        }
      }
    }
  }
}

@media (max-width: 560px) {
  .deposit-container .wallet-summary-card { padding: 16px; }
  .deposit-container .wallet-renewal-column { width: 52%; }
  .deposit-container .wallet-summary-value { font-size: 24px; }
}

/* 响应式移动端 */
@media (max-width: 768px) {
  .deposit-container {
    padding: 20px;
    padding-bottom: 100px;
    
    .balance-card {
      .card-body {
        padding: 4px 12px;
      }
      .balance-display {
        .balance-value {
          font-size: 2rem;
          margin-bottom: 2px;
        }
        .balance-label {
          font-size: 0.75rem;
        }
      }
    }
    
    .deposit-card {
      .amount-selection .period-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .period-card-inner {
        padding: 6px 4px;
      }
      .custom-amount .input-container {
        height: 40px;
      }
      .btn-order {
        height: 42px;
        min-width: 160px;
        font-size: 0.95rem;
      }
    }
  }
}

/* 动画与骨架屏 */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.skeleton-balance-value, .skeleton-balance-label, .skeleton-price, .skeleton-input-field, .btn-order-skeleton {
  background-color: rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 30%;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0) 100%);
    transform: translateX(-100%);
    animation: shimmer 2s infinite;
  }
}
.skeleton-price {
  height: 20px;
  width: 60%;
  margin: 0 auto;
  border-radius: 6px;
}
.skeleton-input-field {
  height: 100%;
  width: 100%;
  border-radius: 10px;
}
.btn-order-skeleton {
  height: 44px;
  min-width: 180px;
  border-radius: 10px;
}
.skeleton-card {
  cursor: default;
  border: 2px solid var(--border-color);
  &:hover { transform: none; box-shadow: none; }
}
</style>

<!-- 全局暗黑模式覆盖（非 scoped） -->
<style lang="scss">
.dark .dashboard-card,
.dark-theme .dashboard-card {
  background-color: #1e293b !important;
}

.dark .balance-display .balance-label,
.dark-theme .balance-display .balance-label {
  color: #94a3b8 !important;
}

.dark .custom-amount label,
.dark-theme .custom-amount label {
  color: #94a3b8 !important;
}

.dark .input-container input,
.dark-theme .input-container input {
  background-color: rgba(255, 255, 255, 0.08) !important;
  color: #f1f5f9 !important;
  border-color: #334155 !important;
}

.dark .input-container input:focus,
.dark-theme .input-container input:focus {
  border-color: var(--theme-color) !important;
  box-shadow: 0 0 0 3px rgba(var(--theme-color-rgb), 0.2) !important;
}

.dark .deposit-notice,
.dark-theme .deposit-notice {
  background-color: rgba(var(--theme-color-rgb), 0.15) !important;
}

.dark .period-card .period-price .currency,
.dark .period-card .period-price .amount,
.dark-theme .period-card .period-price .currency,
.dark-theme .period-card .period-price .amount {
  color: #cbd5e1 !important;
}

.dark .period-card.active .period-price .currency,
.dark .period-card.active .period-price .amount,
.dark-theme .period-card.active .period-price .currency,
.dark-theme .period-card.active .period-price .amount {
  color: var(--theme-color) !important;
}

.dark .skeleton-balance-value,
.dark .skeleton-balance-label,
.dark .skeleton-price,
.dark .skeleton-input-field,
.dark .btn-order-skeleton,
.dark-theme .skeleton-balance-value,
.dark-theme .skeleton-balance-label,
.dark-theme .skeleton-price,
.dark-theme .skeleton-input-field,
.dark-theme .btn-order-skeleton {
  background-color: rgba(255, 255, 255, 0.08) !important;
  &::after {
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%);
  }
}
</style>
