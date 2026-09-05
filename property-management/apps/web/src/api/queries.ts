import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@paltas/shared'
import type {
  ActivityEvent, ApprovalItem, Tone, DocumentDetail, DocumentRecord, DocumentTemplateRecord,
  DocumentsSummary, Entity, Lead, Metrics, Property, Task, Tenant, Unit,
  WorkOrder, WorkOrderStatus, WorkflowDef,
} from '@paltas/shared'
import { api } from './client'

/* ------------------------------------------------------------------ reads */

export const useMetrics    = () => useQuery({ queryKey: [QUERY_KEYS.metrics],    queryFn: () => api.get<Metrics>('/metrics') })
export const useProperties = () => useQuery({ queryKey: [QUERY_KEYS.properties], queryFn: () => api.get<Property[]>('/properties') })
export const useTenants    = () => useQuery({ queryKey: [QUERY_KEYS.tenants],    queryFn: () => api.get<Tenant[]>('/tenants') })
export const useLeads      = () => useQuery({ queryKey: [QUERY_KEYS.leads],      queryFn: () => api.get<Lead[]>('/leads') })
export const useWorkOrders = () => useQuery({ queryKey: [QUERY_KEYS.workOrders], queryFn: () => api.get<WorkOrder[]>('/work-orders') })
export const useWorkflows  = () => useQuery({ queryKey: [QUERY_KEYS.workflows],  queryFn: () => api.get<WorkflowDef[]>('/workflows') })
export const useEntities   = () => useQuery({ queryKey: [QUERY_KEYS.entities],   queryFn: () => api.get<Entity>('/entities') })

export const useUnits = (status?: Unit['status']) => useQuery({
  queryKey: [QUERY_KEYS.units, status ?? 'all'],
  queryFn: () => api.get<Unit[]>(status ? `/units?status=${status}` : '/units'),
})

export const useApprovals = (status?: 'pending' | 'approved' | 'declined') => useQuery({
  queryKey: [QUERY_KEYS.approvals, status ?? 'all'],
  queryFn: () => api.get<ApprovalItem[]>(status ? `/approvals?status=${status}` : '/approvals'),
})

export const useTasks = (kind?: 'priority' | 'alert') => useQuery({
  queryKey: [QUERY_KEYS.tasks, kind ?? 'all'],
  queryFn: () => api.get<Task[]>(kind ? `/tasks?kind=${kind}` : '/tasks'),
})

export const useActivity = (limit = 40) => useQuery({
  queryKey: [QUERY_KEYS.activity, limit],
  queryFn: () => api.get<ActivityEvent[]>(`/activity?limit=${limit}`),
})

/* -------------------------------------------------------------- mutations */

/**
 * Each mutation updates the cache optimistically so the click feels instant,
 * rolls back if the server rejects it, and settles on the server's answer. The
 * WebSocket then tells every *other* tab to refetch — this client already knows.
 */

export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'approved' | 'declined'; note?: string }) =>
      api.patch<ApprovalItem>(`/approvals/${id}`, { status, note, actor: 'Ahmed Akboole' }),

    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.approvals] })
      const previous = qc.getQueriesData<ApprovalItem[]>({ queryKey: [QUERY_KEYS.approvals] })
      qc.setQueriesData<ApprovalItem[]>({ queryKey: [QUERY_KEYS.approvals] }, (old) =>
        old?.map((a) => (a.id === id ? { ...a, status } : a)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.approvals] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

export function useToggleTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api.patch<Task>(`/tasks/${id}`, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.tasks] })
      const previous = qc.getQueriesData<Task[]>({ queryKey: [QUERY_KEYS.tasks] })
      qc.setQueriesData<Task[]>({ queryKey: [QUERY_KEYS.tasks] }, (old) =>
        old?.map((t) => (t.id === id ? { ...t, done } : t)))
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.tasks] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

