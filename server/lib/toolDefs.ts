import type OpenAI from 'openai'

// OpenAI-format function definitions for all 10 FocusAI tools.
// Passed as the `tools` array in chat.completions.create() calls.

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'task_create',
      description: 'Create a new task. Parses natural language dates ("tomorrow", "next Friday", "in 3 days"). Priority: 1=Urgent, 2=High, 3=Medium, 4=None.',
      parameters: {
        type: 'object',
        properties: {
          title:      { type: 'string', description: 'Task title' },
          notes:      { type: 'string', description: 'Optional notes or description' },
          due_date:   { type: 'string', description: 'Due date — ISO (YYYY-MM-DD) or natural language like "tomorrow"' },
          priority:   { type: 'number', enum: [1, 2, 3, 4], description: '1=Urgent, 2=High, 3=Medium, 4=None' },
          project_id: { type: 'string', description: 'Project ID to assign the task to (optional)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_list',
      description: 'List tasks. Filter by view (today/inbox/upcoming/all), project, or status.',
      parameters: {
        type: 'object',
        properties: {
          view:       { type: 'string', enum: ['today', 'inbox', 'upcoming', 'all'], description: 'Predefined filter: today includes overdue, inbox = unassigned, upcoming = next 14 days' },
          project_id: { type: 'string', description: 'Filter by project ID (used when view is omitted)' },
          status:     { type: 'string', enum: ['pending', 'completed', 'cancelled'], description: 'Filter by task status (used when view is omitted)' },
          limit:      { type: 'number', description: 'Max results to return (default 100)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_update',
      description: 'Update any field of an existing task. Only include fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          id:            { type: 'string', description: 'Task ID' },
          title:         { type: 'string' },
          notes:         { type: 'string' },
          due_date:      { type: 'string', description: 'ISO date YYYY-MM-DD' },
          priority:      { type: 'number', enum: [1, 2, 3, 4] },
          status:        { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
          project_id:    { type: 'string', description: 'Move task to this project (null to move to inbox)' },
          kanban_column: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Mark a task as completed.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_delete',
      description: 'Permanently delete a task. Always confirm with the user before calling this.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_search',
      description: 'Search tasks by title or notes substring. Returns non-completed tasks only.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query string' },
        },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_list',
      description: 'List all areas and projects with task counts, and the inbox unassigned task count.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'habit_log',
      description: "Log (or un-log) today's completion for a habit. Calling twice toggles it off.",
      parameters: {
        type: 'object',
        properties: {
          habit_id: { type: 'string', description: 'Habit ID' },
          date:     { type: 'string', description: 'ISO date YYYY-MM-DD (defaults to today)' },
        },
        required: ['habit_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'habit_stats',
      description: 'Get streak and completion rate stats for a specific habit.',
      parameters: {
        type: 'object',
        properties: {
          habit_id: { type: 'string', description: 'Habit ID' },
          days:     { type: 'number', description: 'Look-back window in days for completion rate (default 30)' },
        },
        required: ['habit_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'productivity_summary',
      description: 'Get a productivity snapshot: tasks completed today and this week, overdue count, and top habit streak.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]
