<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, Link, RefreshRight } from '@element-plus/icons-vue'
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
import {
  createIndexJob,
  getIndexJob,
  listIndexJobs,
  runIndexJob,
  type GraphStoreStatus,
  type IndexJobDetail,
  type IndexJobStatus,
  type IndexJobSummary,
  type ParserMode
} from '@/api/indexing'

interface SnippetForm extends CandidateSnippet {}

const dashboard = ref<ReviewDashboardResponse | null>(null)
const indexingJobs = ref<IndexJobSummary[]>([])
const currentRepoJob = ref<IndexJobDetail | null>(null)
const taskDetail = ref<ReviewTaskDetail | null>(null)
const historyRecords = ref<ReviewHistoryRecord[]>([])
const activeTaskId = ref('')

const loadingDashboard = ref(false)
const loadingTask = ref(false)
const loadingIndexing = ref(false)
const creatingTask = ref(false)
const creatingRepoJob = ref(false)
const submittingFeedback = ref(false)
const runningRepoJobId = ref('')
const createDialogVisible = ref(false)
const connectRepoDialogVisible = ref(false)

let pollingTimer: number | null = null

const taskForm = reactive({
  requirementId: '',
  title: '',
  requirementText: '',
  acceptanceText: '',
  businessTag: '',
  priority: 'medium' as Priority,
  owner: '',
  notes: '',
  snippets: [] as SnippetForm[]
})

const repoForm = reactive({
  repoUrl: '',
  branch: 'main',
  repoName: ''
})

const feedbackForm = reactive({
  judgementItem: '',
  decision: 'agree' as FeedbackDecision,
  comment: '',
  reviewer: ''
})

const reviewStatusMeta: Record<string, { text: string; type: 'success' | 'warning' | 'info' | 'danger' }> = {
  completed: { text: '已完成', type: 'success' },
  needs_review: { text: '需复核', type: 'warning' },
  ready: { text: '就绪', type: 'info' },
  draft: { text: '草稿', type: 'info' },
  satisfied: { text: '满足', type: 'success' },
  partially_satisfied: { text: '部分满足', type: 'warning' },
  not_satisfied: { text: '不满足', type: 'danger' }
}

const indexStatusMeta: Record<IndexJobStatus, { text: string; type: 'success' | 'warning' | 'info' | 'danger' }> = {
  queued: { text: '排队中', type: 'info' },
  running: { text: '建库中', type: 'warning' },
  completed: { text: '建库完成', type: 'success' },
  completed_with_warnings: { text: '完成但有告警', type: 'warning' },
  failed: { text: '建库失败', type: 'danger' }
}

const parserModeMeta: Record<ParserMode, { text: string; type: 'success' | 'info' }> = {
  arkanalyzer: { text: 'ArkAnalyzer', type: 'success' },
  placeholder: { text: '占位解析', type: 'info' }
}

const graphStoreMeta: Record<GraphStoreStatus, { text: string; type: 'success' | 'warning' | 'info' | 'danger' }> = {
  loaded: { text: '已写入 Neo4j', type: 'success' },
  pending_setup: { text: '待配置 Neo4j', type: 'warning' },
  failed: { text: 'Neo4j 写入失败', type: 'danger' },
  not_attempted: { text: '未写入', type: 'info' }
}

const priorityMeta: Record<Priority, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  high: { text: '高', type: 'danger' },
  medium: { text: '中', type: 'warning' },
  low: { text: '低', type: 'info' }
}

const feedbackLabel: Record<FeedbackDecision, string> = {
  agree: '认同',
  question: '存疑',
  misjudged: '误判'
}

const currentRepoName = computed(() => currentRepoJob.value?.snapshot.repo_name ?? '')
const currentRepoReady = computed(
  () => Boolean(currentRepoJob.value) && ['completed', 'completed_with_warnings'].includes(currentRepoJob.value.summary.status)
)
const currentRepoBusy = computed(
  () => Boolean(currentRepoJob.value) && ['queued', 'running'].includes(currentRepoJob.value.summary.status)
)

const repoTasks = computed(() => (dashboard.value?.tasks ?? []).filter((task) => task.repo_name === currentRepoName.value))

