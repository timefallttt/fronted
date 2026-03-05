<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyzeConsistency,
  type CandidateSnippet,
  type ConsistencyAnalyzeResponse,
  type EvidenceRef,
  type ItemJudgement
} from '@/api/consistency'

interface SnippetForm extends CandidateSnippet {}

const loading = ref(false)
const result = ref<ConsistencyAnalyzeResponse | null>(null)

const defaultResult: ConsistencyAnalyzeResponse = {
  overall_score: 0,
  overall_confidence: 0,
  status: 'needs_review',
  requirement_spec: {
    intents: [],
    constraints: [],
    exceptions: []
  },
  judgements: [],
  missing_items: [],
  tool_findings: [],
  summary: ''
}

const safeResult = computed(() => result.value ?? defaultResult)
const overallStatusType = computed(() => (safeResult.value.status === 'completed' ? 'success' : 'warning'))
const overallStatusText = computed(() => (safeResult.value.status === 'completed' ? '完成' : '需复核'))
const overallScoreText = computed(() => format3(safeResult.value.overall_score))
const overallConfidenceText = computed(() => format3(safeResult.value.overall_confidence))

const form = reactive({
  requirementText: '',
  acceptanceText: '',
  topK: 10,
  keywordMinOverlap: 0.2,
  enableToolEvidence: true,
  snippets: [
    {
      snippet_id: `snippet-${Date.now()}`,
      filename: '',
      code: '',
      start_line: 1,
      end_line: 1
    } as SnippetForm
  ]
})

type JudgementStatus = ItemJudgement['status']
const statusMeta: Record<JudgementStatus, { text: string; type: 'success' | 'warning' | 'danger' }> = {
  satisfied: { text: '满足', type: 'success' },
  partially_satisfied: { text: '部分满足', type: 'warning' },
  not_satisfied: { text: '不满足', type: 'danger' }
}

const getStatusMeta = (status: JudgementStatus) => statusMeta[status]
const format3 = (value: number | null | undefined) => Number(value ?? 0).toFixed(3)
const format2 = (value: number | null | undefined) => Number(value ?? 0).toFixed(2)
const formatLineRange = (startLine: number, endLine: number) => `${startLine} - ${endLine}`

interface EvidenceDisplayRow extends EvidenceRef {
  line_range: string
}

interface JudgementDisplayRow {
  id: string
  item: string
  statusText: string
  statusType: 'success' | 'warning' | 'danger'
  scoreText: string
  confidenceText: string
  notes: string
  evidence: EvidenceDisplayRow[]
}

const judgementRows = computed<JudgementDisplayRow[]>(() => {
  return safeResult.value.judgements.map((j, idx) => {
    const meta = getStatusMeta(j.status)
    return {
      id: `${idx}-${j.item}`,
      item: j.item,
      statusText: meta.text,
      statusType: meta.type,
      scoreText: format2(j.score),
      confidenceText: format2(j.confidence),
      notes: j.notes,
      evidence: j.evidence.map((ev) => ({
        ...ev,
        line_range: formatLineRange(ev.start_line, ev.end_line)
      }))
    }
  })
})

const addSnippet = () => {
  form.snippets.push({
    snippet_id: `snippet-${Date.now()}-${form.snippets.length + 1}`,
    filename: '',
    code: '',
    start_line: 1,
    end_line: 1
  })
}

const removeSnippet = (index: number) => {
  if (form.snippets.length === 1) {
    ElMessage.warning('至少保留一个代码片段输入区')
    return
  }
  form.snippets.splice(index, 1)
}

const normalizeSnippets = () => {
  return form.snippets
    .filter((s) => s.filename.trim() || s.code.trim())
    .map((s, i) => ({
      snippet_id: s.snippet_id || `snippet-${i + 1}`,
      filename: s.filename.trim() || `unknown_${i + 1}.ts`,
      code: s.code,
      start_line: Math.max(1, s.start_line || 1),
      end_line: Math.max(s.start_line || 1, s.end_line || 1)
    }))
}

