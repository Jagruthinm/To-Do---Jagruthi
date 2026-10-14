const QUEUE_KEY = 'taskflow_mutation_queue'

interface QueueEntry {
  method: string
  url: string
  body: string | null
}

function readQueue(): QueueEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') }
  catch { return [] }
}

function writeQueue(q: QueueEntry[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export function enqueue(method: string, url: string, body: unknown): void {
  const q = readQueue()
  q.push({ method, url, body: body != null ? JSON.stringify(body) : null })
  writeQueue(q)
}

export function flush(): void {
  const q = readQueue()
  if (!q.length) return
  const token = localStorage.getItem('taskflow_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  ;(async () => {
    const remaining: QueueEntry[] = []
    for (const entry of q) {
      try {
        const res = await fetch(entry.url, {
          method: entry.method,
          headers,
          body: entry.body,
        })
        if (!res.ok) remaining.push(entry)   // HTTP error — keep for retry
      } catch {
        remaining.push(entry)                 // network error — keep for retry
        break                                 // stop replaying; connection not restored
      }
    }
    writeQueue(remaining)
  })()
}
