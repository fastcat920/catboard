import { copyText } from '@/utils/clipboard'
import { Button, Checkbox, Input, Select } from 'antd'
import { JsLink } from '@/components/JsLink'
import { json4, NetworkSettingsEditor, PaddingSchemeEditor } from './editors'
import { EncryptionSettings, fcnCertificateOptions, TlsSettings } from './settings'
import {
  ChildDrawer,
  DrawerActions,
  EditConfigLabel,
  GroupField,
  NameRateRow,
  NodeDrawerFrame,
  ParentField,
  RouteField,
  TagsField,
  TagsSelect,
  text,
  Trigger,
  useNodeDrawer,
  useSaveNode,
  withParsedSettings,
  type Change,
  type NodeDrawerProps,
  type NodeForm,
} from './shared'
import { SS_CIPHERS } from './ShadowsocksDrawer'
import { TuicCongestionRow, TuicSniRelayRow } from './TuicDrawer'
import { ENCRYPTIONS } from './VlessDrawer'
import { stringifySettings } from '../utils'

const NETWORK_PLACEHOLDERS = {
  tcp: json4({
    acceptProxyProtocol: false,
    header: { type: 'http', request: { path: ['/'], headers: { Host: ['www.baidu.com', 'www.bing.com'] } }, response: {} },
  }),
  http: json4({ acceptProxyProtocol: false, path: '/', Host: 'xtls.github.io' }),
  ws: json4({ acceptProxyProtocol: false, path: '/', headers: { Host: 'xtls.github.io' } }),
  grpc: json4({ serviceName: 'GunService' }),
  httpupgrade: json4({ acceptProxyProtocol: false, path: '/', host: 'xtls.github.io' }),
  xhttp: json4({ path: '/', host: 'xtls.github.io', mode: 'auto', extra: {} }),
}

export const PROTOCOLS = [
  { value: 'fcn-v1', label: 'FCN v1' },
  { value: 'fcn-v2', label: 'FCN v2' },
  { value: 'fcn-v3', label: 'FCN v3' },
  { value: 'anytls', label: 'AnyTLS' },
  { value: 'hysteria2', label: 'Hysteria2' },
  { value: 'fastcat-v2', label: 'FastCat v2' },
  { value: 'shadowsocks', label: 'Shadowsocks' },
  { value: 'trojan', label: 'Trojan' },
  { value: 'tuic', label: 'Tuic' },
  { value: 'vless', label: 'VLess' },
  { value: 'vmess', label: 'VMess' },
]
/** 这些协议必须使用 TLS：切换到它们时安全性自动设为 TLS */
const TLS_REQUIRED = ['fcn-v1', 'fcn-v2', 'fcn-v3', 'fastcat-v2', 'anytls', 'hysteria2', 'trojan', 'tuic']
/** 安全性默认显示为 TLS 的协议 */
const TLS_DEFAULT = ['fcn-v1', 'fcn-v2', 'fcn-v3', 'fastcat-v2', 'hysteria2', 'trojan', 'tuic']

function fcnCaSettings(previous: Record<string, unknown> | undefined, allowPanelCertificate: boolean) {
  const modes = fcnCertificateOptions(allowPanelCertificate)
  if (previous?.fcn_trust_mode !== 'spki' && modes.some(({ value }) => value === previous?.cert_mode)) {
    return { ...previous, fcn_trust_mode: 'ca' }
  }
  return { server_name: previous?.server_name, cert_mode: 'http', fcn_trust_mode: 'ca' }
}

function NetworkRow({ server, change, onEdit }: { server: NodeForm; change: Change; onEdit: () => void }) {
  const isShadowsocks = server.protocol == 'shadowsocks'
  return (
    <div className="row">
      <div className="form-group col-md-12 col-xs-12">
        <EditConfigLabel label="传输协议" onClick={onEdit} />
        <Select<string>
          value={(server.network as string | null | undefined) ?? 'tcp'}
          placeholder="选择传输协议"
          style={{ width: '100%' }}
          onChange={(v) => change('network', v)}
          options={
            isShadowsocks
              ? [
                  { value: 'tcp', label: 'TCP' },
                  { value: 'http', label: 'HTTP伪装' },
                ]
              : [
                  { value: 'tcp', label: 'TCP' },
                  { value: 'ws', label: 'WebSocket' },
                  { value: 'grpc', label: 'gRPC' },
                  ...(server.protocol != 'trojan'
                    ? [
                        { value: 'httpupgrade', label: 'HTTPUpgrade' },
                        { value: 'xhttp', label: 'XHTTP' },
                      ]
                    : []),
                ]
          }
        />
      </div>
    </div>
  )
}

