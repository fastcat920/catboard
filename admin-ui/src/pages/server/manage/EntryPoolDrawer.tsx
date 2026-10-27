import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd'
import { useEffect, useState } from 'react'
import {
  deleteEntry,
  deleteEntryClientPolicy,
  fetchEntryPool,
  saveEntry,
  saveEntryClientPolicy,
  saveEntrySetting,
  type ClientVisibilityMode,
  type EntryClientPolicy,
  type EntryDeliveryMode,
  type EntryPoolNode,
  type NodeEntry,
} from '@/api/services/nodeSecurity'
import type { ServerNode } from '@/api/types'
import { message } from '@/app/staticApi'

const DELIVERY_OPTIONS = [
  { value: 'primary_only', label: '仅主入口' },
  { value: 'manual_backup', label: '主入口＋备用入口' },
  { value: 'auto_fallback', label: '自动故障转移' },
]

const VISIBILITY_OPTIONS = [
  { value: 'all', label: '所有客户端可见' },
  { value: 'allowlist', label: '仅匹配规则的客户端可见' },
  { value: 'denylist', label: '匹配隐藏规则的客户端不可见' },
]

const CLIENT_FAMILIES = [
  '*',
  'FastCat',
  'FlClash',
  'Digilink',
  'Clash Verge',
  'Clash Meta / Mihomo',
  'Shadowrocket',
  'Stash',
  'Surge',
  'v2rayN',
  'v2rayNG',
  'sing-box',
  '浏览器',
  '其他 / 未识别',
  '未提供',
]

const CLIENT_PLATFORMS = ['*', 'Windows', 'macOS', 'Android', 'iOS', 'Linux', '未知']

const HEALTH: Record<string, { text: string; color: string }> = {
  healthy: { text: '双向正常', color: 'success' },
  domestic_blocked: { text: '国内方向异常', color: 'warning' },
  overseas_blocked: { text: '海外方向异常', color: 'warning' },
  unreachable: { text: '全部不可达', color: 'error' },
  insufficient_probes: { text: '探测点不足', color: 'default' },
  waiting: { text: '等待探测', color: 'processing' },
}

interface SettingForm {
  delivery_mode: EntryDeliveryMode
  client_visibility_mode: ClientVisibilityMode
  check_interval: number
  check_url: string
  sync_primary_host: boolean
  sync_primary_port: boolean
}

interface EntryForm {
  name: string
  host: string
  port: number
  priority: number
  is_primary: boolean
  enabled: boolean
}

interface PolicyForm {
  client_family: string
  client_platform: string
  user_agent?: string
  min_version?: string
  max_version?: string
  delivery_mode: EntryDeliveryMode
  visibility: 'show' | 'hide'
  priority: number
  check_interval: number
  check_url: string
  enabled: boolean
}

interface Props {
  node?: ServerNode
  open: boolean
  onClose: () => void
  onChanged: () => void
}

const deliveryText = (value: EntryDeliveryMode) => DELIVERY_OPTIONS.find((item) => item.value === value)?.label ?? value