export function useToggleWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<WorkflowDef>(`/workflows/${id}`, { enabled }),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.workflows] })
      const previous = qc.getQueryData<WorkflowDef[]>([QUERY_KEYS.workflows])
      qc.setQueryData<WorkflowDef[]>([QUERY_KEYS.workflows], (old) =>
        old?.map((w) => (w.id === id ? { ...w, enabled } : w)))
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData([QUERY_KEYS.workflows], ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.workflows] }),
  })
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, assignee }: { id: string; status?: WorkOrderStatus; assignee?: string }) =>
      api.patch<WorkOrder>(`/work-orders/${id}`, { status, assignee }),
    onMutate: async ({ id, status, assignee }) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.workOrders] })
      const previous = qc.getQueryData<WorkOrder[]>([QUERY_KEYS.workOrders])
      qc.setQueryData<WorkOrder[]>([QUERY_KEYS.workOrders], (old) =>
        old?.map((w) => (w.id === id ? { ...w, ...(status && { status }), ...(assignee && { assignee }) } : w)))
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData([QUERY_KEYS.workOrders], ctx?.previous),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.workOrders] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

export function useCreateWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { issue: string; location: string; priority: 'urgent' | 'high' | 'routine'; assignee?: string; cost?: number }) =>
      api.post<WorkOrder>('/work-orders', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.workOrders] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post<Tenant>(`/tenants/${id}/payment`, { amount }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.tenants] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}


/* ------------------------------------------------------------- documents */

const DOCS = 'documents'

export const useDocuments = (filter?: { category?: string; expiring?: boolean }) => useQuery({
  queryKey: [DOCS, filter?.category ?? 'all', filter?.expiring ?? false],
  queryFn: () => {
    const params = new URLSearchParams()
    if (filter?.category) params.set('category', filter.category)
    if (filter?.expiring) params.set('expiring', 'true')
    const qs = params.toString()
    return api.get<DocumentRecord[]>(`/documents${qs ? `?${qs}` : ''}`)
  },
})

export const useDocument = (id: string | null) => useQuery({
  queryKey: [DOCS, 'detail', id],
  queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  enabled: !!id,
})

export const useDocumentsSummary = () => useQuery({
  queryKey: [DOCS, 'summary'],
  queryFn: () => api.get<DocumentsSummary>('/documents-summary'),
})

export const useDocumentTemplates = () => useQuery({
  queryKey: ['document-templates'],
  queryFn: () => api.get<DocumentTemplateRecord[]>('/document-templates'),
})

/** Downloads a stored version through the API, preserving its filename. */
export async function downloadDocument(id: string, name: string, version?: number) {
  const base = import.meta.env.VITE_API_URL ?? ''
  const url = `${base}/api/documents/${id}/download${version ? `?version=${version}` : ''}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}${version ? ` v${version}` : ''}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

/** Reads a picked File into the base64 payload the upload endpoint expects. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

const invalidateDocs = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: [DOCS] })
  qc.invalidateQueries({ queryKey: ['document-templates'] })
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.activity] })
}

export interface UploadInput {
  name: string
  category: DocumentRecord['category']
  appliesTo: string
  owner: string
  expiresAt?: string | null
  file: File
  changeNote?: string
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      const contentBase64 = await readFileAsBase64(input.file)
      return api.post<DocumentRecord>('/documents', {
        name: input.name,
        category: input.category,
        appliesTo: input.appliesTo,
        owner: input.owner,
        expiresAt: input.expiresAt ?? null,
        fileName: input.file.name,
        mimeType: input.file.type || 'application/octet-stream',
        contentBase64,
        changeNote: input.changeNote,
      })
    },
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useUploadVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file, changeNote }: { id: string; file: File; changeNote?: string }) => {
      const contentBase64 = await readFileAsBase64(file)
      return api.post<DocumentRecord>(`/documents/${id}/versions`, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
        changeNote,
      })
    },
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Pick<DocumentRecord, 'name' | 'appliesTo' | 'owner' | 'expiresAt' | 'status'>>) =>
      api.patch<DocumentRecord>(`/documents/${id}`, patch),
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/documents/${id}`),
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useRequestSignatures() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, signers }: { id: string; signers: Array<{ name: string; email: string }> }) =>
      api.post<DocumentRecord>(`/documents/${id}/signatures`, { signers }),
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useAdvanceSignature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ signatureId, status }: { signatureId: string; status: 'viewed' | 'signed' | 'declined' }) =>
      api.patch(`/signatures/${signatureId}`, { status }),
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useGenerateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      templateId: string; name: string; appliesTo: string
      expiresAt?: string | null; values: Record<string, string>
    }) => api.post<DocumentRecord>('/documents/generate', input),
    onSuccess: () => invalidateDocs(qc),
  })
}