const handleAnalyze = async () => {
  if (!form.requirementText.trim()) {
    ElMessage.warning('请先输入需求描述')
    return
  }

  const acceptanceCriteria = form.acceptanceText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const snippets = normalizeSnippets()

  loading.value = true
  result.value = null
  try {
    result.value = await analyzeConsistency({
      requirement_text: form.requirementText,
      acceptance_criteria: acceptanceCriteria,
      candidate_snippets: snippets,
      options: {
        top_k: form.topK,
        keyword_min_overlap: form.keywordMinOverlap,
        enable_tool_evidence: form.enableToolEvidence
      }
    })
    ElMessage.success('一致性分析完成')
  } catch (error) {
    ElMessage.error('一致性分析失败，请检查后端服务')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.requirementText = ''
  form.acceptanceText = ''
  form.topK = 10
  form.keywordMinOverlap = 0.2
  form.enableToolEvidence = true
  form.snippets = [
    {
      snippet_id: `snippet-${Date.now()}`,
      filename: '',
      code: '',
      start_line: 1,
      end_line: 1
    }
  ]
  result.value = null
}
</script>

<template>
  <el-container class="consistency-page">
    <el-main>
      <el-row :gutter="16">
        <el-col :xs="24" :lg="12">
          <el-card shadow="hover">
            <template #header>
              <div class="card-title">需求-代码一致性检验</div>
            </template>

            <el-form label-position="top">
              <el-form-item label="需求描述">
                <el-input
                  v-model="form.requirementText"
                  type="textarea"
                  :rows="6"
                  placeholder="输入自然语言需求，例如：上传头像前应压缩，失败需阻断并提示。"
                />
              </el-form-item>

              <el-form-item label="验收标准">
                <el-input
                  v-model="form.acceptanceText"
                  type="textarea"
                  :rows="5"
                  placeholder="例如：\n长边不超过1024px\n压缩失败需阻断上传\n网络失败最多重试3次"
                />
              </el-form-item>

              <el-divider>候选代码片段</el-divider>
              <div v-for="(snippet, index) in form.snippets" :key="snippet.snippet_id" class="snippet-block">
                <el-space wrap class="snippet-meta">
                  <el-input v-model="snippet.filename" placeholder="文件路径，如 src/upload.ts" />
                  <el-input-number v-model="snippet.start_line" :min="1" />
                  <el-input-number v-model="snippet.end_line" :min="snippet.start_line || 1" />
                  <el-button type="danger" plain @click="removeSnippet(index)">删除</el-button>
                </el-space>
                <el-input
                  v-model="snippet.code"
                  type="textarea"
                  :rows="6"
                  placeholder="粘贴候选代码片段"
                />
              </div>
              <el-button plain @click="addSnippet">新增片段</el-button>

              <el-divider>分析参数</el-divider>
              <el-row :gutter="12">
                <el-col :span="8">
                  <el-form-item label="Top-K">
                    <el-input-number v-model="form.topK" :min="1" :max="50" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="最小关键词重叠">
                    <el-input-number v-model="form.keywordMinOverlap" :min="0" :max="1" :step="0.05" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="工具证据">
                    <el-switch v-model="form.enableToolEvidence" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-space>
                <el-button type="primary" :loading="loading" @click="handleAnalyze">开始分析</el-button>
                <el-button @click="resetForm">重置</el-button>
              </el-space>
            </el-form>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="result-card">
            <template #header>
              <div class="card-title">分析结果</div>
            </template>

            <el-empty v-if="!result && !loading" description="提交需求与候选代码后将在这里显示结果" />
            <el-skeleton v-else-if="loading" :rows="8" animated />

            <div v-else-if="result">
              <el-space wrap>
                <el-tag :type="overallStatusType">
                  状态：{{ overallStatusText }}
                </el-tag>
                <el-tag type="info">总体分数：{{ overallScoreText }}</el-tag>
                <el-tag type="info">总体置信度：{{ overallConfidenceText }}</el-tag>
              </el-space>

              <el-alert :title="safeResult.summary" type="info" :closable="false" class="summary-alert" />

              <el-divider>要点判定</el-divider>
              <el-collapse>
                <el-collapse-item v-for="row in judgementRows" :key="row.id">
                  <template #title>
                    <div class="item-title">
                      <span>{{ row.item }}</span>
                      <el-tag size="small" :type="row.statusType">
                        {{ row.statusText }}
                      </el-tag>
                      <span class="item-metric">分数 {{ row.scoreText }}</span>
                      <span class="item-metric">置信 {{ row.confidenceText }}</span>
                    </div>
                  </template>
                  <p>{{ row.notes }}</p>
                  <el-table :data="row.evidence" size="small" v-if="row.evidence.length">
                    <el-table-column prop="filename" label="文件" min-width="160" />
                    <el-table-column prop="line_range" label="行号" min-width="90" />
                    <el-table-column prop="reason" label="命中原因" min-width="180" />
                  </el-table>
                  <el-empty v-else description="无命中证据" :image-size="48" />
                </el-collapse-item>
              </el-collapse>

              <el-divider>缺漏项</el-divider>
              <el-empty v-if="safeResult.missing_items.length === 0" description="无缺漏项" :image-size="48" />
              <el-tag
                v-for="missing in safeResult.missing_items"
                :key="missing"
                type="danger"
                class="inline-tag"
              >
                {{ missing }}
              </el-tag>

              <el-divider>工具建议</el-divider>
              <el-empty v-if="safeResult.tool_findings.length === 0" description="无工具建议" :image-size="48" />
              <el-alert
                v-for="(finding, index) in safeResult.tool_findings"
                :key="index"
                :title="finding.message"
                :type="finding.level === 'error' ? 'error' : finding.level === 'warning' ? 'warning' : 'info'"
                :description="finding.related_item || ''"
                :closable="false"
                class="finding-alert"
              />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<style scoped>
.consistency-page {
  width: 100%;
}

.card-title {
  font-weight: 700;
  font-size: 18px;
}

.snippet-block {
  margin-bottom: 14px;
}

.snippet-meta {
  margin-bottom: 8px;
}

.result-card {
  min-height: 600px;
}

.summary-alert {
  margin-top: 12px;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.item-metric {
  color: #606266;
  font-size: 12px;
}

.inline-tag {
  margin-right: 8px;
  margin-bottom: 8px;
}

.finding-alert {
  margin-bottom: 10px;
}
</style>