// V2node 节点（原版模块 uzXD 的 wV2node）：一个节点可选多种协议，字段按协议显示
export function V2nodeDrawer({ record, children }: NodeDrawerProps) {
  const { server, setServer, visible, setVisible, child, showChild, change } = useNodeDrawer(record, () => ({
    tls: 0,
    rate: 1,
    network: 'tcp',
    disable_sni: 0,
    zero_rtt_handshake: 0,
    flow: null,
  }))
  const { saving, save } = useSaveNode('v2node')
  // 与原版一致：打开时不转换传输协议配置（子抽屉里显示时再转成文本），关闭时才转换
  const onShow = () => {
    setVisible((v) => !v)
    setServer((s) => stringifySettings(s, 'network_settings'))
  }
  const formChange: Change = (key, value) => {
    if (key === 'protocol' && (value === 'fcn-v1' || value === 'fcn-v2' || value === 'fcn-v3')) {
      setServer((s) => {
        const previous = s.tls_settings as Record<string, unknown> | undefined
        const keepPanelCertificate = value !== 'fcn-v3' && (s.protocol === 'fcn-v1' || s.protocol === 'fcn-v2')
        const usePinnedIdentity = keepPanelCertificate && previous?.fcn_trust_mode === 'spki'
        return {
          ...s, protocol: value, tls: 1, network: 'tcp', flow: null, network_settings: null,
          tls_settings: usePinnedIdentity ? previous : fcnCaSettings(previous, keepPanelCertificate),
        }
      })
    } else if (key === 'protocol' && value === 'fastcat-v2') {
      setServer((s) => ({ ...s, protocol: value, tls: 1, network: 'tcp', flow: null, network_settings: null }))
    } else if (key === 'protocol' && TLS_REQUIRED.includes(value as string)) {
      setServer((s) => ({ ...s, protocol: value, tls: 1 }))
    } else {
      change(key, value)
    }
  }
  // 与原版一致：提交深拷贝后的数据（去掉部署命令和状态）
  const submit = () => {
    const params = withParsedSettings(JSON.parse(JSON.stringify(server)) as NodeForm, 'network_settings')
    if (!params) return
    delete params.install_command
    delete params.install_command_error
    void save(params, onShow)
  }

  const protocol = server.protocol as string | null | undefined
  const supportsPinnedIdentity = protocol === 'fcn-v1' || protocol === 'fcn-v2'
  const isFCN = supportsPinnedIdentity || protocol === 'fcn-v3'
  const tlsSettings = server.tls_settings as Record<string, unknown> | undefined
  const usesPinnedIdentity = supportsPinnedIdentity && tlsSettings?.fcn_trust_mode === 'spki'
  const hasSavedProtocol = protocol === record?.protocol
  const installCommand = hasSavedProtocol ? text(record?.install_command) : undefined
  let installPlaceholder: string | undefined
  if (isFCN && !installCommand) {
    installPlaceholder = hasSavedProtocol
      ? text(record?.install_command_error) || '当前面板未提供可用的 CatNode 部署命令'
      : '保存节点后生成 CatNode 部署命令'
  }
  const tls = Number.parseInt(String(server.tls), 10)
  const networkSettings = server.network_settings
  const networkText =
    networkSettings != null && typeof networkSettings === 'object' ? JSON.stringify(networkSettings, null, 2) : networkSettings

  return (
    <>
      <Trigger onClick={() => setVisible(true)}>{children}</Trigger>
      <NodeDrawerFrame server={server} visible={visible} onClose={onShow}>
        <div>
          <NameRateRow server={server} change={formChange} />
          <TagsField server={server} change={formChange} />
          <GroupField server={server} change={formChange} />
          <div className="row">
            <div className="form-group col-md-6 col-xs-12">
              <label>连接地址</label>
              <Input placeholder="地址或IP" value={text(server.host)} onChange={(e) => formChange('host', e.target.value)} />
            </div>
            <div className="form-group col-md-6 col-xs-12">
              <label>监听地址</label>
              <Input
                placeholder="地址或IP默认为0.0.0.0"
                value={text(server.listen_ip)}
                onChange={(e) => formChange('listen_ip', e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <div className="form-group col-md-6 col-xs-12">
              <label>连接端口</label>
              <Input placeholder="用户连接端口" value={text(server.port)} onChange={(e) => formChange('port', e.target.value)} />
            </div>
            <div className="form-group col-md-6 col-xs-12">
              <label>服务端口</label>
              <Input
                placeholder="服务端开放端口"
                value={text(server.server_port)}
                onChange={(e) => formChange('server_port', e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <div className="form-group col-md-6 col-xs-12">
              <label>节点协议</label>
              <Select<string>
                value={protocol ?? undefined}
                style={{ width: '100%' }}
                onChange={(v) => formChange('protocol', v)}
                options={PROTOCOLS}
              />
            </div>
            {protocol != null && protocol != 'shadowsocks' && (
              <div className="form-group col-md-6 col-xs-12">
                <EditConfigLabel
                  label="安全性"
                  show={tls !== 0 || TLS_DEFAULT.includes(protocol)}
                  onClick={() => showChild('编辑安全性配置', 'tls_settings')}
                />
                <Select<number>
                  value={tls || (TLS_DEFAULT.includes(protocol) ? 1 : 0)}
                  style={{ width: '100%' }}
                  onChange={(v) => formChange('tls', v)}
                  options={[
                    ...(protocol == 'vless' || protocol == 'vmess' ? [{ value: 0, label: '无' }] : []),
                    { value: 1, label: 'TLS' },
                    ...(protocol == 'vless' || protocol == 'anytls' ? [{ value: 2, label: 'Reality' }] : []),
                  ]}
                />
              </div>
            )}
          </div>
          {supportsPinnedIdentity && (
            <div className="form-group">
              <label>服务器身份验证</label>
              <Select<string>
                style={{ width: '100%' }}
                value={usesPinnedIdentity ? 'spki' : 'ca'}
                options={[{ value: 'ca', label: 'CA 证书验证' }, { value: 'spki', label: '自签证书 + 固定公钥' }]}
                onChange={(value) => setServer((s) => {
                  const previous = s.tls_settings as Record<string, unknown> | undefined
                  const saved = record?.tls_settings as Record<string, unknown> | undefined
                  const savedSupportsPanelCertificate = record?.protocol === 'fcn-v1' || record?.protocol === 'fcn-v2'
                  const nextTlsSettings = value === 'spki'
                    ? {
                      ...(savedSupportsPanelCertificate && saved?.fcn_trust_mode === 'spki' ? saved : undefined),
                      server_name: previous?.server_name, fcn_trust_mode: 'spki', cert_mode: 'remote',
                    }
                    : { ...fcnCaSettings(saved, savedSupportsPanelCertificate), server_name: previous?.server_name }
                  return { ...s, tls_settings: nextTlsSettings }
                })}
              />
              {usesPinnedIdentity && (
                <p>面板保存时生成证书并下发公钥指纹。固定公钥需要客户端核心支持，更换公钥后需刷新订阅。</p>
              )}
              {Boolean(server.parent_id) && <p>前置节点使用父节点的证书身份；修改父节点后生效。</p>}
            </div>
          )}
          {supportsPinnedIdentity && (
            <div className="form-group">QUIC + TLS 1.3 · BBR · {protocol === 'fcn-v1' ? '单连接' : '双连接恢复选路'}。需要放行服务端 UDP 端口，使用账号 UUID 授权。</div>
          )}
          {protocol === 'fcn-v3' && (
            <div className="form-group">HTTP/3 + TLS 1.3。放行服务端 UDP 端口，使用系统 CA 信任的证书和账号 UUID 授权。</div>
          )}
          {protocol === 'fastcat-v2' && (
            <div className="form-group">
              <label>协议组合</label>
              <Select
                style={{ width: '100%' }}
                value={text((server.tls_settings as Record<string, unknown> | undefined)?.fastcat_transport_mode) || 'auto'}
                options={[
                  { value: 'auto', label: server.parent_id ? '跟随父节点' : '自动（HTTP/2 + HTTP/3）' },
                  { value: 'h2', label: '仅 HTTP/2' },
                  { value: 'h3', label: '仅 HTTP/3' },
                ]}
                onChange={(value) => setServer((s) => ({
                  ...s,
                  tls_settings: { ...(s.tls_settings as Record<string, unknown> | undefined), fastcat_transport_mode: value },
                }))}
              />
              <label>密钥交换</label>
              <Select
                style={{ width: '100%' }}
                value={text((server.tls_settings as Record<string, unknown> | undefined)?.fastcat_tls_key_exchange) || 'default'}
                options={[
                  { value: 'default', label: '默认协商' },
                  { value: 'x25519', label: 'X25519' },
                  { value: 'x25519mlkem768', label: 'X25519MLKEM768' },
                ]}
                onChange={(value) => setServer((s) => ({
                  ...s,
                  tls_settings: { ...(s.tls_settings as Record<string, unknown> | undefined), fastcat_tls_key_exchange: value },
                }))}
              />
              <label>入口 IPv4（可选）</label>
              <Input
                placeholder="直接拨号此 IP，证书仍按连接域名校验"
                value={text((server.tls_settings as Record<string, unknown> | undefined)?.fastcat_endpoint_ipv4)}
                onChange={(e) => setServer((s) => ({
                  ...s,
                  tls_settings: { ...(s.tls_settings as Record<string, unknown> | undefined), fastcat_endpoint_ipv4: e.target.value.trim() || null },
                }))}
              />
            </div>
          )}
          {protocol == 'shadowsocks' && (
            <NetworkRow server={server} change={formChange} onEdit={() => showChild('编辑协议配置', 'network_settings')} />
          )}
          {protocol != null && protocol != 'fastcat-v2' && protocol != 'fcn-v1' && protocol != 'fcn-v2' && protocol != 'fcn-v3' && protocol != 'hysteria2' && protocol != 'shadowsocks' && protocol != 'tuic' && (
            <NetworkRow server={server} change={formChange} onEdit={() => showChild('编辑协议配置', 'network_settings')} />
          )}
          {server.network != null &&
            (server.network == 'xhttp' || server.network == 'ws' || server.network == 'grpc') && (
              <div className="form-group">
                <label>信任的XFF头部(获取真实IP)</label>
                <TagsSelect
                  value={server.trusted_x_forwarded_for}
                  placeholder="常见头部:X-Forwarded-For CF-Connecting-IP X-Real-IP"
                  onChange={(v) => formChange('trusted_x_forwarded_for', v)}
                />
              </div>
            )}
          {protocol == 'anytls' && (
            <div className="row">
              <div className="form-group col-md-12 col-xs-12">
                <label>
                  <JsLink onClick={() => showChild('编辑填充方案', 'padding_scheme')}>编辑填充方案</JsLink>
                </label>
              </div>
            </div>
          )}
          {protocol == 'hysteria2' && (
            <div className="row">
              <div className="form-group col-md-6 col-xs-12">
                <label>混淆方式obfs</label>
                <Select<string | null>
                  value={server.obfs as string | null | undefined}
                  style={{ width: '100%' }}
                  onChange={(v) => formChange('obfs', v)}
                  options={[
                    { value: null, label: '无' },
                    { value: 'salamander', label: 'salamander' },
                  ]}
                />
              </div>
              {server.obfs === 'salamander' && (
                <div className="form-group col-md-6 col-xs-12">
                  <label>混淆密码obfs_password</label>
                  <Input
                    value={text(server.obfs_password)}
                    placeholder="留空自动生成"
                    onChange={(e) => formChange('obfs_password', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          {protocol == 'hysteria2' && (
            <div className="form-group">
              <label>上行带宽</label>
              <Input
                addonAfter="Mbps"
                placeholder="服务端发送带宽,留空或填0使用BBR"
                value={text(server.up_mbps)}
                onChange={(e) => formChange('up_mbps', e.target.value)}
              />
            </div>
          )}
          {protocol == 'hysteria2' && (
            <div className="form-group">
              <label>下行带宽</label>
              <Input
                addonAfter="Mbps"
                placeholder="服务端接收带宽,留空或填0使用BBR"
                value={text(server.down_mbps)}
                onChange={(e) => formChange('down_mbps', e.target.value)}
              />
            </div>
          )}
          {protocol == 'tuic' && <TuicSniRelayRow server={server} change={formChange} />}
          {protocol == 'tuic' && <TuicCongestionRow server={server} change={formChange} />}
          {protocol == 'shadowsocks' && (
            <div className="form-group">
              <label>加密算法</label>
              <Select<string>
                value={(server.cipher as string | null | undefined) ?? 'aes-128-gcm'}
                onChange={(v) => formChange('cipher', v)}
                style={{ width: '100%' }}
                options={SS_CIPHERS}
              />
            </div>
          )}
          {protocol == 'vless' && (
            <div className="row">
              <div className="form-group col-md-12 col-xs-12">
                <EditConfigLabel
                  label="加密方式"
                  show={Boolean(server.encryption)}
                  onClick={() => showChild('编辑加密配置', 'encryption_settings')}
                />
                <Select<string | null>
                  value={server.encryption as string | null | undefined}
                  placeholder="选择加密方式"
                  style={{ width: '100%' }}
                  onChange={(v) => formChange('encryption', v)}
                  options={ENCRYPTIONS}
                />
              </div>
            </div>
          )}
          {protocol == 'vless' && (
            <div className="row">
              <div className="form-group col-md-12 col-xs-12">
                <label>XTLS流控算法</label>
                <Select<string | null>
                  value={server.flow as string | null | undefined}
                  placeholder="选择XTLS流控算法"
                  style={{ width: '100%' }}
                  onChange={(v) => formChange('flow', v)}
                  options={[
                    { value: null, label: '无' },
                    { value: 'xtls-rprx-vision', label: 'xtls-rprx-vision' },
                  ]}
                />
              </div>
            </div>
          )}
          <ParentField type="v2node" server={server} change={formChange} />
          <RouteField server={server} change={formChange} />
          <div className="form-group">
            <label>{protocol === 'fastcat-v2' && server.parent_id ? '前置转发配置（Nginx stream）' : '一键安装指令'}</label>
            {['fastcat-v2', 'fcn-v1', 'fcn-v2', 'fcn-v3'].includes(protocol ?? '') && (
              <Button disabled={!installCommand} onClick={() => installCommand && copyText(installCommand)}>
                {server.parent_id && protocol !== 'fcn-v3' ? '复制前置转发配置' : '复制 CatNode 部署命令'}
              </Button>
            )}
            <Input.TextArea
              value={installCommand ?? ''}
              placeholder={installPlaceholder}
              rows={4}
              readOnly
              // 皮肤里取 --v2b-readonly-bg（见 styles/skins/_shell.scss），legacy 下为原值
              style={{ backgroundColor: 'var(--v2b-readonly-bg, #f5f5f5a0)', cursor: 'text' }}
            />
          </div>
        </div>
        <DrawerActions saving={saving} onCancel={onShow} onSave={submit} />
        <ChildDrawer state={child} onClose={() => showChild()}>
          {child.type === 'network_settings' && (
            <NetworkSettingsEditor
              placeholders={NETWORK_PLACEHOLDERS}
              network={server.network}
              value={networkText}
              onChange={(v) => formChange('network_settings', v)}
            />
          )}
          {child.type === 'tls_settings' && usesPinnedIdentity && (
            <div>
              <label>SNI / 证书名称</label>
              <Input value={text(tlsSettings?.server_name)}
                placeholder={text(server.host)}
                onChange={(e) => setServer((s) => ({ ...s, tls_settings: { ...(s.tls_settings as Record<string, unknown> | undefined), server_name: e.target.value.trim() } }))} />
              <p>证书覆盖此名称，客户端通过固定公钥验证节点身份。</p>
              <label>公钥指纹（保存后生成）</label>
              <Input readOnly value={text(tlsSettings?.fcn_spki_sha256)} />
              <p>证书到期前使用同一密钥续签。私钥仅下发给 CatNode。</p>
              <Checkbox checked={Boolean(tlsSettings?.fcn_rotate_key)}
                onChange={(e) => setServer((s) => ({ ...s, tls_settings: { ...(s.tls_settings as Record<string, unknown> | undefined), fcn_rotate_key: e.target.checked } }))}>
                保存时更换公钥（旧订阅需刷新后才能重连）
              </Checkbox>
            </div>
          )}
          {child.type === 'tls_settings' && !usesPinnedIdentity && (
            <TlsSettings
              settings={server.tls_settings}
              tls={server.tls}
              certApply
              requireTrustedCertificate={isFCN}
              allowPanelCertificate={supportsPinnedIdentity}
              defaultServerName={isFCN ? text(server.host) || '留空使用连接地址' : undefined}
              onChange={(v) => setServer((s) => ({ ...s, tls_settings: v }))}
            />
          )}
          {child.type === 'encryption_settings' && (
            <EncryptionSettings
              settings={server.encryption_settings}
              onChange={(v) => setServer((s) => ({ ...s, encryption_settings: v }))}
            />
          )}
          {child.type === 'padding_scheme' && (
            <PaddingSchemeEditor value={server.padding_scheme} onChange={(v) => formChange('padding_scheme', v)} />
          )}
        </ChildDrawer>
      </NodeDrawerFrame>
    </>
  )
}
