import axiosInstance from './axiosInstance'

export type IndexJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed'
export type ParserMode = 'arkanalyzer' | 'placeholder'
export type GraphStoreStatus = 'loaded' | 'pending_setup' | 'failed' | 'not_attempted'
export type GraphQuerySource = 'neo4j' | 'artifact'
export type GraphNodeType = 'Repository' | 'File' | 'Class' | 'Function'
export type GraphEdgeType = 'CONTAINS' | 'CALLS'

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

export interface GraphSeedQuery {
  node_id?: string
  name?: string
  path?: string
  signature?: string
  max_matches?: number
}

export interface GraphEvidenceQueryRequest {
  seeds: GraphSeedQuery[]
  max_hops: number
  max_paths: number
  edge_types: GraphEdgeType[]
}

export interface GraphNode {
  node_id: string
  node_type: GraphNodeType
  name: string
  path: string
  start_line?: number | null
  end_line?: number | null
  signature: string
}

export interface GraphEdge {
  edge_type: GraphEdgeType
  source_id: string
  target_id: string
  detail: string
}

export interface GraphSeedMatch {
  seed: GraphSeedQuery
  matched_nodes: GraphNode[]
}

export interface GraphEvidencePathStep {
  node_id: string
  node_type: GraphNodeType
  name: string
  path: string
  start_line?: number | null
  end_line?: number | null
  signature: string
  relation_from_prev?: GraphEdgeType | null
}

export interface GraphEvidencePath {
  path_id: string
  hop_count: number
  nodes: GraphEvidencePathStep[]
}

export interface GraphEvidenceSummary {
  matched_seed_count: number
  expanded_node_count: number
  expanded_edge_count: number
  evidence_path_count: number
}

export interface GraphEvidenceQueryResponse {
  job_id: string
  snapshot_id: string
  source: GraphQuerySource
  seed_matches: GraphSeedMatch[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  paths: GraphEvidencePath[]
  summary: GraphEvidenceSummary
  hints: string[]
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

export const deleteIndexJob = (jobId: string) => {
  return axiosInstance.delete(`/indexing/jobs/${jobId}`).then((res) => res.data)
}

export const queryIndexEvidence = (jobId: string, payload: GraphEvidenceQueryRequest) => {
  return axiosInstance.post<GraphEvidenceQueryResponse>(`/indexing/jobs/${jobId}/evidence`, payload).then((res) => res.data)
}