export function EntryPoolDrawer({ node, open, onClose, onChanged }: Props) {
  const [settingForm] = Form.useForm<SettingForm>()
  const [entryForm] = Form.useForm<EntryForm>()
  const [policyForm] = Form.useForm<PolicyForm>()
  const [pool, setPool] = useState<EntryPoolNode>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string>()
  const [editingEntry, setEditingEntry] = useState<NodeEntry>()
  const [editingPolicy, setEditingPolicy] = useState<EntryClientPolicy>()
  const [entryFormOpen, setEntryFormOpen] = useState(false)
  const [policyFormOpen, setPolicyFormOpen] = useState(false)

  const load = async () => {
    if (!node) return
    setLoading(true)
    const res = await fetchEntryPool(node.type, node.id)
    setLoading(false)
    const next = res.code === 200 ? res.data?.data?.[0] : undefined
    if (!next) return
    setPool(next)
    settingForm.setFieldsValue({
      delivery_mode: next.delivery_mode,
      client_visibility_mode: next.client_visibility_mode,
      check_interval: next.check_interval,
      check_url: next.check_url,
      sync_primary_host: next.sync_primary_host,
      sync_primary_port: next.sync_primary_port,
    })
  }

  useEffect(() => {
    if (!open || !node) return
    setPool(undefined)
    setEditingEntry(undefined)
    setEditingPolicy(undefined)
    setEntryFormOpen(false)
    setPolicyFormOpen(false)
    entryForm.resetFields()
    policyForm.resetFields()
    void load()
    // node 只用 type/id 定位；表单实例稳定，不参与触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, node?.type, node?.id])

  const reload = async (refreshNodes = false) => {
    await load()
    if (refreshNodes) onChanged()
  }

  const submitSetting = async (values: SettingForm) => {
    if (!pool) return
    setSaving('setting')
    const res = await saveEntrySetting({ server_type: pool.server_type, server_id: pool.server_id, ...values })
    setSaving(undefined)
    if (res.code !== 200) return
    message.success('下发设置已保存')
    await reload(true)
  }

  const startEntry = (entry?: NodeEntry) => {
    setEditingEntry(entry)
    setEntryFormOpen(true)
    const fallbackPort = Number(pool?.original_address.split(':').pop()) || undefined
    entryForm.setFieldsValue(
      entry
        ? { ...entry }
        : { name: '', host: '', port: fallbackPort, priority: 100, is_primary: false, enabled: true },
    )
  }

  const submitEntry = async (values: EntryForm) => {
    if (!pool) return
    setSaving('entry')
    const res = await saveEntry({
      id: editingEntry?.id,
      server_type: pool.server_type,
      server_id: pool.server_id,
      ...values,
    })
    setSaving(undefined)
    if (res.code !== 200) return
    message.success(editingEntry ? '入口已更新' : '入口已添加')
    setEditingEntry(undefined)
    setEntryFormOpen(false)
    entryForm.resetFields()
    await reload(true)
  }

  const removeEntry = async (id: number) => {
    setSaving(`entry-delete-${id}`)
    const res = await deleteEntry(id)
    setSaving(undefined)
    if (res.code !== 200) return
    message.success('入口已删除')
    await reload(true)
  }

  const startPolicy = (policy?: EntryClientPolicy) => {
    setEditingPolicy(policy)
    setPolicyFormOpen(true)
    const defaultVisibility = pool?.client_visibility_mode === 'denylist' ? 'hide' : 'show'
    policyForm.setFieldsValue(
      policy
        ? {
            ...policy,
            client_platform: policy.client_platform || '*',
            user_agent: policy.user_agent || undefined,
            min_version: policy.min_version || undefined,
            max_version: policy.max_version || undefined,
          }
        : {
            client_family: '*',
            client_platform: '*',
            user_agent: undefined,
            delivery_mode: pool?.delivery_mode ?? 'primary_only',
            visibility: defaultVisibility,
            priority: 100,
            check_interval: pool?.check_interval ?? 60,
            check_url: pool?.check_url ?? 'http://www.gstatic.com/generate_204',
            enabled: true,
          },
    )
  }

  const submitPolicy = async (values: PolicyForm) => {
    if (!pool) return
    setSaving('policy')
    const res = await saveEntryClientPolicy({
      id: editingPolicy?.id,
      server_type: pool.server_type,
      server_id: pool.server_id,
      ...values,
    })
    setSaving(undefined)
    if (res.code !== 200) return
    message.success(editingPolicy ? '客户端规则已更新' : '客户端规则已添加')
    setEditingPolicy(undefined)
    setPolicyFormOpen(false)
    policyForm.resetFields()
    await reload()
  }

  const removePolicy = async (id: number) => {
    setSaving(`policy-delete-${id}`)
    const res = await deleteEntryClientPolicy(id)
    setSaving(undefined)
    if (res.code !== 200) return
    message.success('客户端规则已删除')
    await reload()
  }

  const entryColumns: TableColumnsType<NodeEntry> = [
    { title: '名称', dataIndex: 'name' },
    { title: '地址', render: (_, item) => `${item.host}:${item.port}` },
    { title: '优先级', dataIndex: 'priority', width: 90 },
    {
      title: '角色',
      width: 120,
      render: (_, item) => (
        <Space size={4} wrap>
          <Tag color={item.is_primary ? 'blue' : 'default'}>{item.is_primary ? '主入口' : '备用'}</Tag>
          {!item.enabled && <Tag>已停用</Tag>}
        </Space>
      ),
    },
    {
      title: '探测状态',
      width: 120,
      render: (_, item) => {
        const health = HEALTH[item.health_status || 'waiting'] ?? { text: item.health_status || '等待探测', color: 'default' }
        return <Tag color={health.color}>{health.text}</Tag>
      },
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, item) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => startEntry(item)}>编辑</Button>
          <Popconfirm
            title="确认删除这个入口？"
            description="已下载到客户端的旧配置不会被远程删除。"
            onConfirm={() => void removeEntry(item.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} loading={saving === `entry-delete-${item.id}`}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const policyColumns: TableColumnsType<EntryClientPolicy> = [
    { title: '客户端', render: (_, item) => (item.client_family === '*' ? '全部客户端' : item.client_family) },
    {
      title: 'UA 精确匹配',
      width: 260,
      ellipsis: true,
      render: (_, item) => item.user_agent || <Typography.Text type="secondary">不限制</Typography.Text>,
    },
    {
      title: '平台 / 版本',
      render: (_, item) => {
        const versions = [item.min_version && `≥ ${item.min_version}`, item.max_version && `≤ ${item.max_version}`]
          .filter(Boolean)
          .join('，')
        return (
          <span>
            {!item.client_platform || item.client_platform === '*' ? '全部平台' : item.client_platform}
            <br />
            <Typography.Text type="secondary">{versions || '全部版本'}</Typography.Text>
          </span>
        )
      },
    },
    { title: '节点动作', render: (_, item) => (item.visibility === 'hide' ? '隐藏' : '显示'), width: 90 },
    { title: '下发模式', render: (_, item) => deliveryText(item.delivery_mode), width: 140 },
    { title: '优先级', dataIndex: 'priority', width: 90 },
    { title: '状态', render: (_, item) => <Tag color={item.enabled ? 'success' : 'default'}>{item.enabled ? '启用' : '停用'}</Tag>, width: 80 },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, item) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => startPolicy(item)}>编辑</Button>
          <Popconfirm title="确认删除这条客户端下发规则？" onConfirm={() => void removePolicy(item.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} loading={saving === `policy-delete-${item.id}`}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Drawer
      title={pool ? `管理节点入口 · ${pool.server_name}` : '管理节点入口'}
      open={open}
      onClose={onClose}
      size="80%"
      destroyOnHidden
      extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>}
    >
      {pool && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`节点 ID ${pool.server_id} · ${pool.server_type} · 原地址 ${pool.original_address}`}
          />

          <Card title="下发设置" size="small">
            <Form form={settingForm} layout="vertical" onFinish={(values) => void submitSetting(values)}>
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="delivery_mode" label="下发模式" rules={[{ required: true }]}>
                    <Select options={DELIVERY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Form.Item name="client_visibility_mode" label="节点可见范围" rules={[{ required: true }]}>
                    <Select options={VISIBILITY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={8}>
                  <Form.Item name="check_interval" label="客户端检测间隔（秒）" rules={[{ required: true }]}>
                    <InputNumber min={30} max={86400} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={16}>
                  <Form.Item name="check_url" label="客户端检测 URL" rules={[{ required: true, type: 'url' }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Space wrap>
                <Form.Item name="sync_primary_host" valuePropName="checked" noStyle>
                  <Checkbox>主入口地址与节点管理双向同步</Checkbox>
                </Form.Item>
                <Form.Item name="sync_primary_port" valuePropName="checked" noStyle>
                  <Checkbox>主入口端口与节点管理双向同步</Checkbox>
                </Form.Item>
              </Space>
              <Typography.Paragraph type="secondary" className="mt-2">
                开启后以节点管理当前值初始化；之后修改任意一处，另一处会同步更新。
              </Typography.Paragraph>
              <Button type="primary" htmlType="submit" loading={saving === 'setting'}>保存下发设置</Button>
            </Form>
          </Card>

          <Card
            title="入口列表"
            size="small"
            extra={<Button icon={<PlusOutlined />} onClick={() => startEntry()}>添加入口</Button>}
          >
            <Table<NodeEntry>
              rowKey="id"
              size="small"
              loading={loading}
              columns={entryColumns}
              dataSource={pool.entries}
              pagination={false}
              scroll={{ x: 820 }}
              locale={{ emptyText: '尚未启用入口池；首次保存设置时会自动导入节点原地址作为主入口' }}
            />
            {entryFormOpen && (
              <>
                <Divider>{editingEntry ? '编辑入口' : '添加入口'}</Divider>
                <Form form={entryForm} layout="vertical" onFinish={(values) => void submitEntry(values)}>
                  <Row gutter={16}>
                    <Col xs={24} lg={6}><Form.Item name="name" label="入口名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
                    <Col xs={24} lg={8}><Form.Item name="host" label="地址 / 域名" rules={[{ required: true }]}><Input /></Form.Item></Col>
                    <Col xs={12} lg={5}><Form.Item name="port" label="端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} lg={5}><Form.Item name="priority" label="优先级" rules={[{ required: true }]}><InputNumber min={1} max={10000} style={{ width: '100%' }} /></Form.Item></Col>
                  </Row>
                  <Space wrap>
                    <Form.Item name="is_primary" valuePropName="checked" noStyle><Checkbox>设为主入口</Checkbox></Form.Item>
                    <Form.Item name="enabled" valuePropName="checked" noStyle><Checkbox>启用并参与下发和探测</Checkbox></Form.Item>
                  </Space>
                  <div className="mt-3">
                    <Space>
                      <Button onClick={() => { setEditingEntry(undefined); setEntryFormOpen(false); entryForm.resetFields() }}>取消</Button>
                      <Button type="primary" htmlType="submit" loading={saving === 'entry'}>{editingEntry ? '保存入口' : '添加入口'}</Button>
                    </Space>
                  </div>
                </Form>
              </>
            )}
          </Card>

          <Card
            title="客户端 UA 下发规则"
            size="small"
            extra={<Button icon={<PlusOutlined />} onClick={() => startPolicy()}>添加规则</Button>}
          >
            <Typography.Paragraph type="secondary">
              命中规则时决定节点显示/隐藏，并覆盖默认下发设置；数字越小优先级越高。UA 可伪造，规则不会扩大用户的节点权限。
            </Typography.Paragraph>
            <Table<EntryClientPolicy>
              rowKey="id"
              size="small"
              columns={policyColumns}
              dataSource={pool.client_policies}
              pagination={false}
              scroll={{ x: 1260 }}
              locale={{ emptyText: '尚未添加客户端规则，节点按上方可见范围处理' }}
            />
            {policyFormOpen && (
              <>
                <Divider>{editingPolicy ? '编辑客户端规则' : '添加客户端规则'}</Divider>
                <Form form={policyForm} layout="vertical" onFinish={(values) => void submitPolicy(values)}>
                  <Row gutter={16}>
                    <Col xs={24} md={12} lg={6}><Form.Item name="client_family" label="客户端" rules={[{ required: true }]}><Select options={CLIENT_FAMILIES.map((value) => ({ value, label: value === '*' ? '全部客户端' : value }))} /></Form.Item></Col>
                    <Col xs={24} md={12} lg={6}><Form.Item name="client_platform" label="平台"><Select options={CLIENT_PLATFORMS.map((value) => ({ value, label: value === '*' ? '全部平台' : value }))} /></Form.Item></Col>
                    <Col xs={12} lg={6}><Form.Item name="min_version" label="最低版本"><Input placeholder="留空不限" /></Form.Item></Col>
                    <Col xs={12} lg={6}><Form.Item name="max_version" label="最高版本"><Input placeholder="留空不限" /></Form.Item></Col>
                    <Col xs={24}>
                      <Form.Item
                        name="user_agent"
                        label="UA 精确匹配（可选）"
                        extra="填写后仅完整 User-Agent 与此内容完全一致的请求命中；客户端与平台可选择全部。"
                      >
                        <Input.TextArea rows={2} maxLength={512} placeholder="例如：clash.meta (FFQ Private Test Center by FFQ.LA)" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12} lg={6}><Form.Item name="delivery_mode" label="下发模式" rules={[{ required: true }]}><Select options={DELIVERY_OPTIONS} /></Form.Item></Col>
                    <Col xs={24} md={12} lg={6}><Form.Item name="visibility" label="节点动作" rules={[{ required: true }]}><Select options={[{ value: 'show', label: '显示节点' }, { value: 'hide', label: '隐藏节点' }]} /></Form.Item></Col>
                    <Col xs={12} lg={6}><Form.Item name="priority" label="规则优先级" rules={[{ required: true }]}><InputNumber min={1} max={10000} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} lg={6}><Form.Item name="check_interval" label="检测间隔（秒）" rules={[{ required: true }]}><InputNumber min={30} max={86400} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={24}><Form.Item name="check_url" label="检测 URL" rules={[{ required: true, type: 'url' }]}><Input /></Form.Item></Col>
                  </Row>
                  <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
                  <Space>
                    <Button onClick={() => { setEditingPolicy(undefined); setPolicyFormOpen(false); policyForm.resetFields() }}>取消</Button>
                    <Button type="primary" htmlType="submit" loading={saving === 'policy'}>{editingPolicy ? '保存客户端规则' : '添加客户端规则'}</Button>
                  </Space>
                </Form>
              </>
            )}
          </Card>
        </Space>
      )}
    </Drawer>
  )
}
