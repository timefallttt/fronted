import axiosInstance from './axiosInstance'
import type { ReviewTaskDetail } from './consistency'

export type WorkItemPriority = 'high' | 'medium' | 'low'
export type ConnectorMode = 'demo' | 'custom'
export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed'

export interface WorkItemConnectorSummary {
  connector_key: string
  name: string
  description: string
  mode: ConnectorMode
}

export interface WorkItemCodeSeed {
  seed_id: string
  filename: string
  code: string
  start_line: number
  end_line: number
  recall_reason: string
  source: string
}

export interface WorkItemDiffHunk {
  hunk_id: string
  header: string
  start_line: number
  end_line: number
  added_lines: string[]
  removed_lines: string[]
  context_lines: string[]
}

export interface WorkItemFileDiff {
  diff_id: string
  filename: string
  change_type: DiffChangeType
  additions: number
  deletions: number
  hunks: WorkItemDiffHunk[]
}

export interface WorkItemLinkedCommit {
  commit_id: string
  commit_hash: string
  title: string
  author: string
  created_at: string
  message: string
  file_diffs: WorkItemFileDiff[]
}

export interface WorkItemSummary {
  connector_key: string
  item_id: string
  requirement_id: string
  title: string
  repo_name: string
  business_tag: string
  priority: WorkItemPriority
  status: string
  updated_at: string
}

export interface WorkItemDetail extends WorkItemSummary {
  requirement_text: string
  acceptance_criteria: string[]
  owner: string
  notes: string
  external_url: string
  linked_commits: WorkItemLinkedCommit[]
  derived_seeds: WorkItemCodeSeed[]
  derived_seed_count: number
  snapshot_hint: string
}

export interface WorkItemConnectorListResponse {
  connectors: WorkItemConnectorSummary[]
}

export interface WorkItemListResponse {
  connector: WorkItemConnectorSummary
  items: WorkItemSummary[]
}

export interface WorkItemImportRequest {
  connector_key: string
  item_id: string
  index_job_id?: string
  repo_name?: string
  snapshot?: string
  auto_expand_graph_evidence?: boolean
}

export const listWorkItemConnectors = () => {
  return axiosInstance.get<WorkItemConnectorListResponse>('/workitems/connectors').then((res) => res.data)
}

export const listWorkItems = (connectorKey: string) => {
  return axiosInstance.get<WorkItemListResponse>('/workitems/items', { params: { connector: connectorKey } }).then((res) => res.data)
}

export const getWorkItemDetail = (connectorKey: string, itemId: string) => {
  return axiosInstance.get<WorkItemDetail>(`/workitems/items/${itemId}`, { params: { connector: connectorKey } }).then((res) => res.data)
}

export const importWorkItem = (payload: WorkItemImportRequest) => {
  return axiosInstance.post<ReviewTaskDetail>('/workitems/import', payload).then((res) => res.data)
}