const repoStats = computed(() => {
  const tasks = repoTasks.value
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === 'completed').length,
    review: tasks.filter((task) => task.status === 'needs_review').length,
    avg: tasks.length ? tasks.reduce((sum, task) => sum + task.overall_score, 0) / tasks.length : 0
  }
})

const graphStats = computed(() => currentRepoJob.value?.graph_stats ?? {
  file_count: 0,
  class_count: 0,
  function_count: 0,
  edge_count: 0
})

const feedbackItems = computed(() => taskDetail.value?.report?.judgements.map((item) => item.item) ?? [])

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

const getReviewStatus = (status: string) => reviewStatusMeta[status] ?? { text: status, type: 'info' as const }
const getIndexStatus = (status: IndexJobStatus) => indexStatusMeta[status]
const getParserStatus = (mode: ParserMode) => parserModeMeta[mode]
const getGraphStatus = (status: GraphStoreStatus) => graphStoreMeta[status]
const formatScore = (value?: number) => Number(value ?? 0).toFixed(3)
const formatTime = (value?: string) => value?.replace('T', ' ') ?? '-'
const formatLines = (startLine: number, endLine: number) => `${startLine} - ${endLine}`

const stopPolling = () => {
  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer)
    pollingTimer = null
  }
}

const startPolling = () => {
  stopPolling()
  pollingTimer = window.setInterval(async () => {
    await loadIndexingJobs(false)
    if (currentRepoJob.value) {
      currentRepoJob.value = await getIndexJob(currentRepoJob.value.summary.job_id)
    }
  }, 5000)
}

watch(currentRepoBusy, (busy) => {
  if (busy) {
    startPolling()
  } else {
    stopPolling()
  }
})

onBeforeUnmount(stopPolling)

const resetTaskForm = () => {
  taskForm.requirementId = ''
  taskForm.title = ''
  taskForm.requirementText = ''
  taskForm.acceptanceText = ''
  taskForm.businessTag = ''
  taskForm.priority = 'medium'
  taskForm.owner = ''
  taskForm.notes = ''
  taskForm.snippets = [makeSnippet()]
}

const normalizeSnippets = () =>
  taskForm.snippets
    .filter((item) => item.filename.trim() || item.code.trim())
    .map((item, index) => ({
      snippet_id: item.snippet_id || `snippet-${index + 1}`,
      filename: item.filename.trim() || `unknown_${index + 1}.ts`,
      code: item.code,
      start_line: Math.max(1, item.start_line || 1),
      end_line: Math.max(item.start_line || 1, item.end_line || 1),
      recall_reason: item.recall_reason.trim() || '人工补充候选代码',
      source: item.source || 'manual',
      selected: item.selected
    }))

const loadDashboard = async () => {
  loadingDashboard.value = true
  try {
    dashboard.value = await getReviewDashboard()
  } catch (error) {
    ElMessage.error('加载审阅任务失败')
    console.error(error)
  } finally {
    loadingDashboard.value = false
  }
}

