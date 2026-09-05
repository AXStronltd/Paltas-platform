/**
 * Domain types come from the shared package, so the client cannot drift from the
 * API. Only view-layer types are declared here.
 */
export type {
  ActivityEvent, ApprovalItem, ApprovalStatus, DocumentCategory, DocumentDetail,
  DocumentRecord, DocumentStatus, DocumentTemplateRecord, DocumentVersionRecord,
  DocumentsSummary, Entity, ExpiryState, Lead, LiveEvent, Metrics, Property,
  SignatureRecord, SignatureStatus, Task, Tenant, Tone, Unit, WorkOrder,
  WorkOrderStatus, WorkflowDef,
} from '@paltas/shared'

import type { ReactNode } from 'react'

export type SectionId =
  | 'command' | 'portfolio' | 'development' | 'properties' | 'units'
  | 'sales' | 'rentals' | 'stays'
  | 'security' | 'maintenance' | 'facilities' | 'procurement'
  | 'crm' | 'marketing'
  | 'team' | 'finance' | 'analytics' | 'documents' | 'legal' | 'vendors'
  | 'investments' | 'marketplace'
  | 'notifications' | 'automations' | 'ai' | 'approvals' | 'settings' | 'subscription'

export interface NavItem {
  id: SectionId
  label: string
  icon: string
  /**
   * Sidebar counter. `metric` binds it to a live figure from /api/metrics;
   * `recordKind` binds it to that collection's row count. One of the two —
   * a literal badge would go stale the first time anyone changed the data.
   */
  metric?: keyof import('@paltas/shared').Metrics
  recordKind?: string
  urgent?: boolean
}

export interface NavGroup {
  heading?: string
  items: NavItem[]
}

export interface TabDef {
  id: string
  label: string
  count?: number | string
  element: ReactNode
}
