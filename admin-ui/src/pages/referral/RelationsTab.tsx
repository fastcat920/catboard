import { EyeOutlined, ReloadOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Input, InputNumber, Modal, Pagination, Segmented, Select, Space, Table, Tag, Typography, type TableColumnsType } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import {
  changeReferralRelation,
  fetchReferralRelationDetail,
  fetchReferralRelations,
  fetchReferralRewards,
  reverseReferralReward,
  type ReferralRelation,
  type ReferralRelationDetail,
  type ReferralReward,
  type RewardType,
} from '@/api/services/referral'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'

const dateTime = (value?: number | null) => value ? new Date(value * 1000).toLocaleString('zh-CN', { hour12: false }) : '--'
const REWARD_TYPES: Record<RewardType, string> = {
  none: '无', effective_invite: '有效邀请', balance: '账户余额奖励', commission_balance: '佣金奖励', level: '成长等级调整', traffic: '流量奖励', duration: '套餐时长奖励',
}
const REWARD_STATUS = {
  granted: { label: '已发放', color: 'success' }, pending: { label: '待发放', color: 'warning' }, reversed: { label: '已撤销', color: 'default' }, rejected: { label: '已拒绝', color: 'error' },
} as const

function rewardValue(row: ReferralReward) {
  if (row.reward_type === 'effective_invite') return '--'
  if (row.reward_type === 'traffic') return `${row.reward_value} GB`
  if (row.reward_type === 'duration') return `${row.reward_value} 天`
  if (row.reward_type === 'level') return `${row.reward_value}%`
  return `¥${(row.reward_value / 100).toFixed(2)}`
}

function RelationDetailModal({ relation, open, onClose, onChanged }: { relation: ReferralRelation | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<ReferralRelationDetail | null>(null)
  const [inviterId, setInviterId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !relation) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      void unwrap(fetchReferralRelationDetail(relation.id)).then((data) => {
        setDetail(data)
        setInviterId(data.user.invite_user_id ?? null)
      }).finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, relation])

  const save = async () => {
    if (!detail) return
    setLoading(true)
    try {
      await unwrap(changeReferralRelation(detail.user.id, inviterId))
      message.success('邀请关系已更新')
      onClose()
      onChanged()
    } finally { setLoading(false) }
  }

  const orderColumns: TableColumnsType<ReferralRelationDetail['orders'][number]> = [
    { title: '订单号', dataIndex: 'trade_no' }, { title: '套餐 ID', dataIndex: 'plan_id' }, { title: '金额', dataIndex: 'total_amount', render: (value) => `¥${(value / 100).toFixed(2)}` }, { title: '状态', dataIndex: 'status' }, { title: '时间', dataIndex: 'created_at', render: dateTime },
  ]
  const rewardColumns: TableColumnsType<ReferralReward> = [
    { title: '类型', dataIndex: 'reward_type', render: (value: RewardType) => REWARD_TYPES[value] || value }, { title: '奖励', render: (_, row) => rewardValue(row) }, { title: '状态', dataIndex: 'status', render: (value: keyof typeof REWARD_STATUS) => <Tag color={REWARD_STATUS[value]?.color}>{REWARD_STATUS[value]?.label || value}</Tag> }, { title: '说明', dataIndex: 'description' }, { title: '时间', dataIndex: 'created_at', render: dateTime },
  ]

  return (
    <Modal title="邀请关系完整链路" open={open} onCancel={onClose} onOk={() => void save()} confirmLoading={loading} okText="保存关系" cancelText="关闭" width={960} destroyOnHidden>
      {detail && <>
        <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} items={[
          { key: 'user', label: '受邀用户', children: `${detail.user.email}（ID ${detail.user.id}）` },
          { key: 'inviter', label: '当前邀请人', children: detail.inviter ? `${detail.inviter.email}（ID ${detail.inviter.id}）` : '--' },
          { key: 'registered', label: '注册时间', children: dateTime(detail.user.created_at) },
          { key: 'evaluated', label: '资格判定时间', children: dateTime(detail.user.invite_reward_evaluated_at) },
        ]} />
        <Typography.Title level={5} className="mt-4">订单链路</Typography.Title>
        <Table rowKey="id" size="small" columns={orderColumns} dataSource={detail.orders} pagination={false} scroll={{ x: 720 }} />
        <Typography.Title level={5} className="mt-4">奖励链路</Typography.Title>
        <Table rowKey="id" size="small" columns={rewardColumns} dataSource={detail.rewards} pagination={false} scroll={{ x: 780 }} />
        <div className="mt-4">
          <Typography.Text strong>调整邀请人用户 ID</Typography.Text>
          <InputNumber value={inviterId} onChange={(value) => setInviterId(value)} min={1} className="w-100 mt-2" placeholder="留空为解除邀请关系" />
          <Typography.Paragraph type="secondary" className="mt-2">已产生有效奖励的关系需先撤销相关奖励，避免账务不一致。</Typography.Paragraph>
        </div>
      </>}
    </Modal>
  )
}