const loadTask = async (taskId: string) => {
  if (!currentRepoReady.value) return
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

const loadIndexingJobs = async (showError = true) => {
  loadingIndexing.value = true
  try {
    indexingJobs.value = (await listIndexJobs()).jobs
  } catch (error) {
    if (showError) ElMessage.error('加载建库任务失败')
    console.error(error)
  } finally {
    loadingIndexing.value = false
  }
}

const selectRepoJob = async (jobId: string) => {
  currentRepoJob.value = await getIndexJob(jobId)
  activeTaskId.value = ''
  taskDetail.value = null
  historyRecords.value = []
}

const refreshCurrentRepo = async () => {
  if (!currentRepoJob.value) return
  currentRepoJob.value = await getIndexJob(currentRepoJob.value.summary.job_id)
  await loadIndexingJobs(false)
}

const handleCreateRepoJob = async () => {
  if (!repoForm.repoUrl.trim()) {
    ElMessage.warning('请先输入 Git 仓库链接')
    return
  }
  creatingRepoJob.value = true
  try {
    const detail = await createIndexJob({
      repo_url: repoForm.repoUrl,
      branch: repoForm.branch || 'main',
      repo_name: repoForm.repoName || undefined,
      auto_run: true
    })
    currentRepoJob.value = detail
    await loadIndexingJobs(false)
    connectRepoDialogVisible.value = false
    repoForm.repoUrl = ''
    repoForm.branch = 'main'
    repoForm.repoName = ''
    ElMessage.success('已创建离线建库任务')
  } catch (error) {
    ElMessage.error('创建建库任务失败')
    console.error(error)
  } finally {
    creatingRepoJob.value = false
  }
}

const handleRunRepoJob = async (jobId: string) => {
  runningRepoJobId.value = jobId
  try {
    const detail = await runIndexJob(jobId)
    if (currentRepoJob.value?.summary.job_id === jobId) currentRepoJob.value = detail
    await loadIndexingJobs(false)
    ElMessage.success('已重新触发离线建库')
  } catch (error) {
    ElMessage.error('执行建库失败')
    console.error(error)
  } finally {
    runningRepoJobId.value = ''
  }
}

const handleCreateTask = async () => {
  if (!currentRepoReady.value || !currentRepoJob.value) {
    ElMessage.warning('请先完成当前仓库的离线建库')
    return
  }
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
      repo_name: currentRepoJob.value.snapshot.repo_name,
      snapshot: currentRepoJob.value.snapshot.commit_hash || currentRepoJob.value.snapshot.branch,
      business_tag: taskForm.businessTag,
      priority: taskForm.priority,
      owner: taskForm.owner,
      notes: taskForm.notes,
      candidate_snippets: normalizeSnippets(),
      options: { top_k: 10, keyword_min_overlap: 0.2, enable_tool_evidence: true }
    })
    createDialogVisible.value = false
    resetTaskForm()
    await loadDashboard()
    await loadTask(detail.task.task_id)
    ElMessage.success('已创建审阅任务')
  } catch (error) {
    ElMessage.error('创建审阅任务失败')
    console.error(error)
  } finally {
    creatingTask.value = false
  }
}

const handleAnalyzeTask = async () => {
  if (!activeTaskId.value || !currentRepoReady.value) return
  loadingTask.value = true
  try {
    taskDetail.value = await analyzeReviewTask(activeTaskId.value)
    historyRecords.value = (await getReviewHistory(activeTaskId.value)).records
    await loadDashboard()
    ElMessage.success('已生成示例审阅报告')
  } catch (error) {
    ElMessage.error('生成报告失败')
    console.error(error)
  } finally {
    loadingTask.value = false
  }
}

const handleSubmitFeedback = async () => {
  if (!activeTaskId.value || !feedbackForm.judgementItem || !feedbackForm.reviewer.trim()) {
    ElMessage.warning('请选择要点并填写复核人')
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
  resetTaskForm()
  await loadIndexingJobs(false)
  if (indexingJobs.value.length) {
    const preferred = indexingJobs.value.find((job) => ['running', 'queued'].includes(job.status)) ?? indexingJobs.value[0]
    await selectRepoJob(preferred.job_id)
  }
  await loadDashboard()
})
</script>

