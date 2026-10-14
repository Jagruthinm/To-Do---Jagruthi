import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatSessionSidebar } from '@/components/chat/ChatSessionSidebar'
import { Toast } from '@/components/ui/Toast'
import { useChat } from '@/hooks/useChat'
import { useChatHistory } from '@/hooks/useChatHistory'
import { useNotifications } from '@/hooks/useNotifications'
import styles from './ChatView.module.css'

export function ChatView() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const {
    sessionId: chatSessionId,
    messages,
    streamingText,
    activeToolCalls,
    isStreaming,
    error,
    sendMessage,
    loadSession,
    resetSession,
  } = useChat()

  const { sessions, loading, fetchSessions, deleteSession, refreshAfterSend } = useChatHistory()
  const { refresh: refreshNotifications } = useNotifications()

  // Load sessions list on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Load session from URL param when it changes
  useEffect(() => {
    if (urlSessionId) {
      loadSession(urlSessionId)
    } else {
      resetSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId])

  // After sendMessage creates a new session, navigate to its URL.
  // Only fires when chatSessionId transitions from null → newId (i.e. first message sent).
  useEffect(() => {
    if (chatSessionId && !urlSessionId) {
      navigate(`/chat/${chatSessionId}`, { replace: true })
    }
  }, [chatSessionId, urlSessionId, navigate])

  // When the session is reset (New Chat), navigate back to /chat if still on a session URL.
  useEffect(() => {
    if (!chatSessionId && urlSessionId) {
      navigate('/chat', { replace: true })
    }
  }, [chatSessionId, urlSessionId, navigate])

  async function handleSend(text: string) {
    setToast('Your request is being processed...')
    await sendMessage(text)
    refreshAfterSend()
    refreshNotifications()
  }

  function handleChipClick(text: string) {
    handleSend(text)
  }

  function handleNewChat() {
    resetSession()
    setSidebarOpen(false)
  }

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSession(id)
    if (id === urlSessionId) {
      navigate('/chat')
    }
  }, [deleteSession, navigate, urlSessionId])

  return (
    <div className={styles.view}>
      <ChatSessionSidebar
        sessions={sessions}
        loading={loading}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
      />

      <div className={styles.main}>
        <TopBar
          title="AI Assistant"
          right={
            <button
              className={styles.sidebarToggle}
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle chat sessions sidebar"
              aria-expanded={sidebarOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </button>
          }
        />

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <ChatThread
          messages={messages}
          streamingText={streamingText}
          activeToolCalls={activeToolCalls}
          isStreaming={isStreaming}
          onChipClick={handleChipClick}
        />

        <ChatInput onSend={handleSend} isStreaming={isStreaming} />
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
