<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, RefreshRight } from '@element-plus/icons-vue'
import {
  analyzeReviewTask,
  createReviewTask,
  getReviewDashboard,
  getReviewHistory,
  getReviewTask,
  submitReviewFeedback,
  type CandidateSnippet,
  type FeedbackDecision,
  type Priority,
  type ReviewDashboardResponse,
  type ReviewHistoryRecord,
  type ReviewTaskDetail,
  type ReviewTaskSummary
} from '@/api/consistency'

interface SnippetForm extends CandidateSnippet {}

const dashboard = ref<ReviewDashboardResponse | null>(null)
const taskDetail = ref<ReviewTaskDetail | null>(null)
const historyRecords = ref<ReviewHistoryRecord[]>([])
const activeTaskId = ref('')
const activeTab = ref('overview')
const loadingDashboard = ref(false)
const loadingTask = ref(false)
const createDialogVisible = ref(false)
const creatingTask = ref(false)
const submittingFeedback = ref(false)

const statusMeta: Record<string, { text: string; type: 'success' | 'warning' | 'info' }> = {
  completed: { text: '完成', type: 'success' },
  needs_review: { text: '需复核', type: 'warning' },
  ready: { text: '就绪', type: 'info' },
  draft: { text: '草稿', type: 'info' },
  satisfied: { text: '满足', type: 'success' },
  partially_satisfied: { text: '部分满足', type: 'warning' },
  not_satisfied: { text: '不满足', type: 'info' }
}

const priorityMeta: Record<Priority, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  high: { text: '高', type: 'danger' },
  medium: { text: '中', type: 'warning' },
  low: { text: '低', type: 'info' }
}

const decisionLabel: Record<FeedbackDecision, string> = {
  agree: '认同',
  question: '存疑',
  misjudged: '误判'
}

