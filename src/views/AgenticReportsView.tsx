import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { apiGet } from '@/hooks/useApi'
import {
  IconChartBar,
  IconCalendarEvent,
  IconClock,
  IconFlame,
  IconLayoutGrid,
} from '@tabler/icons-react'
import styles from './AgenticReportsView.module.css'

interface ReportDef {
  id: string
  title: string
  description: string
  tools: string[]
}

const REPORT_ICON: Record<string, React.ReactNode> = {
  productivity_today: <IconChartBar size={28} />,
  weekly_review: <IconCalendarEvent size={28} />,
  overdue_analysis: <IconClock size={28} />,
  habit_performance: <IconFlame size={28} />,
  project_status: <IconLayoutGrid size={28} />,
}

export function AgenticReportsView() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<ReportDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<ReportDef[]>('/api/reports/definitions')
      .then(data => {
        setReports(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load report definitions.')
        setLoading(false)
      })
  }, [])

  return (
    <div className={styles.view}>
      <TopBar title="Agentic Reports" />
      <div className={styles.content}>
        <p className={styles.subtitle}>
          Run a pre-built AI analysis and get a live structured report.
        </p>

        {loading && <p className={styles.hint}>Loading reports…</p>}
        {error && <p className={styles.hint}>{error}</p>}

        {!loading && !error && (
          <div className={styles.grid}>
            {reports.map(report => (
              <div key={report.id} className={styles.card}>
                <div className={styles.cardIcon}>
                  {REPORT_ICON[report.id] ?? <IconChartBar size={28} />}
                </div>
                <h3 className={styles.cardTitle}>{report.title}</h3>
                <p className={styles.cardDesc}>{report.description}</p>
                <button
                  className={styles.generateBtn}
                  onClick={() => navigate(`/agentic-reports/run/${report.id}`)}
                >
                  Generate
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
