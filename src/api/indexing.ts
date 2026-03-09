import axiosInstance from './axiosInstance'

export type IndexJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed'
export type ParserMode = 'arkanalyzer' | 'placeholder'
export type GraphStoreStatus = 'loaded' | 'pending_setup' | 'failed' | 'not_attempted'

export interface RepositoryIndexRequest {
  repo_url: string
  branch: string
  repo_name?: string
  auto_run: boolean
}

export interface RepoSnapshot {
  repo_url: string
  branch: string
  repo_name: string
  local_path: string
  commit_hash: string
}

export interface GraphBuildStats {
  file_count: number
  class_count: number
  function_count: number
  edge_count: number
}

export interface IndexJobSummary {
  job_id: string
  status: IndexJobStatus
  repo_name: string
  branch: string
  parser_mode: ParserMode
  graph_store_status: GraphStoreStatus
  created_at: string
  updated_at: string
}

export interface IndexJobDetail {
  summary: IndexJobSummary
  snapshot: RepoSnapshot
  current_step: string
  logs: string[]
  artifact_dir: string
  parser_output_path: string
  graph_artifact_path: string
  graph_stats: GraphBuildStats
  setup_hints: string[]
}

export interface IndexJobListResponse {
  jobs: IndexJobSummary[]
}

export const listIndexJobs = () => {
  return axiosInstance.get<IndexJobListResponse>('/indexing/jobs').then((res) => res.data)
}

export const getIndexJob = (jobId: string) => {
  return axiosInstance.get<IndexJobDetail>(`/indexing/jobs/${jobId}`).then((res) => res.data)
}

export const createIndexJob = (payload: RepositoryIndexRequest) => {
  return axiosInstance.post<IndexJobDetail>('/indexing/jobs', payload).then((res) => res.data)
}

export const runIndexJob = (jobId: string) => {
  return axiosInstance.post<IndexJobDetail>(`/indexing/jobs/${jobId}/run`).then((res) => res.data)
}

