import { useEffect, useRef } from 'react'
import type { ChatMessage as ChatMessageType, ToolCallDisplay } from '@/hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ToolCallAccordion } from './ToolCallAccordion'
import { TypingIndicator } from './TypingIndicator'
import ReactMarkdown from 'react-markdown'
import styles from './ChatThread.module.css'

interface Props {
  messages: ChatMessageType[]
  streamingText: string
  activeToolCalls: ToolCallDisplay[]
  isStreaming: boolean
  onChipClick?: (text: string) => void
}

export function ChatThread({
  messages,
  streamingText,
  activeToolCalls,
  isStreaming,
  onChipClick,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingText, activeToolCalls.length])

  return (
    <div className={styles.thread} role="log" aria-live="polite" aria-label="Chat messages">
      {messages.length === 0 && !isStreaming && (
        <div className={styles.empty}>
          <p className={styles.emptyHint}>Ask me anything about your tasks, habits, or productivity.</p>
        </div>
      )}

      {messages.map(msg => (
        <ChatMessage key={msg.id} message={msg} onChipClick={onChipClick} />
      ))}

      {/* Live tool calls during streaming */}
      {isStreaming && activeToolCalls.length > 0 && (
        <div className={styles.activeToolCalls}>
          {activeToolCalls.map(tc => (
            <ToolCallAccordion key={tc.callId} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Live streaming text preview */}
      {isStreaming && streamingText && (
        <div className={styles.streamingWrapper}>
          <div className={styles.streamingBubble}>
            <ReactMarkdown>{streamingText}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Typing indicator — shown when streaming but no text yet */}
      {isStreaming && !streamingText && (
        <div className={styles.typingWrapper}>
          <TypingIndicator />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