export function useSweepExpiry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ expired: number; documents: string[] }>('/documents/sweep-expiry', {}),
    onSuccess: () => invalidateDocs(qc),
  })
}

/* --------------------------------------------------------- bulk actions */

/** "Mark all read" on the notifications screen. */
export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ cleared: number }>('/tasks/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.tasks] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.activity] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

/** "Approve selected" on the approvals queue. */
export function useDecideMany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids: string[]; status: 'approved' | 'declined' }) =>
      api.post<{ decided: number; skipped: Array<{ id: string; reason: string }> }>(
        '/approvals/decide-many', { ...input, actor: 'Ahmed Akboole' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.approvals] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.activity] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

/** Downloads the audit trail, optionally narrowed to one module. */
export async function downloadAuditLog(module?: string): Promise<number> {
  const base = import.meta.env.VITE_API_URL ?? ''
  const res = await fetch(`${base}/api/activity/export.csv${module && module !== 'all' ? `?module=${encodeURIComponent(module)}` : ''}`)
  if (!res.ok) throw new Error(`Export failed (${res.status})`)

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return blob.size
}

/* ------------------------------------------------- core domain creation */

/** Each of these posts to a first-class table and refreshes what depends on it. */
function useCreateInto<TInput, TResult>(path: string, keys: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => api.post<TResult>(path, input),
    onSuccess: () => {
      for (const key of [...keys, QUERY_KEYS.activity, QUERY_KEYS.metrics]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const useCreateProperty = () => useCreateInto<{
  name: string; location: string; country: string; type: string; units: number; valuation: number
}, Property>('/properties', [QUERY_KEYS.properties])

export const useCreateUnit = () => useCreateInto<{
  name: string; propertyId: string; type: string; price: number; status: Unit['status']
}, Unit>('/units', [QUERY_KEYS.units])

export const useCreateLead = () => useCreateInto<{
  name: string; contact: string; interest: string; source: string
  budget: number; value: number; owner: string; stage: Lead['stage']
}, Lead>('/leads', [QUERY_KEYS.leads])

export const useCreateTenancy = () => useCreateInto<{
  name: string; unit: string; property: string; rent: number
  deposit: number; since: string; band: Tenant['band']
}, Tenant>('/tenants', [QUERY_KEYS.tenants])

/** Applies the scheduled rent against every account in arrears. */
export function useRentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ collected: number; cleared: number; total: number }>('/tenants/rent-run', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.tenants] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.activity] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}

export const useCreateTask = () => useCreateInto<{
  title: string; detail?: string; kind?: 'priority' | 'alert'; tone?: Tone; tags?: string[]
}, Task>('/tasks', [QUERY_KEYS.tasks])

/** Repricing from the vacancy and pricing tables. */
export function useUpdateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; price?: number; status?: Unit['status'] }) =>
      api.patch<Unit>(`/units/${id}`, body),

    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.units] })
      const previous = qc.getQueriesData<Unit[]>({ queryKey: [QUERY_KEYS.units] })
      qc.setQueriesData<Unit[]>({ queryKey: [QUERY_KEYS.units] }, (old) =>
        old?.map((u) => (u.id === id ? { ...u, ...body } : u)))
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.units] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.activity] })
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.metrics] })
    },
  })
}