export function RelationsTab() {
  const [view, setView] = useState<'relations' | 'rewards'>('relations')
  const [relations, setRelations] = useState<ReferralRelation[]>([])
  const [rewards, setRewards] = useState<ReferralReward[]>([])
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [rewardType, setRewardType] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailRelation, setDetailRelation] = useState<ReferralRelation | null>(null)

  // oxlint-disable react/memo-dependencies -- 列表视图和筛选条件都属于请求参数。
  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (view === 'relations') {
        const response = await fetchReferralRelations({ current, pageSize, keyword, status })
        if (response.code === 200) { setRelations(response.data ?? []); setTotal(response.total ?? 0) }
      } else {
        const response = await fetchReferralRewards({ current, pageSize, keyword, status, type: rewardType })
        if (response.code === 200) { setRewards(response.data ?? []); setTotal(response.total ?? 0) }
      }
    } finally { setLoading(false) }
  }, [current, keyword, pageSize, rewardType, status, view])
  // oxlint-enable react/memo-dependencies

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const reset = () => { setKeyword(''); setStatus(''); setRewardType(''); setCurrent(1) }
  const switchView = (value: string | number) => { setView(value as 'relations' | 'rewards'); setCurrent(1); setKeyword(''); setStatus(''); setRewardType('') }

  const reverse = (row: ReferralReward) => {
    let reason = ''
    modal.confirm({
      title: '撤销订单相关奖励',
      content: <div><Alert type="warning" showIcon message="本操作会撤销该订单产生的全部邀请奖励，并扣回已发放余额。余额不足时系统会拒绝操作。" /><Input.TextArea className="mt-3" rows={3} maxLength={200} placeholder="撤销原因，例如：订单退款" onChange={(event) => { reason = event.target.value.trim() }} /></div>,
      okText: '确认撤销', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => { await unwrap(reverseReferralReward(row.id, reason)); message.success('奖励已撤销'); await load() },
    })
  }

  const relationColumns: TableColumnsType<ReferralRelation> = [
    { title: '受邀用户', dataIndex: 'email' }, { title: '邀请人', dataIndex: 'inviter_email' }, { title: '注册时间', dataIndex: 'created_at', render: dateTime }, { title: '状态', dataIndex: 'effective', render: (value) => <Tag color={value ? 'success' : 'default'}>{value ? '有效邀请' : '待首购'}</Tag> }, { title: '操作', width: 120, render: (_, row) => <Button type="link" icon={<EyeOutlined />} onClick={() => setDetailRelation(row)}>查看链路</Button> },
  ]
  const rewardColumns: TableColumnsType<ReferralReward> = [
    { title: '用户', dataIndex: 'user_email' }, { title: '来源用户', dataIndex: 'invited_user_email' }, { title: '类型', dataIndex: 'reward_type', render: (value: RewardType) => REWARD_TYPES[value] || value }, { title: '奖励', render: (_, row) => rewardValue(row) }, { title: '状态', dataIndex: 'status', render: (value: keyof typeof REWARD_STATUS) => <Tag color={REWARD_STATUS[value]?.color}>{REWARD_STATUS[value]?.label || value}</Tag> }, { title: '说明', dataIndex: 'description' }, { title: '时间', dataIndex: 'created_at', render: dateTime }, { title: '操作', width: 100, render: (_, row) => row.status === 'granted' && row.order_id ? <Button type="link" danger icon={<UndoOutlined />} onClick={() => reverse(row)}>撤销</Button> : '--' },
  ]

  return (
    <Card>
      <Segmented value={view} onChange={switchView} options={[{ value: 'relations', label: '邀请关系' }, { value: 'rewards', label: '奖励流水' }]} />
      <div className="catboard-filter-bar catboard-filter-bar-wide mt-3">
        <Input prefix={<SearchOutlined />} allowClear value={keyword} onChange={(event) => { setKeyword(event.target.value); setCurrent(1) }} placeholder={view === 'relations' ? '搜索用户或邀请人邮箱' : '搜索用户邮箱'} />
        {view === 'rewards' && <Select value={rewardType} onChange={(value) => { setRewardType(value); setCurrent(1) }} options={[{ value: '', label: '全部类型' }, ...Object.entries(REWARD_TYPES).filter(([value]) => value !== 'none').map(([value, label]) => ({ value, label }))]} />}
        <Select value={status} onChange={(value) => { setStatus(value); setCurrent(1) }} options={view === 'relations' ? [{ value: '', label: '全部状态' }, { value: 'effective', label: '有效邀请' }, { value: 'pending', label: '待首购' }] : [{ value: '', label: '全部状态' }, ...Object.entries(REWARD_STATUS).map(([value, item]) => ({ value, label: item.label }))]} />
        <Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button onClick={reset}>重置</Button></Space>
      </div>
      <Table rowKey="id" loading={loading} dataSource={view === 'relations' ? relations : rewards} columns={(view === 'relations' ? relationColumns : rewardColumns) as TableColumnsType<ReferralRelation | ReferralReward>} pagination={false} scroll={{ x: view === 'relations' ? 800 : 1200 }} />
      <div className="d-flex justify-content-end mt-3"><Pagination current={current} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(value) => `共 ${value} 条`} onChange={(page, size) => { setCurrent(page); setPageSize(size) }} /></div>
      <RelationDetailModal relation={detailRelation} open={Boolean(detailRelation)} onClose={() => setDetailRelation(null)} onChanged={() => void load()} />
    </Card>
  )
}
