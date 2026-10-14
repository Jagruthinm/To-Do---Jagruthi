export interface ReportDefinition {
  id: string
  title: string
  description: string
  tools: string[]
  systemPrompt: string
}

const BASE_SYSTEM_PROMPT = `You are the FocusAI Assistant running in REPORT MODE.
Execute all tool calls automatically without asking for confirmation.
After gathering data, produce a detailed, structured markdown report.
Do not make conversation — just produce the report.`

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'productivity_today',
    title: "Today's Productivity",
    description: 'Tasks completed, pending, and overdue today with a productivity score.',
    tools: ['productivity_summary', 'task_list'],
    systemPrompt: `${BASE_SYSTEM_PROMPT}

[REPORT MODE: productivity_today]
Generate a comprehensive Today's Productivity report.
Use the following tools to gather data: productivity_summary, task_list (view=today), task_list (status=completed).
Format the output as a structured markdown report with sections: Summary, Completed Tasks, Pending Tasks, Overdue Items, and Productivity Score.
Do not ask for confirmation — execute all tool calls automatically.`,
  },
  {
    id: 'weekly_review',
    title: 'Weekly Review',
    description: '7-day completion rate, habit streaks, and highlights for the past week.',
    tools: ['productivity_summary', 'habit_stats', 'task_list'],
    systemPrompt: `${BASE_SYSTEM_PROMPT}

[REPORT MODE: weekly_review]
Generate a comprehensive Weekly Review report.
Use the following tools to gather data: productivity_summary, task_list (view=all, status=completed), habit_stats for each active habit.
Format the output as a structured markdown report with sections: Week Summary, Completed Tasks, Habit Performance, Streaks & Highlights, and Next Week Recommendations.
Do not ask for confirmation — execute all tool calls automatically.`,
  },
  {
    id: 'overdue_analysis',
    title: 'Overdue Task Analysis',
    description: 'All overdue tasks grouped by priority and project with recommended actions.',
    tools: ['task_list', 'project_list'],
    systemPrompt: `${BASE_SYSTEM_PROMPT}

[REPORT MODE: overdue_analysis]
Generate a comprehensive Overdue Task Analysis report.
Use the following tools to gather data: task_list (view=today), project_list.
Identify all tasks with due_date in the past and status=pending.
Format the output as a structured markdown report with sections: Overview, Overdue by Priority, Overdue by Project, and Recommended Actions.
Do not ask for confirmation — execute all tool calls automatically.`,
  },
  {
    id: 'habit_performance',
    title: 'Habit Performance Report',
    description: 'Streak analysis and completion rates for all habits over the last 30 days.',
    tools: ['habit_stats'],
    systemPrompt: `${BASE_SYSTEM_PROMPT}

[REPORT MODE: habit_performance]
Generate a comprehensive Habit Performance Report.
Use project_list to discover all habits, then call habit_stats for each habit (days=30).
Format the output as a structured markdown report with sections: Overview, Individual Habit Analysis (streak, completion rate, trend), Best Performers, Needs Attention, and Recommendations.
Do not ask for confirmation — execute all tool calls automatically.`,
  },
  {
    id: 'project_status',
    title: 'Project Status Report',
    description: 'Progress per project: pending vs completed task counts and next actions.',
    tools: ['project_list', 'task_list'],
    systemPrompt: `${BASE_SYSTEM_PROMPT}

[REPORT MODE: project_status]
Generate a comprehensive Project Status Report.
Use project_list to get all projects, then task_list for each project (both pending and completed).
Format the output as a structured markdown report with sections: Portfolio Overview, Per-Project Status (with progress bar, pending count, completed count, next action), Stalled Projects, and Recommendations.
Do not ask for confirmation — execute all tool calls automatically.`,
  },
]
