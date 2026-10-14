import ReactMarkdown from 'react-markdown'
import type { ChatMessage as ChatMessageType } from '@/hooks/useChat'
import { ToolCallAccordion } from './ToolCallAccordion'
import styles from './ChatMessage.module.css'

interface Props {
  message: ChatMessageType
  onChipClick?: (text: string) => void
}

/** Parse `[label]` button chips from assistant text. */
function parseChips(content: string): { text: string; hasChips: boolean } {
  const chipPattern = /\[([^\]]+)\]/g
  const hasChips = chipPattern.test(content)
  return { text: content, hasChips }
}

function AssistantContent({
  content,
  onChipClick,
}: {
  content: string
  onChipClick?: (text: string) => void
}) {
  // Extract button chips: text like [Yes, delete it] or [Cancel]
  const chipRegex = /\[([^\]]+)\]/g
  const chips: string[] = []
  let match: RegExpExecArray | null
  while ((match = chipRegex.exec(content)) !== null) {
    chips.push(match[1])
  }

  // Strip chip markers from text for markdown rendering
  const textWithoutChips = content.replace(/\[([^\]]+)\]/g, '').trim()

  return (
    <div className={styles.assistantContent}>
      <div className={styles.markdown}>
        <ReactMarkdown>{textWithoutChips || content}</ReactMarkdown>
      </div>
      {chips.length > 0 && onChipClick && (
        <div className={styles.chips}>
          {chips.map(chip => (
            <button
              key={chip}
              className={styles.chip}
              onClick={() => onChipClick(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatMessage({ message, onChipClick }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`${styles.wrapper} ${isUser ? styles.userWrapper : styles.assistantWrapper}`}>
      {/* Tool call accordions sit above the text bubble */}
      {!isUser && message.toolCalls.length > 0 && (
        <div className={styles.toolCalls}>
          {message.toolCalls.map(tc => (
            <ToolCallAccordion key={tc.callId} toolCall={tc} />
          ))}
        </div>
      )}

      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <AssistantContent
            content={message.content}
            onChipClick={onChipClick}
          />
        )}
      </div>
    </div>
  )
}

// Re-export the parse helper so ChatThread can detect chips
export { parseChips }
