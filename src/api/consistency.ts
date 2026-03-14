import axiosInstance from './axiosInstance'

export type JudgementStatus = 'satisfied' | 'partially_satisfied' | 'not_satisfied'
export type TaskStatus = 'draft' | 'ready' | 'completed' | 'needs_review'
export type FeedbackDecision = 'agree' | 'question' | 'misjudged'
export type Priority = 'high' | 'medium' | 'low'
export type NodeType = 'requirement' | 'file' | 'class' | 'function' | 'constraint' | 'ui' | 'service'

export interface CandidateSnippet {
  snippet_id: string
  filename: string
  code: string
  start_line: number
  end_line: number
  recall_reason: string
  source: string
  selected: boolean
}

export interface AnalyzeOptions {
  top_k: number
  keyword_min_overlap: number
  enable_tool_evidence: boolean
}

export interface GraphEvidenceStepInput {
  node_id: string
  node_type: string
  name: string
  path: string
  relation_from_prev?: string | null
}

export interface GraphEvidencePathInput {
  path_id: string
  hop_count: number
  nodes: GraphEvidenceStepInput[]
}

export interface GraphEvidenceSummaryInput {
  matched_seed_count: number
  expanded_node_count: number
  expanded_edge_count: number
  evidence_path_count: number
}

export interface GraphEvidenceBundle {
  source: string
  hints: string[]
  paths: GraphEvidencePathInput[]
  summary: GraphEvidenceSummaryInput
}

export interface RequirementSpec {
  intents: string[]
  constraints: string[]
  exceptions: string[]
}

export interface EvidenceRef {
  snippet_id: string
  filename: string
  start_line: number
  end_line: number
  reason: string
}

export interface EvidencePathNode {
  node_id: string
  label: string
  node_type: NodeType
  relation_from_prev?: string | null
  detail: string
}

export interface EvidencePath {
  path_id: string
  title: string
  summary: string
  supports_items: string[]
  nodes: EvidencePathNode[]
}

export interface ItemJudgement {
  item: string
  status: JudgementStatus
  score: number
  confidence: number
  evidence: EvidenceRef[]
  notes: string
}

export interface ToolFinding {
  level: 'info' | 'warning' | 'error'
  message: string
  related_item?: string | null
}

export interface LlmEvidenceSnippet {
  snippet_id: string
  source: 'candidate' | 'diff_seed'
  filename: string
  start_line: number
  end_line: number
  code: string
  reason: string
}

export interface LlmEvidenceGraphNode {
  node_id: string
  label: string
  node_type: NodeType
  path: string
  start_line?: number | null
  end_line?: number | null
  signature: string
  code_excerpt: string
  relation_from_prev?: string | null
}

export interface LlmEvidencePath {
  path_id: string
  title: string
  summary: string
  supports_items: string[]
  nodes: LlmEvidenceGraphNode[]
}

export interface LlmEvidenceRequirementItem {
  item: string
  status_hint: JudgementStatus
  snippet_ids: string[]
  path_ids: string[]
  negative_signals: string[]
}

export interface LlmEvidencePack {
  requirement_text: string
  acceptance_criteria: string[]
  snippets: LlmEvidenceSnippet[]
  graph_paths: LlmEvidencePath[]
  requirement_items: LlmEvidenceRequirementItem[]
  structural_gaps: string[]
  tool_findings: ToolFinding[]
}

export interface ReviewReport {
  overall_score: number
  overall_confidence: number
  status: 'completed' | 'needs_review'
  requirement_spec: RequirementSpec
  judgements: ItemJudgement[]
  missing_items: string[]
  tool_findings: ToolFinding[]
  evidence_paths: EvidencePath[]
  structural_gaps: string[]
  review_focuses: string[]
  evidence_pack?: LlmEvidencePack | null
  summary: string
}

export interface ReviewTaskSummary {
  task_id: string
  requirement_id: string
  title: string
  repo_name: string
  snapshot: string
  business_tag: string
  priority: Priority
  status: TaskStatus
  overall_score: number
  updated_at: string
}

export interface ReviewFeedback {
  feedback_id: string
  judgement_item: string
  decision: FeedbackDecision
  comment: string
  reviewer: string
  created_at: string
}

export interface ReviewHistoryRecord {
  record_id: string
  label: string
  status: TaskStatus
  overall_score: number
  summary: string
  changed_points: string[]
  created_at: string
}

export interface ReviewTaskDetail {
  task: ReviewTaskSummary
  requirement_text: string
  acceptance_criteria: string[]
  owner: string
  notes: string
  candidate_snippets: CandidateSnippet[]
  graph_evidence?: GraphEvidenceBundle | null
  report: ReviewReport | null
  feedback_entries: ReviewFeedback[]
}

export interface ReviewDashboardStats {
  total_tasks: number
  needs_review_tasks: number
  completed_tasks: number
  avg_score: number
}

export interface ReviewDashboardResponse {
  stats: ReviewDashboardStats
  tasks: ReviewTaskSummary[]
}

export interface ReviewTaskListResponse {
  tasks: ReviewTaskSummary[]
}

export interface ReviewHistoryResponse {
  task_id: string
  records: ReviewHistoryRecord[]
}

export interface ReviewTaskCreateRequest {
  requirement_id: string
  title: string
  requirement_text: string
  acceptance_criteria: string[]
  repo_name: string
  snapshot: string
  business_tag: string
  priority: Priority
  owner: string
  notes: string
  candidate_snippets: CandidateSnippet[]
  graph_evidence?: GraphEvidenceBundle | null
  options: AnalyzeOptions
}

export interface ReviewFeedbackRequest {
  judgement_item: string
  decision: FeedbackDecision
  comment: string
  reviewer: string
}

export interface ConsistencyAnalyzeRequest {
  requirement_text: string
  acceptance_criteria: string[]
  candidate_snippets: CandidateSnippet[]
  graph_evidence?: GraphEvidenceBundle | null
  options: AnalyzeOptions
}

export const getReviewDashboard = () => {
  return axiosInstance.get<ReviewDashboardResponse>('/consistency/dashboard').then((res) => res.data)
}

export const listReviewTasks = () => {
  return axiosInstance.get<ReviewTaskListResponse>('/consistency/tasks').then((res) => res.data)
}

export const getReviewTask = (taskId: string) => {
  return axiosInstance.get<ReviewTaskDetail>(`/consistency/tasks/${taskId}`).then((res) => res.data)
}

export const createReviewTask = (payload: ReviewTaskCreateRequest) => {
  return axiosInstance.post<ReviewTaskDetail>('/consistency/tasks', payload).then((res) => res.data)
}

export const analyzeReviewTask = (taskId: string) => {
  return axiosInstance.post<ReviewTaskDetail>(`/consistency/tasks/${taskId}/analyze`).then((res) => res.data)
}

export const getReviewHistory = (taskId: string) => {
  return axiosInstance.get<ReviewHistoryResponse>(`/consistency/tasks/${taskId}/history`).then((res) => res.data)
}

export const submitReviewFeedback = (taskId: string, payload: ReviewFeedbackRequest) => {
  return axiosInstance.post<ReviewTaskDetail>(`/consistency/tasks/${taskId}/feedback`, payload).then((res) => res.data)
}

export const analyzeConsistency = (payload: ConsistencyAnalyzeRequest) => {
  return axiosInstance.post<ReviewReport>('/consistency/analyze', payload).then((res) => res.data)
}
