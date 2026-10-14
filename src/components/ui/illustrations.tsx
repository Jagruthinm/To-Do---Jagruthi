export function IllustrationToday() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="36" cy="36" r="13" />
      <path d="M29 36 L34 41 L44 31" />
      <line x1="36" y1="5"  x2="36" y2="13" />
      <line x1="36" y1="59" x2="36" y2="67" />
      <line x1="5"  y1="36" x2="13" y2="36" />
      <line x1="59" y1="36" x2="67" y2="36" />
      <line x1="13.9" y1="13.9" x2="19.1" y2="19.1" />
      <line x1="52.9" y1="52.9" x2="58.1" y2="58.1" />
      <line x1="58.1" y1="13.9" x2="52.9" y2="19.1" />
      <line x1="13.9" y1="58.1" x2="19.1" y2="52.9" />
    </svg>
  )
}

export function IllustrationInbox() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Tray body */}
      <path d="M8 42 L8 60 Q8 64 12 64 L60 64 Q64 64 64 60 L64 42" />
      {/* Tray slot */}
      <path d="M8 42 L20 42 Q24 42 24 46 Q24 52 30 52 L42 52 Q48 52 48 46 Q48 42 52 42 L64 42" />
      {/* Arrow up (item out of inbox) */}
      <line x1="36" y1="14" x2="36" y2="36" />
      <polyline points="28,22 36,14 44,22" />
    </svg>
  )
}

export function IllustrationProjects() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Folder */}
      <path d="M8 28 L8 58 Q8 62 12 62 L60 62 Q64 62 64 58 L64 36 Q64 32 60 32 L38 32 L34 26 Q32 24 30 24 L12 24 Q8 24 8 28 Z" />
      {/* Plus inside */}
      <line x1="36" y1="41" x2="36" y2="53" />
      <line x1="30" y1="47" x2="42" y2="47" />
    </svg>
  )
}

export function IllustrationHabits() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Circular arrow (habit loop) */}
      <path d="M54 36 A18 18 0 1 1 36 18" />
      <polyline points="30,12 36,18 30,24" />
      {/* Three check marks suggesting daily completion */}
      <path d="M26 38 L30 42 L38 34" strokeWidth="2" />
      <circle cx="36" cy="38" r="0" />
    </svg>
  )
}
