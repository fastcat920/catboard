import { Alert, Form, Modal, Select } from 'antd'
import { useEffect, useState } from 'react'
import { batchGroupUsers } from '@/api/services/user'
import type { FilterCondition, ServerGroup } from '@/api/types'
import { message } from '@/app/staticApi'
import { stringify } from '@/api/qs'

interface Props {
  open: boolean
  filters: FilterCondition[]
  total: number
  groups: ServerGroup[]
  onClose: () => void
  onSaved: () => void
}

export function BatchGroupModal({ open, filters, total, groups, onClose, onSaved }: Props) {
  const [form] = Form.useForm<{ group_id: number }>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) form.resetFields()
  }, [form, open])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    const res = await batchGroupUsers(values.group_id, stringify({ filter: filters }))
    setSaving(false)
    if (res.code !== 200) return
    message.success(`修改完成：匹配 ${res.data?.matched ?? total} 人，实际更新 ${res.data?.affected ?? 0} 人`)
    onSaved()
    onClose()
  }

  return (
    <Modal
      title="批量修改权限组"
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="确定"
      cancelText="取消"
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        className="mb-3"
        message={`操作范围：当前全部筛选结果，共 ${total} 名用户`}
        description="只修改用户权限组，不修改套餐、流量和到期时间。"
      />
      <Form form={form} layout="vertical">
        <Form.Item name="group_id" label="目标权限组" rules={[{ required: true, message: '请选择权限组' }]}>
          <Select
            placeholder="请选择权限组"
            options={groups.map((group) => ({
              value: group.id,
              label: `${group.name}（当前 ${group.user_count || 0} 人 / ${group.server_count || 0} 节点）`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

