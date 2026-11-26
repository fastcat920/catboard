import { Button, Space } from 'antd'
import MarkdownIt from 'markdown-it'
import { useLayoutEffect, useRef } from 'react'

const markdown = new MarkdownIt({ breaks: true })
const htmlTag = /<\/?[a-z][\w-]*(?:\s|\/?>)/i
const allowedTags = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY',
  'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
])
const discardedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'TEMPLATE'])

function cleanHtml(html: string) {
  const source = new DOMParser().parseFromString(html, 'text/html')
  const result = document.createElement('div')

  function append(node: Node, parent: HTMLElement) {
    if (node.nodeType === Node.TEXT_NODE) {
      let value = node.textContent ?? ''
      const blockStart = !node.previousSibling || (node.previousSibling instanceof Element &&
        ['BR', 'DIV', 'P'].includes(node.previousSibling.tagName))
      if (blockStart && !parent.closest('pre, code')) {
        value = value.replace(/^ +/, (spaces) => '\u00a0'.repeat(spaces.length))
      }
      parent.append(document.createTextNode(value))
      return
    }
    if (!(node instanceof Element) || discardedTags.has(node.tagName)) return
    let target = parent
    if (allowedTags.has(node.tagName)) {
      target = document.createElement(node.tagName)
      const urlAttribute = node.tagName === 'A' ? 'href' : node.tagName === 'IMG' ? 'src' : null
      const url = urlAttribute && node.getAttribute(urlAttribute)
      if (url && urlAttribute) {
        try {
          const parsed = new URL(url, document.baseURI)
          if (['https:', 'http:'].includes(parsed.protocol) ||
              (urlAttribute === 'href' && parsed.protocol === 'mailto:')) {
            target.setAttribute(urlAttribute, url)
          }
        } catch {
          // Leave invalid URLs out of the announcement.
        }
      }
      const alt = node.tagName === 'IMG' ? node.getAttribute('alt') : null
      if (alt !== null) target.setAttribute('alt', alt)
      parent.append(target)
    }
    node.childNodes.forEach((child) => append(child, target))
  }

  source.body.childNodes.forEach((node) => append(node, result))
  if (!result.textContent?.trim() && !result.querySelector('img[src]')) return ''
  return result.innerHTML
}

function initialHtml(value: string) {
  if (htmlTag.test(value)) return cleanHtml(value)
  // Existing plain-text and Markdown announcements keep their formatting.
  const withoutIndent = value.replace(/^( +)/gm, (spaces) => '\u00a0'.repeat(spaces.length))
  return cleanHtml(markdown.render(withoutIndent).replace(/>\n(?=<)/g, '>'))
}

const toolbar = [
  ['加粗', 'bold'],
  ['斜体', 'italic'],
  ['下划线', 'underline'],
  ['小标题', 'formatBlock', 'h3'],
  ['项目符号', 'insertUnorderedList'],
  ['编号列表', 'insertOrderedList'],
  ['首行缩进', 'insertText', '\u00a0\u00a0'],
] as const

export function NoticeEditor({ label, value, onChange }: {
  label: string
  value?: string | null
  onChange: (value: string) => void
}) {
  const editor = useRef<HTMLDivElement>(null)
  const initialValue = useRef(value ?? '')

  useLayoutEffect(() => {
    if (editor.current) editor.current.innerHTML = initialHtml(initialValue.current)
  }, [])

  const sync = () => {
    if (editor.current) onChange(cleanHtml(editor.current.innerHTML))
  }

  return (
    <div>
      <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
        {toolbar.map(([title, command, argument]) => (
          <Button
            key={command}
            size="small"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.current?.focus()
              document.execCommand('styleWithCSS', false, 'false')
              document.execCommand(command, false, argument)
              sync()
            }}
          >
            {title}
          </Button>
        ))}
      </Space>
      <div
        ref={editor}
        className="ant-input"
        contentEditable
        role="textbox"
        aria-label={label}
        aria-multiline
        onInput={sync}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
          sync()
        }}
        onDrop={(event) => event.preventDefault()}
        style={{ minHeight: 150, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      />
    </div>
  )
}
