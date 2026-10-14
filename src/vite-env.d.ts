/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '@tabler/icons-react' {
  import type { ComponentPropsWithoutRef } from 'react'
  type IconProps = ComponentPropsWithoutRef<'svg'> & { size?: number; color?: string; stroke?: number }
  type Icon = (props: IconProps) => JSX.Element

  export const IconCalendar: Icon
  export const IconCalendarEvent: Icon
  export const IconLayoutGrid: Icon
  export const IconRepeat: Icon
  export const IconChecks: Icon
  export const IconPlus: Icon
  export const IconChevronLeft: Icon
  export const IconChevronRight: Icon
  export const IconInbox: Icon
  export const IconClock: Icon
  export const IconFlag: Icon
  export const IconFolder: Icon
  export const IconTag: Icon
  export const IconX: Icon
  export const IconFlame: Icon
  export const IconBrandGoogle: Icon
  export const IconBrandGithub: Icon
  export const IconSearch: Icon
  export const IconTrash: Icon
  export const IconLayoutList: Icon
  export const IconLayoutColumns: Icon
  export const IconLogout: Icon
  export const IconChartBar: Icon
  export const IconPlayerPlay: Icon
  export const IconPlayerPause: Icon
  export const IconRotate: Icon
}
