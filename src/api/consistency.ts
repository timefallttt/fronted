import axiosInstance from './axiosInstance'

export interface CandidateSnippet {
  snippet_id: string
  filename: string
  code: string
  start_line: number
  end_line: number
}

export interface AnalyzeOptions {
  top_k: number
  keyword_min_overlap: number
  enable_tool_evidence: boolean
}

export interface ConsistencyAnalyzeRequest {
  requirement_text: string
  acceptance_criteria: string[]
  candidate_snippets: CandidateSnippet[]
  options: AnalyzeOptions
}

export interface EvidenceRef {
  snippet_id: string
  filename: string
  start_line: number
  end_line: number
  reason: string
}

export interface ItemJudgement {
  item: string
  status: 'satisfied' | 'partially_satisfied' | 'not_satisfied'
  score: number
  confidence: number
  evidence: EvidenceRef[]
  notes: string
}

export interface RequirementSpec {
  intents: string[]
  constraints: string[]
  exceptions: string[]
}

export interface ToolFinding {
  level: 'info' | 'warning' | 'error'
  message: string
  related_item?: string | null
}

export interface ConsistencyAnalyzeResponse {
  overall_score: number
  overall_confidence: number
  status: 'completed' | 'needs_review'
  requirement_spec: RequirementSpec
  judgements: ItemJudgement[]
  missing_items: string[]
  tool_findings: ToolFinding[]
  summary: string
}

export const analyzeConsistency = (params: ConsistencyAnalyzeRequest) => {
  return axiosInstance
    .post<ConsistencyAnalyzeResponse>('/consistency/analyze', params)
    .then((res) => res.data)
}

