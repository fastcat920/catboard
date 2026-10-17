import { SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Form, InputNumber, Radio, Row, Select, Switch, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { fetchReferralDashboard, saveReferralSetting, type CouponTemplateOption, type ReferralSetting } from '@/api/services/referral'
import { unwrap } from '@/api/request'
import { message } from '@/app/staticApi'

interface SettingForm {
  enabled: boolean
  first_order_min: number
  invitee_reward: number
  newcomer_coupon_template_id?: number
  base_commission_rate: number
  freeze_days: number
  monthly_reward_limit?: number
  allow_no_plan_rewards: boolean
  no_active_plan_reward_policy: 'block_inviter_commission' | 'block_invitee_rewards' | 'block_both'
}

export function SettingsTab() {
  const [form] = Form.useForm<SettingForm>()
  const [templates, setTemplates] = useState<CouponTemplateOption[]>([])
  const [loading, setLoading] = useState(true)
  const allowNoPlan = Form.useWatch('allow_no_plan_rewards', form)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void unwrap(fetchReferralDashboard()).then((dashboard) => {
        const setting = dashboard.setting
        setTemplates(dashboard.coupon_templates ?? [])
        form.setFieldsValue({
          enabled: Boolean(setting.enabled),
          first_order_min: (setting.first_order_min || 0) / 100,
          invitee_reward: (setting.invitee_reward || 0) / 100,
          newcomer_coupon_template_id: setting.newcomer_coupon_template_id ?? undefined,
          base_commission_rate: setting.base_commission_rate || 0,
          freeze_days: setting.freeze_days || 0,
          monthly_reward_limit: setting.monthly_reward_limit == null ? undefined : setting.monthly_reward_limit / 100,
          allow_no_plan_rewards: (setting.no_active_plan_reward_policy ?? 'allow_all') === 'allow_all',
          no_active_plan_reward_policy: setting.no_active_plan_reward_policy === 'block_inviter_commission' || setting.no_active_plan_reward_policy === 'block_invitee_rewards' ? setting.no_active_plan_reward_policy : 'block_both',
        })
      }).finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [form])

  const save = async () => {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const payload: Omit<ReferralSetting, 'id'> = {
        enabled: values.enabled,
        first_order_min: Math.round(values.first_order_min * 100),
        invitee_reward: Math.round(values.invitee_reward * 100),
        newcomer_coupon_template_id: values.newcomer_coupon_template_id ?? null,
        base_commission_rate: values.base_commission_rate,
        freeze_days: values.freeze_days,
        monthly_reward_limit: values.monthly_reward_limit == null ? null : Math.round(values.monthly_reward_limit * 100),
        no_active_plan_reward_policy: values.allow_no_plan_rewards ? 'allow_all' : values.no_active_plan_reward_policy,
      }
      await unwrap(saveReferralSetting(payload))
      message.success('邀请奖励规则已保存')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="基础奖励规则" loading={loading}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="enabled" label="邀请计划" valuePropName="checked"><Switch checkedChildren="已启用" unCheckedChildren="已停用" /></Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="first_order_min" label="有效首单最低金额（元）" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="invitee_reward" label="被邀请人首单奖励（元）" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="base_commission_rate" label="基础返佣比例（%）" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="freeze_days" label="奖励冻结天数" rules={[{ required: true }]}><InputNumber min={0} max={365} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="monthly_reward_limit" label="每人每月额外奖励上限（元）"><InputNumber min={0} precision={2} className="w-100" placeholder="留空不限" /></Form.Item></Col>
          <Col xs={24} md={12}>
            <Form.Item name="newcomer_coupon_template_id" label="新人首单优惠券模板">
              <Select allowClear placeholder="不发放优惠券" options={templates.map((template) => ({ value: template.id, label: template.name }))} />
            </Form.Item>
            <Typography.Paragraph type="secondary">受邀用户注册后直接发放到“我的优惠券”，有效期以优惠券模板为准。</Typography.Paragraph>
          </Col>
        </Row>
        <Card size="small" title="无有效套餐用户的奖励资格" className="mb-3">
          <Form.Item name="allow_no_plan_rewards" valuePropName="checked" className="mb-2"><Switch checkedChildren="允许" unCheckedChildren="限制" /></Form.Item>
          <Alert type="info" showIcon message="奖励资格在被邀请人注册并绑定邀请关系时锁定，后续套餐状态变化不会改变。" />
          {!allowNoPlan && (
            <Form.Item name="no_active_plan_reward_policy" label="无有效套餐时不发放范围" className="mt-3 mb-0">
              <Radio.Group>
                <Radio value="block_inviter_commission">邀请人不发放订单返佣</Radio>
                <Radio value="block_invitee_rewards">被邀请人不发放新人奖励</Radio>
                <Radio value="block_both">双方都不发放</Radio>
              </Radio.Group>
            </Form.Item>
          )}
        </Card>
        <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={() => void save()}>保存规则</Button>
      </Form>
    </Card>
  )
}