<template>
  <div class="workspace">
    <section class="hero">
      <div>
        <p class="eyebrow">Requirement Review Workspace</p>
        <h1>需求实现审阅工作台</h1>
        <p class="hero-text">仓库是主入口。只有当前仓库完成离线建库后，审阅任务区才会解锁。</p>
      </div>
      <el-space wrap>
        <el-button type="primary" size="large" @click="connectRepoDialogVisible = true"><el-icon><Link /></el-icon>接入代码仓库</el-button>
        <el-button type="primary" plain size="large" :disabled="!currentRepoReady" @click="createDialogVisible = true"><el-icon><DocumentAdd /></el-icon>新建审阅任务</el-button>
        <el-button size="large" :loading="loadingIndexing" @click="refreshCurrentRepo"><el-icon><RefreshRight /></el-icon>刷新</el-button>
      </el-space>
    </section>

    <el-row :gutter="16" class="block-row">
      <el-col :xs="24" :xl="10">
        <el-card class="panel-card">
          <template #header><div class="panel-head"><span>当前仓库</span><el-tag :type="currentRepoReady ? 'success' : 'warning'">{{ currentRepoReady ? '可审阅' : '未就绪' }}</el-tag></div></template>
          <template v-if="currentRepoJob">
            <p class="repo-title">{{ currentRepoJob.snapshot.repo_name }}</p>
            <p class="mini">{{ currentRepoJob.snapshot.repo_url }}</p>
            <div class="chip-row">
              <el-tag :type="getIndexStatus(currentRepoJob.summary.status).type">{{ getIndexStatus(currentRepoJob.summary.status).text }}</el-tag>
              <el-tag :type="getParserStatus(currentRepoJob.summary.parser_mode).type">{{ getParserStatus(currentRepoJob.summary.parser_mode).text }}</el-tag>
              <el-tag :type="getGraphStatus(currentRepoJob.summary.graph_store_status).type">{{ getGraphStatus(currentRepoJob.summary.graph_store_status).text }}</el-tag>
            </div>
            <p class="mini">当前步骤：{{ currentRepoJob.current_step }}</p>
            <p class="mini">分支：{{ currentRepoJob.snapshot.branch }}</p>
            <p class="mini">快照：{{ currentRepoJob.snapshot.commit_hash || currentRepoJob.snapshot.branch }}</p>
            <div class="stats-grid">
              <div class="mini-stat"><span>文件</span><strong>{{ graphStats.file_count }}</strong></div>
              <div class="mini-stat"><span>类</span><strong>{{ graphStats.class_count }}</strong></div>
              <div class="mini-stat"><span>函数</span><strong>{{ graphStats.function_count }}</strong></div>
              <div class="mini-stat"><span>边</span><strong>{{ graphStats.edge_count }}</strong></div>
            </div>
            <el-alert v-if="!currentRepoReady" class="mt" title="审阅区已锁定" :description="currentRepoJob.setup_hints[0] || '建库尚未完成。'" type="warning" :closable="false" />
            <el-card v-if="currentRepoJob.setup_hints.length" class="inner-card mt-sm">
              <template #header><span>建库提示</span></template>
              <ul class="plain-list"><li v-for="hint in currentRepoJob.setup_hints" :key="hint">{{ hint }}</li></ul>
            </el-card>
            <el-card class="inner-card mt-sm">
              <template #header><span>日志</span></template>
              <div class="log-list"><div v-for="log in currentRepoJob.logs" :key="log" class="log-item">{{ log }}</div></div>
            </el-card>
          </template>
          <el-empty v-else description="请先接入代码仓库" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="14">
        <el-card class="panel-card">
          <template #header><div class="panel-head"><span>建库任务</span><el-button text @click="loadIndexingJobs()">刷新列表</el-button></div></template>
          <el-empty v-if="!indexingJobs.length" description="暂无建库任务" :image-size="56" />
          <div v-for="job in indexingJobs" :key="job.job_id" class="job-card" :class="{ active: currentRepoJob?.summary.job_id === job.job_id }">
            <div class="panel-head"><strong>{{ job.repo_name }}</strong><el-tag size="small" :type="getIndexStatus(job.status).type">{{ getIndexStatus(job.status).text }}</el-tag></div>
            <p class="mini">分支 {{ job.branch }} · 解析 {{ getParserStatus(job.parser_mode).text }} · {{ formatTime(job.updated_at) }}</p>
            <div class="panel-head mt-sm">
              <el-tag size="small" :type="getGraphStatus(job.graph_store_status).type">{{ getGraphStatus(job.graph_store_status).text }}</el-tag>
              <div class="actions"><el-button size="small" @click="selectRepoJob(job.job_id)">查看</el-button><el-button size="small" type="primary" plain :loading="runningRepoJobId === job.job_id" @click="handleRunRepoJob(job.job_id)">重新建库</el-button></div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="block-row">
      <el-col :xs="24" :xl="7">
        <el-card class="panel-card">
          <template #header><div class="panel-head"><span>审阅任务</span><el-tag type="info">{{ repoTasks.length }}</el-tag></div></template>
          <el-alert v-if="!currentRepoReady" title="建库完成后才可进入审阅" type="warning" :closable="false" class="mt-sm" />
          <div class="stats-grid">
            <div class="mini-stat"><span>任务</span><strong>{{ repoStats.total }}</strong></div>
            <div class="mini-stat"><span>待复核</span><strong>{{ repoStats.review }}</strong></div>
            <div class="mini-stat"><span>已完成</span><strong>{{ repoStats.done }}</strong></div>
            <div class="mini-stat"><span>均分</span><strong>{{ formatScore(repoStats.avg) }}</strong></div>
          </div>
          <div v-for="task in repoTasks" :key="task.task_id" class="task-card" :class="{ active: task.task_id === activeTaskId }" @click="loadTask(task.task_id)">
            <div class="panel-head"><strong>{{ task.title }}</strong><el-tag size="small" :type="getReviewStatus(task.status).type">{{ getReviewStatus(task.status).text }}</el-tag></div>
            <p class="mini">{{ task.requirement_id }} · {{ task.business_tag || '未分类' }}</p>
            <div class="panel-head mt-sm"><el-tag size="small" :type="priorityMeta[task.priority].type">{{ priorityMeta[task.priority].text }}</el-tag><span class="mini">{{ formatScore(task.overall_score) }}</span></div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="17">
        <el-card class="panel-card">
          <template #header><div class="panel-head"><strong>{{ taskDetail?.task.title || '审阅详情' }}</strong><el-space><el-button type="primary" plain :disabled="!activeTaskId || !currentRepoReady" :loading="loadingTask" @click="handleAnalyzeTask">生成示例报告</el-button><el-button :loading="loadingDashboard" @click="loadDashboard">刷新任务</el-button></el-space></div></template>
          <el-empty v-if="!taskDetail" description="请选择一个审阅任务" :image-size="64" />
          <template v-else>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="需求编号">{{ taskDetail.task.requirement_id }}</el-descriptions-item>
              <el-descriptions-item label="状态"><el-tag :type="getReviewStatus(taskDetail.task.status).type">{{ getReviewStatus(taskDetail.task.status).text }}</el-tag></el-descriptions-item>
              <el-descriptions-item label="仓库">{{ taskDetail.task.repo_name }}</el-descriptions-item>
              <el-descriptions-item label="快照">{{ taskDetail.task.snapshot }}</el-descriptions-item>
            </el-descriptions>
            <el-card class="inner-card mt"><template #header><span>需求描述</span></template><p class="paragraph">{{ taskDetail.requirement_text }}</p></el-card>
            <el-card class="inner-card"><template #header><span>验收标准</span></template><ul class="plain-list"><li v-for="item in taskDetail.acceptance_criteria" :key="item">{{ item }}</li></ul></el-card>
            <el-card class="inner-card"><template #header><span>候选代码</span></template><div v-for="snippet in taskDetail.candidate_snippets" :key="snippet.snippet_id" class="snippet-card"><div class="panel-head"><strong>{{ snippet.filename }}</strong><span class="mini">{{ formatLines(snippet.start_line, snippet.end_line) }}</span></div><p class="mini">{{ snippet.source }} · {{ snippet.recall_reason || '未提供' }}</p><pre class="code-block">{{ snippet.code }}</pre></div></el-card>
            <el-card v-if="taskDetail.report" class="inner-card"><template #header><div class="panel-head"><span>审阅报告</span><el-space><el-tag :type="getReviewStatus(taskDetail.report.status).type">{{ getReviewStatus(taskDetail.report.status).text }}</el-tag><el-tag type="info">分数 {{ formatScore(taskDetail.report.overall_score) }}</el-tag><el-tag type="info">置信度 {{ formatScore(taskDetail.report.overall_confidence) }}</el-tag></el-space></div></template><el-alert :title="taskDetail.report.summary" type="info" :closable="false" /><el-collapse class="mt"><el-collapse-item v-for="item in taskDetail.report.judgements" :key="item.item" :title="item.item"><p class="paragraph">{{ item.notes }}</p><el-space wrap><el-tag size="small" :type="getReviewStatus(item.status).type">{{ getReviewStatus(item.status).text }}</el-tag><el-tag size="small" type="info">{{ item.score.toFixed(2) }}</el-tag><el-tag size="small" type="info">{{ item.confidence.toFixed(2) }}</el-tag></el-space></el-collapse-item></el-collapse><el-row :gutter="16" class="mt"><el-col :xs="24" :xl="8"><strong>结构性缺口</strong><ul class="plain-list"><li v-for="gap in taskDetail.report.structural_gaps" :key="gap">{{ gap }}</li></ul></el-col><el-col :xs="24" :xl="8"><strong>建议复核点</strong><ul class="plain-list"><li v-for="focus in taskDetail.report.review_focuses" :key="focus">{{ focus }}</li></ul></el-col><el-col :xs="24" :xl="8"><strong>历史记录</strong><ul class="plain-list"><li v-for="record in historyRecords" :key="record.record_id">{{ record.label }} · {{ formatScore(record.overall_score) }}</li></ul></el-col></el-row></el-card>
            <el-card class="inner-card"><template #header><span>人工复核</span></template><el-form label-position="top"><el-row :gutter="12"><el-col :span="8"><el-form-item label="要点"><el-select v-model="feedbackForm.judgementItem" placeholder="选择要点"><el-option v-for="item in feedbackItems" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-col><el-col :span="8"><el-form-item label="复核结论"><el-select v-model="feedbackForm.decision"><el-option label="认同" value="agree" /><el-option label="存疑" value="question" /><el-option label="误判" value="misjudged" /></el-select></el-form-item></el-col><el-col :span="8"><el-form-item label="复核人"><el-input v-model="feedbackForm.reviewer" /></el-form-item></el-col></el-row><el-form-item label="复核备注"><el-input v-model="feedbackForm.comment" type="textarea" :rows="3" /></el-form-item><el-button type="primary" :loading="submittingFeedback" @click="handleSubmitFeedback">提交复核</el-button></el-form><div v-for="entry in taskDetail.feedback_entries" :key="entry.feedback_id" class="feedback-entry"><div class="panel-head"><strong>{{ entry.judgement_item }}</strong><el-tag size="small">{{ feedbackLabel[entry.decision] }}</el-tag></div><p class="mini">{{ entry.reviewer }} · {{ formatTime(entry.created_at) }}</p><p class="paragraph">{{ entry.comment || '无备注' }}</p></div></el-card>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="connectRepoDialogVisible" title="接入代码仓库" width="680px">
      <el-form label-position="top">
        <el-form-item label="Git 仓库链接"><el-input v-model="repoForm.repoUrl" placeholder="例如 https://github.com/org/repo.git" /></el-form-item>
        <el-row :gutter="12"><el-col :span="12"><el-form-item label="分支"><el-input v-model="repoForm.branch" /></el-form-item></el-col><el-col :span="12"><el-form-item label="仓库别名"><el-input v-model="repoForm.repoName" placeholder="可选" /></el-form-item></el-col></el-row>
        <el-alert title="接入后会自动创建离线建库任务" description="后端会同步 Git 仓库、执行 ArkAnalyzer 或占位解析、生成图工件，并尝试写入 Neo4j。" type="info" :closable="false" />
      </el-form>
      <template #footer><el-space><el-button @click="connectRepoDialogVisible = false">取消</el-button><el-button type="primary" :loading="creatingRepoJob" @click="handleCreateRepoJob">创建建库任务</el-button></el-space></template>
    </el-dialog>

    <el-dialog v-model="createDialogVisible" title="新建需求审阅任务" width="860px">
      <el-form label-position="top">
        <el-row :gutter="12"><el-col :span="12"><el-form-item label="需求编号"><el-input v-model="taskForm.requirementId" /></el-form-item></el-col><el-col :span="12"><el-form-item label="任务标题"><el-input v-model="taskForm.title" /></el-form-item></el-col></el-row>
        <el-form-item label="需求描述"><el-input v-model="taskForm.requirementText" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="验收标准"><el-input v-model="taskForm.acceptanceText" type="textarea" :rows="4" placeholder="每行一条" /></el-form-item>
        <el-row :gutter="12"><el-col :span="8"><el-form-item label="业务标签"><el-input v-model="taskForm.businessTag" /></el-form-item></el-col><el-col :span="8"><el-form-item label="优先级"><el-select v-model="taskForm.priority"><el-option label="高" value="high" /><el-option label="中" value="medium" /><el-option label="低" value="low" /></el-select></el-form-item></el-col><el-col :span="8"><el-form-item label="负责人"><el-input v-model="taskForm.owner" /></el-form-item></el-col></el-row>
        <el-form-item label="备注"><el-input v-model="taskForm.notes" /></el-form-item>
        <el-divider>候选种子代码</el-divider>
        <div v-for="(snippet, index) in taskForm.snippets" :key="snippet.snippet_id" class="snippet-form"><el-row :gutter="12"><el-col :span="12"><el-input v-model="snippet.filename" placeholder="文件路径" /></el-col><el-col :span="4"><el-input-number v-model="snippet.start_line" :min="1" /></el-col><el-col :span="4"><el-input-number v-model="snippet.end_line" :min="snippet.start_line || 1" /></el-col><el-col :span="4"><el-button type="danger" plain @click="taskForm.snippets.splice(index, 1)">删除</el-button></el-col></el-row><el-input v-model="snippet.recall_reason" class="mt-sm" placeholder="召回理由" /><el-input v-model="snippet.code" class="mt-sm" type="textarea" :rows="4" placeholder="粘贴候选代码" /></div>
        <el-button plain @click="taskForm.snippets.push(makeSnippet())">新增候选代码</el-button>
      </el-form>
      <template #footer><el-space><el-button @click="createDialogVisible = false">取消</el-button><el-button type="primary" :loading="creatingTask" :disabled="!currentRepoReady" @click="handleCreateTask">创建任务</el-button></el-space></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.workspace { min-height: 100vh; padding: 8px 0 24px; background: linear-gradient(180deg, #fffaf2 0%, #f5f8ff 48%, #f4f4f8 100%); }