const makeSnippet = (): SnippetForm => ({
  snippet_id: `snippet-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
  filename: '',
  code: '',
  start_line: 1,
  end_line: 1,
  recall_reason: '',
  source: 'retrieval',
  selected: true
})

const taskForm = reactive({
  requirementId: '',
  title: '',
  requirementText: '',
  acceptanceText: '',
  repoName: '',
  snapshot: '',
  businessTag: '',
  priority: 'medium' as Priority,
  owner: '',
  notes: '',
  snippets: [makeSnippet()]
})

const feedbackForm = reactive({
  judgementItem: '',
  decision: 'agree' as FeedbackDecision,
  comment: '',
  reviewer: ''
})

const stats = computed(() => dashboard.value?.stats ?? { total_tasks: 0, needs_review_tasks: 0, completed_tasks: 0, avg_score: 0 })
const tasks = computed<ReviewTaskSummary[]>(() => dashboard.value?.tasks ?? [])
const currentTask = computed(() => taskDetail.value?.task ?? null)
const currentReport = computed(() => taskDetail.value?.report ?? null)
const judgementItems = computed(() => currentReport.value?.judgements.map((item) => item.item) ?? [])

const getStatusMeta = (status: string) => statusMeta[status] ?? { text: status, type: 'info' as const }
const formatScore = (value: number | undefined) => Number(value ?? 0).toFixed(3)
const formatTime = (value: string | undefined) => value?.replace('T', ' ') ?? '-'
const formatLines = (startLine: number, endLine: number) => `${startLine} - ${endLine}`

const resetTaskForm = () => {
  taskForm.requirementId = ''
  taskForm.title = ''
  taskForm.requirementText = ''
  taskForm.acceptanceText = ''
  taskForm.repoName = ''
  taskForm.snapshot = ''
  taskForm.businessTag = ''
  taskForm.priority = 'medium'
  taskForm.owner = ''
  taskForm.notes = ''
  taskForm.snippets = [makeSnippet()]
}

const normalizeSnippets = () => {
  return taskForm.snippets
    .filter((snippet) => snippet.filename.trim() || snippet.code.trim())
    .map((snippet, index) => ({
      snippet_id: snippet.snippet_id || `snippet-${index + 1}`,
      filename: snippet.filename.trim() || `unknown_${index + 1}.ts`,
      code: snippet.code,
      start_line: Math.max(1, snippet.start_line || 1),
      end_line: Math.max(snippet.start_line || 1, snippet.end_line || 1),
      recall_reason: snippet.recall_reason.trim() || '人工补充候选代码',
      source: snippet.source || 'manual',
      selected: snippet.selected
    }))
}

const addSnippet = () => {
  taskForm.snippets.push(makeSnippet())
}

const removeSnippet = (index: number) => {
  if (taskForm.snippets.length === 1) {
    ElMessage.warning('至少保留一个候选代码输入区')
    return
  }
  taskForm.snippets.splice(index, 1)
}

const loadDashboard = async () => {
  loadingDashboard.value = true
  try {
    dashboard.value = await getReviewDashboard()
    if (!activeTaskId.value && dashboard.value.tasks.length > 0) {
      await loadTask(dashboard.value.tasks[0].task_id)
    }
  } catch (error) {
    ElMessage.error('加载审阅任务失败')
    console.error(error)
  } finally {
    loadingDashboard.value = false
  }
}

const loadTask = async (taskId: string) => {
  if (!taskId) {
    return
  }
  loadingTask.value = true
  activeTaskId.value = taskId
  try {
    const [detail, history] = await Promise.all([getReviewTask(taskId), getReviewHistory(taskId)])
    taskDetail.value = detail
    historyRecords.value = history.records
    if (!feedbackForm.judgementItem && detail.report?.judgements.length) {
      feedbackForm.judgementItem = detail.report.judgements[0].item
    }
  } catch (error) {
    ElMessage.error('加载任务详情失败')
    console.error(error)
  } finally {
    loadingTask.value = false
  }
}

const handleCreateTask = async () => {
  if (!taskForm.requirementId.trim() || !taskForm.title.trim() || !taskForm.requirementText.trim()) {
    ElMessage.warning('请补全任务编号、标题和需求描述')
    return
  }
  creatingTask.value = true
  try {
    const detail = await createReviewTask({
      requirement_id: taskForm.requirementId,
      title: taskForm.title,
      requirement_text: taskForm.requirementText,
      acceptance_criteria: taskForm.acceptanceText.split('\n').map((line) => line.trim()).filter(Boolean),
      repo_name: taskForm.repoName || 'unknown-repo',
      snapshot: taskForm.snapshot || 'unknown-snapshot',
      business_tag: taskForm.businessTag,
      priority: taskForm.priority,
      owner: taskForm.owner,
      notes: taskForm.notes,
      candidate_snippets: normalizeSnippets(),
      options: {
        top_k: 10,
        keyword_min_overlap: 0.2,
        enable_tool_evidence: true
      }
    })
    createDialogVisible.value = false
    resetTaskForm()
    await loadDashboard()
    await loadTask(detail.task.task_id)
    activeTab.value = 'report'
    ElMessage.success('已创建审阅任务')
  } catch (error) {
    ElMessage.error('创建任务失败')
    console.error(error)
  } finally {
    creatingTask.value = false
  }
}

const handleAnalyzeTask = async () => {
  if (!activeTaskId.value) {
    return
  }
  loadingTask.value = true
  try {
    taskDetail.value = await analyzeReviewTask(activeTaskId.value)
    historyRecords.value = (await getReviewHistory(activeTaskId.value)).records
    await loadDashboard()
    activeTab.value = 'report'
    ElMessage.success('已生成示例审阅报告')
  } catch (error) {
    ElMessage.error('重新分析失败')
    console.error(error)
  } finally {
    loadingTask.value = false
  }
}

const handleSubmitFeedback = async () => {
  if (!activeTaskId.value || !feedbackForm.judgementItem || !feedbackForm.reviewer.trim()) {
    ElMessage.warning('请先选择要点并填写复核人')
    return
  }
  submittingFeedback.value = true
  try {
    taskDetail.value = await submitReviewFeedback(activeTaskId.value, {
      judgement_item: feedbackForm.judgementItem,
      decision: feedbackForm.decision,
      comment: feedbackForm.comment,
      reviewer: feedbackForm.reviewer
    })
    historyRecords.value = (await getReviewHistory(activeTaskId.value)).records
    feedbackForm.comment = ''
    ElMessage.success('复核意见已记录')
  } catch (error) {
    ElMessage.error('提交复核失败')
    console.error(error)
  } finally {
    submittingFeedback.value = false
  }
}

onMounted(async () => {
  await loadDashboard()
})
</script>

<template>
  <div class="workspace">
    <div class="hero">
      <div>
        <p class="eyebrow">Requirement Review Workspace</p>
        <h1>需求实现审阅工作台</h1>
        <p class="hero-text">任务管理、候选实现、示例报告、历史复核都集中在同一工作区内展示。</p>
      </div>
      <el-space wrap>
        <el-button type="primary" size="large" @click="createDialogVisible = true">
          <el-icon><DocumentAdd /></el-icon>
          新建任务
        </el-button>
        <el-button size="large" @click="loadDashboard" :loading="loadingDashboard">
          <el-icon><RefreshRight /></el-icon>
          刷新
        </el-button>
      </el-space>
    </div>

    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :lg="6"><el-card class="stat-card"><p>任务总数</p><strong>{{ stats.total_tasks }}</strong></el-card></el-col>
      <el-col :xs="12" :lg="6"><el-card class="stat-card"><p>待复核</p><strong>{{ stats.needs_review_tasks }}</strong></el-card></el-col>
      <el-col :xs="12" :lg="6"><el-card class="stat-card"><p>已完成</p><strong>{{ stats.completed_tasks }}</strong></el-card></el-col>
      <el-col :xs="12" :lg="6"><el-card class="stat-card"><p>平均分</p><strong>{{ formatScore(stats.avg_score) }}</strong></el-card></el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="7">
        <el-card class="panel-card">
          <template #header>
            <div class="panel-head">
              <span>审阅任务</span>
              <el-tag type="info">{{ tasks.length }}</el-tag>
            </div>
          </template>
          <el-empty v-if="!tasks.length && !loadingDashboard" description="暂无任务" :image-size="60" />
          <div
            v-for="task in tasks"
            :key="task.task_id"
            class="task-card"
            :class="{ active: task.task_id === activeTaskId }"
            @click="loadTask(task.task_id)"
          >
            <div class="panel-head">
              <strong>{{ task.title }}</strong>
              <el-tag size="small" :type="getStatusMeta(task.status).type">{{ getStatusMeta(task.status).text }}</el-tag>
            </div>
            <p class="mini">{{ task.requirement_id }} ｜ {{ task.repo_name }}</p>
            <p class="mini">{{ task.snapshot }}</p>
            <div class="panel-head">
              <el-tag size="small" :type="priorityMeta[task.priority].type">{{ priorityMeta[task.priority].text }}</el-tag>
              <span class="mini">分数 {{ formatScore(task.overall_score) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="17">
        <el-card class="panel-card">
          <template #header>
            <div class="panel-head">
              <div>
                <strong class="detail-title">{{ currentTask?.title || '需求审阅详情' }}</strong>
                <p class="mini">{{ currentTask?.requirement_id || '请选择左侧任务' }}</p>
              </div>
              <el-button v-if="currentTask" @click="handleAnalyzeTask" :loading="loadingTask">重新生成报告</el-button>
            </div>
          </template>

          <el-skeleton v-if="loadingTask && !taskDetail" :rows="8" animated />
          <el-empty v-else-if="!taskDetail" description="选择任务后查看详情" :image-size="72" />

          <template v-else>
            <el-tabs v-model="activeTab">
              <el-tab-pane label="任务信息" name="overview">
                <el-descriptions :column="2" border>
                  <el-descriptions-item label="仓库">{{ currentTask?.repo_name }}</el-descriptions-item>
                  <el-descriptions-item label="版本">{{ currentTask?.snapshot }}</el-descriptions-item>
                  <el-descriptions-item label="业务标签">{{ currentTask?.business_tag || '未设置' }}</el-descriptions-item>
                  <el-descriptions-item label="负责人">{{ taskDetail.owner || '未填写' }}</el-descriptions-item>
                  <el-descriptions-item label="更新时间">{{ formatTime(currentTask?.updated_at) }}</el-descriptions-item>
                  <el-descriptions-item label="优先级">{{ currentTask ? priorityMeta[currentTask.priority].text : '-' }}</el-descriptions-item>
                </el-descriptions>
                <h3>需求描述</h3>
                <p class="paragraph">{{ taskDetail.requirement_text }}</p>
                <h3>验收标准</h3>
                <ul class="plain-list">
                  <li v-for="item in taskDetail.acceptance_criteria" :key="item">{{ item }}</li>
                </ul>
                <h3>备注</h3>
                <p class="paragraph">{{ taskDetail.notes || '无' }}</p>
              </el-tab-pane>

              <el-tab-pane label="候选实现" name="candidates">
                <el-card v-for="snippet in taskDetail.candidate_snippets" :key="snippet.snippet_id" class="inner-card">
                  <template #header>
                    <div class="panel-head">
                      <div>
                        <strong>{{ snippet.filename }}</strong>
                        <p class="mini">行号 {{ formatLines(snippet.start_line, snippet.end_line) }}</p>
                      </div>
                      <el-tag :type="snippet.selected ? 'success' : 'info'">{{ snippet.selected ? '纳入审阅' : '未纳入' }}</el-tag>
                    </div>
                  </template>
                  <p class="mini">来源：{{ snippet.source }} ｜ 理由：{{ snippet.recall_reason || '未提供' }}</p>
                  <pre class="code-block">{{ snippet.code }}</pre>
                </el-card>
              </el-tab-pane>

              <el-tab-pane label="审阅报告" name="report">
                <template v-if="currentReport">
                  <el-space wrap class="report-meta">
                    <el-tag :type="getStatusMeta(currentReport.status).type">{{ getStatusMeta(currentReport.status).text }}</el-tag>
                    <el-tag type="info">分数 {{ formatScore(currentReport.overall_score) }}</el-tag>
                    <el-tag type="info">置信度 {{ formatScore(currentReport.overall_confidence) }}</el-tag>
                  </el-space>
                  <el-alert :title="currentReport.summary" type="info" :closable="false" />

                  <el-row :gutter="16" class="report-grid">
                    <el-col :xs="24" :xl="10">
                      <el-card class="inner-card">
                        <template #header><span>结构化要点</span></template>
                        <h4>功能要点</h4>
                        <ul class="plain-list"><li v-for="item in currentReport.requirement_spec.intents" :key="item">{{ item }}</li></ul>
                        <h4>约束要点</h4>
                        <ul class="plain-list"><li v-for="item in currentReport.requirement_spec.constraints" :key="item">{{ item }}</li></ul>
                        <h4>异常要点</h4>
                        <ul class="plain-list"><li v-for="item in currentReport.requirement_spec.exceptions" :key="item">{{ item }}</li></ul>
                      </el-card>
                    </el-col>
                    <el-col :xs="24" :xl="14">
                      <el-card class="inner-card">
                        <template #header><span>关键证据路径</span></template>
                        <div v-for="path in currentReport.evidence_paths" :key="path.path_id" class="path-block">
                          <strong>{{ path.title }}</strong>
                          <p class="paragraph">{{ path.summary }}</p>
                          <div class="path-flow">
                            <div v-for="node in path.nodes" :key="node.node_id" class="path-node">
                              <strong>{{ node.label }}</strong>
                              <p class="mini">{{ node.node_type }}</p>
                              <p class="mini">{{ node.detail }}</p>
                              <p v-if="node.relation_from_prev" class="mini">{{ node.relation_from_prev }}</p>
                            </div>
                          </div>
                        </div>
                      </el-card>
                    </el-col>
                  </el-row>

                  <el-card class="inner-card">
                    <template #header><span>逐条判定</span></template>
                    <el-collapse>
                      <el-collapse-item v-for="item in currentReport.judgements" :key="item.item" :title="item.item">
                        <el-space wrap>
                          <el-tag size="small" :type="getStatusMeta(item.status).type">{{ getStatusMeta(item.status).text }}</el-tag>
                          <el-tag size="small" type="info">分数 {{ item.score.toFixed(2) }}</el-tag>
                          <el-tag size="small" type="info">置信 {{ item.confidence.toFixed(2) }}</el-tag>
                        </el-space>
                        <p class="paragraph">{{ item.notes }}</p>
                        <el-table v-if="item.evidence.length" :data="item.evidence" size="small">
                          <el-table-column prop="filename" label="文件" min-width="160" />
                          <el-table-column label="行号" min-width="90">
                            <template #default="{ row }">{{ formatLines(row.start_line, row.end_line) }}</template>
                          </el-table-column>
                          <el-table-column prop="reason" label="命中原因" min-width="140" />
                        </el-table>
                      </el-collapse-item>
                    </el-collapse>
                  </el-card>

                  <el-row :gutter="16">
                    <el-col :xs="24" :xl="8">
                      <el-card class="inner-card">
                        <template #header><span>结构性缺口</span></template>
                        <ul class="plain-list"><li v-for="gap in currentReport.structural_gaps" :key="gap">{{ gap }}</li></ul>
                      </el-card>
                    </el-col>
                    <el-col :xs="24" :xl="8">
                      <el-card class="inner-card">
                        <template #header><span>建议复核点</span></template>
                        <ul class="plain-list"><li v-for="focus in currentReport.review_focuses" :key="focus">{{ focus }}</li></ul>
                      </el-card>
                    </el-col>
                    <el-col :xs="24" :xl="8">
                      <el-card class="inner-card">
                        <template #header><span>工具建议</span></template>
                        <el-alert
                          v-for="finding in currentReport.tool_findings"
                          :key="`${finding.message}-${finding.related_item}`"
                          :title="finding.message"
                          :description="finding.related_item || ''"
                          :type="finding.level === 'warning' ? 'warning' : finding.level === 'error' ? 'error' : 'info'"
                          :closable="false"
                          class="finding-alert"
                        />
                      </el-card>
                    </el-col>
                  </el-row>
                </template>
                <el-empty v-else description="当前任务尚未生成报告" :image-size="60" />
              </el-tab-pane>

              <el-tab-pane label="历史与复核" name="history">
                <el-row :gutter="16">
                  <el-col :xs="24" :xl="14">
                    <el-card class="inner-card">
                      <template #header><span>历史记录</span></template>
                      <el-timeline>
                        <el-timeline-item
                          v-for="record in historyRecords"
                          :key="record.record_id"
                          :timestamp="formatTime(record.created_at)"
                          :type="getStatusMeta(record.status).type"
                        >
                          <strong>{{ record.label }}</strong>
                          <p class="paragraph">{{ record.summary }}</p>
                          <p class="mini">分数 {{ formatScore(record.overall_score) }}</p>
                          <ul class="plain-list">
                            <li v-for="point in record.changed_points" :key="point">{{ point }}</li>
                          </ul>
                        </el-timeline-item>
                      </el-timeline>
                    </el-card>
                  </el-col>
                  <el-col :xs="24" :xl="10">
                    <el-card class="inner-card">
                      <template #header><span>人工复核</span></template>
                      <el-form label-position="top">
                        <el-form-item label="审阅要点">
                          <el-select v-model="feedbackForm.judgementItem" placeholder="选择要点">
                            <el-option v-for="item in judgementItems" :key="item" :label="item" :value="item" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="复核结论">
                          <el-segmented
                            v-model="feedbackForm.decision"
                            :options="[
                              { label: '认同', value: 'agree' },
                              { label: '存疑', value: 'question' },
                              { label: '误判', value: 'misjudged' }
                            ]"
                          />
                        </el-form-item>
                        <el-form-item label="复核人">
                          <el-input v-model="feedbackForm.reviewer" placeholder="输入复核人" />
                        </el-form-item>
                        <el-form-item label="复核备注">
                          <el-input v-model="feedbackForm.comment" type="textarea" :rows="4" placeholder="填写人工判断意见" />
                        </el-form-item>
                        <el-button type="primary" :loading="submittingFeedback" @click="handleSubmitFeedback">提交复核</el-button>
                      </el-form>
                      <el-divider />
                      <div v-for="entry in taskDetail.feedback_entries" :key="entry.feedback_id" class="feedback-entry">
                        <div class="panel-head">
                          <strong>{{ entry.judgement_item }}</strong>
                          <el-tag size="small">{{ decisionLabel[entry.decision] }}</el-tag>
                        </div>
                        <p class="mini">{{ entry.reviewer }} ｜ {{ formatTime(entry.created_at) }}</p>
                        <p class="paragraph">{{ entry.comment || '无备注' }}</p>
                      </div>
                    </el-card>
                  </el-col>
                </el-row>
              </el-tab-pane>
            </el-tabs>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="createDialogVisible" title="新建需求审阅任务" width="900px">
      <el-form label-position="top">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="需求编号"><el-input v-model="taskForm.requirementId" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="任务标题"><el-input v-model="taskForm.title" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="需求描述"><el-input v-model="taskForm.requirementText" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="验收标准"><el-input v-model="taskForm.acceptanceText" type="textarea" :rows="4" placeholder="每行一条" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="仓库名称"><el-input v-model="taskForm.repoName" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="版本快照"><el-input v-model="taskForm.snapshot" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="业务标签"><el-input v-model="taskForm.businessTag" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="优先级">
              <el-select v-model="taskForm.priority">
                <el-option label="高" value="high" />
                <el-option label="中" value="medium" />
                <el-option label="低" value="low" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="负责人"><el-input v-model="taskForm.owner" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备注"><el-input v-model="taskForm.notes" /></el-form-item></el-col>
        </el-row>
        <el-divider>候选种子代码</el-divider>
        <div v-for="(snippet, index) in taskForm.snippets" :key="snippet.snippet_id" class="snippet-editor">
          <el-row :gutter="12">
            <el-col :span="12"><el-input v-model="snippet.filename" placeholder="文件路径" /></el-col>
            <el-col :span="4"><el-input-number v-model="snippet.start_line" :min="1" /></el-col>
            <el-col :span="4"><el-input-number v-model="snippet.end_line" :min="snippet.start_line || 1" /></el-col>
            <el-col :span="4" class="align-right"><el-button type="danger" plain @click="removeSnippet(index)">删除</el-button></el-col>
          </el-row>
          <el-row :gutter="12" class="snippet-row">
            <el-col :span="12"><el-input v-model="snippet.recall_reason" placeholder="召回理由" /></el-col>
            <el-col :span="6">
              <el-select v-model="snippet.source">
                <el-option label="retrieval" value="retrieval" />
                <el-option label="graph_expand" value="graph_expand" />
                <el-option label="manual" value="manual" />
              </el-select>
            </el-col>
            <el-col :span="6"><el-switch v-model="snippet.selected" active-text="纳入审阅" /></el-col>
          </el-row>
          <el-input v-model="snippet.code" type="textarea" :rows="4" placeholder="粘贴候选代码" />
        </div>
        <el-button plain @click="addSnippet">新增候选代码</el-button>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="createDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creatingTask" @click="handleCreateTask">创建任务</el-button>
        </el-space>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.workspace {
  min-height: 100vh;
  padding: 8px 0 24px;
  background: linear-gradient(180deg, #fffaf2 0%, #f6f9ff 46%, #f7f7fb 100%);
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 18px;
  padding: 24px 28px;
  border-radius: 24px;
  background: linear-gradient(135deg, #21344d 0%, #325b82 60%, #d98943 100%);
  color: #fffdf7;
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  opacity: 0.8;
}

.hero h1 {
  margin: 0;
  font-size: 34px;
}

.hero-text {
  margin: 10px 0 0;
  max-width: 760px;
  line-height: 1.7;
  opacity: 0.92;
}

.stat-row {
  margin-bottom: 16px;
}

.stat-card,
.panel-card,
.inner-card {
  border-radius: 18px;
  border: 1px solid rgba(33, 52, 77, 0.08);
  background: rgba(255, 255, 255, 0.92);
}

.stat-card p {
  margin: 0;
  color: #6b748a;
  font-size: 13px;
}

.stat-card strong {
  display: block;
  margin-top: 12px;
  font-size: 30px;
  color: #21344d;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.detail-title {
  font-size: 22px;
  color: #21344d;
}

.task-card {
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(50, 91, 130, 0.08);
  background: linear-gradient(180deg, #fff 0%, #fafcff 100%);
  cursor: pointer;
}

.task-card.active {
  border-color: rgba(50, 91, 130, 0.22);
  box-shadow: 0 12px 24px rgba(50, 91, 130, 0.1);
}

.mini {
  margin: 6px 0 0;
  color: #75809a;
  font-size: 12px;
}

.paragraph {
  line-height: 1.75;
  color: #33445d;
}

.plain-list {
  padding-left: 18px;
  line-height: 1.75;
  color: #33445d;
}

.inner-card {
  margin-bottom: 16px;
}

.report-meta,
.report-grid {
  margin-bottom: 16px;
}

.code-block {
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 14px;
  background: #1f2632;
  color: #edf2fd;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.path-block {
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: #fbfcff;
  border: 1px solid rgba(50, 91, 130, 0.08);
}

.path-flow {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.path-node {
  min-width: 150px;
  padding: 12px;
  border-radius: 12px;
  background: #fff6ea;
  border: 1px solid rgba(217, 137, 67, 0.14);
}

.feedback-entry {
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px dashed rgba(117, 128, 154, 0.22);
}

.finding-alert {
  margin-bottom: 10px;
}

.snippet-editor {
  padding: 14px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: #fafbfd;
  border: 1px solid rgba(33, 52, 77, 0.08);
}

.snippet-row {
  margin: 10px 0;
}

.align-right {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 960px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero h1 {
    font-size: 28px;
  }
}
</style>