.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; padding: 24px 28px; border-radius: 24px; background: linear-gradient(135deg, #21344d 0%, #325b82 62%, #d98943 100%); color: #fffdf7; }
.eyebrow { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.8; }
.hero h1 { margin: 0; font-size: 34px; }
.hero-text { margin: 10px 0 0; max-width: 720px; line-height: 1.7; opacity: 0.92; }
.block-row { margin-bottom: 16px; }
.panel-card, .inner-card { border-radius: 18px; border: 1px solid rgba(33, 52, 77, 0.08); background: rgba(255, 255, 255, 0.92); }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.repo-title { margin: 0; font-size: 20px; color: #21344d; }
.mini { margin: 6px 0 0; color: #6f7890; font-size: 12px; line-height: 1.5; }
.chip-row, .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.mini-stat { padding: 14px; border-radius: 14px; background: #fbfcff; border: 1px solid rgba(50, 91, 130, 0.08); }
.mini-stat span { display: block; color: #6b748a; font-size: 12px; }
.mini-stat strong { display: block; margin-top: 10px; color: #21344d; font-size: 24px; }
.job-card, .task-card, .snippet-card, .snippet-form { margin-top: 12px; padding: 14px; border-radius: 14px; border: 1px solid rgba(50, 91, 130, 0.08); background: linear-gradient(180deg, #fff 0%, #fafcff 100%); }
.job-card.active, .task-card.active { border-color: rgba(50, 91, 130, 0.22); box-shadow: 0 12px 24px rgba(50, 91, 130, 0.1); }
.task-card { cursor: pointer; }
.paragraph { line-height: 1.75; color: #33445d; }
.plain-list { margin: 0; padding-left: 18px; line-height: 1.75; color: #33445d; }
.log-list { max-height: 220px; overflow: auto; border-radius: 12px; background: #141b24; padding: 12px; }
.log-item { color: #dbe7ff; font-size: 12px; line-height: 1.7; word-break: break-all; }
.code-block { overflow: auto; margin: 10px 0 0; padding: 12px; border-radius: 14px; background: #1f2632; color: #edf2fd; font-size: 12px; line-height: 1.65; white-space: pre-wrap; }
.mt { margin-top: 16px; }
.mt-sm { margin-top: 10px; }
.feedback-entry { padding-top: 12px; margin-top: 12px; border-top: 1px dashed rgba(117, 128, 154, 0.22); }
@media (max-width: 960px) { .hero { flex-direction: column; align-items: flex-start; } .hero h1 { font-size: 28px; } .stats-grid { grid-template-columns: 1fr; } }
</style>
