<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Link, RefreshRight } from '@element-plus/icons-vue'
import {
  analyzeReviewTask,
  getReviewDashboard,
  getReviewHistory,
  getReviewTask,
  submitReviewFeedback,
  type FeedbackDecision,
  type ReviewDashboardResponse,
  type ReviewHistoryRecord,
  type ReviewTaskDetail
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
import {
  getWorkItemDetail,
  importWorkItem,
  listWorkItemConnectors,
  listWorkItems,
  type WorkItemConnectorSummary,
  type WorkItemDetail,
  type WorkItemSummary
} from '@/api/workitems'

const dashboard = ref<ReviewDashboardResponse | null>(null)
const indexingJobs = ref<IndexJobSummary[]>([])
const currentRepoJob = ref<IndexJobDetail | null>(null)
const taskDetail = ref<ReviewTaskDetail | null>(null)
const historyRecords = ref<ReviewHistoryRecord[]>([])
const activeTaskId = ref('')
const workitemConnectors = ref<WorkItemConnectorSummary[]>([])
const workitems = ref<WorkItemSummary[]>([])
const workitemDetail = ref<WorkItemDetail | null>(null)
const selectedConnectorKey = ref('')
const selectedWorkItemId = ref('')

const loadingDashboard = ref(false)
const loadingTask = ref(false)
const loadingIndexing = ref(false)
const loadingWorkitems = ref(false)
const loadingWorkitemDetail = ref(false)
const creatingRepoJob = ref(false)
const importingWorkitem = ref(false)
const runningRepoJobId = ref('')
const submittingFeedback = ref(false)
const connectRepoDialogVisible = ref(false)
const importDialogVisible = ref(false)

let pollingTimer: number | null = null

const repoForm = reactive({ repoUrl: '', branch: 'main', repoName: '' })
const feedbackForm = reactive({ judgementItem: '', decision: 'agree' as FeedbackDecision, comment: '', reviewer: '' })

const reviewStatusMeta: Record<string, string> = {
  completed: '已完成',
  needs_review: '需复核',
  ready: '就绪',
  draft: '草稿',
  satisfied: '满足',
  partially_satisfied: '部分满足',
  not_satisfied: '不满足'
}
const indexStatusMeta: Record<IndexJobStatus, string> = {
  queued: '排队中',
  running: '建库中',
  completed: '建库完成',
  completed_with_warnings: '完成但有告警',
  failed: '建库失败'
}
const parserModeMeta: Record<ParserMode, string> = {
  arkanalyzer: 'ArkAnalyzer',
  placeholder: '占位解析'
}
const graphStoreMeta: Record<GraphStoreStatus, string> = {
  loaded: '已写入 Neo4j',
  pending_setup: '待配置 Neo4j',
  failed: 'Neo4j 写入失败',
  not_attempted: '未写入'
}
const feedbackLabel: Record<FeedbackDecision, string> = {
  agree: '认同',
  question: '存疑',
  misjudged: '误判'
}

const currentRepoName = computed(() => currentRepoJob.value?.snapshot.repo_name ?? '')
const currentRepoReady = computed(() => Boolean(currentRepoJob.value) && ['completed', 'completed_with_warnings'].includes(currentRepoJob.value.summary.status))
const currentRepoBusy = computed(() => Boolean(currentRepoJob.value) && ['queued', 'running'].includes(currentRepoJob.value.summary.status))
const repoTasks = computed(() => (dashboard.value?.tasks ?? []).filter((task) => task.repo_name === currentRepoName.value))
const feedbackItems = computed(() => taskDetail.value?.report?.judgements.map((item) => item.item) ?? [])
const graphStats = computed(() => currentRepoJob.value?.graph_stats ?? {
  file_count: 0,
  class_count: 0,
  function_count: 0,
  edge_count: 0
})
const repoTaskStats = computed(() => {
  const tasks = repoTasks.value
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    review: tasks.filter((task) => task.status === 'needs_review').length
  }
})
const selectedConnector = computed(() => workitemConnectors.value.find((item) => item.connector_key === selectedConnectorKey.value) ?? null)

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
  if (busy) startPolling()
  else stopPolling()
})

watch(selectedConnectorKey, async (connectorKey) => {
  if (!connectorKey) return
  await loadWorkitems(connectorKey, false)
})

onBeforeUnmount(stopPolling)

const formatScore = (value?: number) => Number(value ?? 0).toFixed(3)
const formatTime = (value?: string) => value?.replace('T', ' ') ?? '-'

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
    if (!currentRepoJob.value && indexingJobs.value.length) {
      currentRepoJob.value = await getIndexJob(indexingJobs.value[0].job_id)
    } else if (currentRepoJob.value && !indexingJobs.value.find((job) => job.job_id === currentRepoJob.value?.summary.job_id)) {
      currentRepoJob.value = indexingJobs.value.length ? await getIndexJob(indexingJobs.value[0].job_id) : null
    }
  } catch (error) {
    if (showError) ElMessage.error('加载建库任务失败')
    console.error(error)
  } finally {
    loadingIndexing.value = false
  }
}

const loadWorkitemConnectors = async () => {
  try {
    const response = await listWorkItemConnectors()
    workitemConnectors.value = response.connectors
    if (!selectedConnectorKey.value && response.connectors.length) {
      selectedConnectorKey.value = response.connectors[0].connector_key
    }
  } catch (error) {
    ElMessage.error('加载工单接入器失败')
    console.error(error)
  }
}

const loadWorkitems = async (connectorKey: string, showError = true) => {
  loadingWorkitems.value = true
  try {
    const response = await listWorkItems(connectorKey)
    workitems.value = response.items
    if (!selectedWorkItemId.value && response.items.length) {
      await selectWorkItem(response.items[0].item_id)
    } else if (selectedWorkItemId.value && !response.items.find((item) => item.item_id === selectedWorkItemId.value)) {
      selectedWorkItemId.value = ''
      workitemDetail.value = null
    }
  } catch (error) {
    if (showError) ElMessage.error('加载工单列表失败')
    console.error(error)
  } finally {
    loadingWorkitems.value = false
  }
}

const selectWorkItem = async (itemId: string) => {
  if (!selectedConnectorKey.value) return
  loadingWorkitemDetail.value = true
  selectedWorkItemId.value = itemId
  try {
    workitemDetail.value = await getWorkItemDetail(selectedConnectorKey.value, itemId)
  } catch (error) {
    ElMessage.error('加载工单详情失败')
    console.error(error)
  } finally {
    loadingWorkitemDetail.value = false
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

const openImportDialog = async () => {
  if (!currentRepoReady.value) {
    ElMessage.warning('请先完成当前仓库的离线建库')
    return
  }
  importDialogVisible.value = true
  if (!workitemConnectors.value.length) {
    await loadWorkitemConnectors()
  } else if (selectedConnectorKey.value) {
    await loadWorkitems(selectedConnectorKey.value, false)
  }
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

const handleImportWorkitem = async () => {
  if (!currentRepoReady.value || !currentRepoJob.value || !workitemDetail.value || !selectedConnectorKey.value) {
    ElMessage.warning('请先选择当前仓库和待导入工单')
    return
  }
  importingWorkitem.value = true
  try {
    const detail = await importWorkItem({
      connector_key: selectedConnectorKey.value,
      item_id: workitemDetail.value.item_id,
      index_job_id: currentRepoJob.value.summary.job_id,
      repo_name: currentRepoJob.value.snapshot.repo_name,
      snapshot: currentRepoJob.value.snapshot.commit_hash || currentRepoJob.value.snapshot.branch,
      auto_expand_graph_evidence: true
    })
    importDialogVisible.value = false
    await loadDashboard()
    await loadTask(detail.task.task_id)
    ElMessage.success('已导入需求工单并创建审阅任务')
  } catch (error) {
    ElMessage.error('导入需求工单失败')
    console.error(error)
  } finally {
    importingWorkitem.value = false
  }
}

const handleAnalyzeTask = async () => {
  if (!activeTaskId.value || !currentRepoReady.value) return
  loadingTask.value = true
  try {
    taskDetail.value = await analyzeReviewTask(activeTaskId.value)
    historyRecords.value = (await getReviewHistory(activeTaskId.value)).records
    await loadDashboard()
    ElMessage.success('已重新生成审阅报告')
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
  await Promise.all([loadIndexingJobs(false), loadDashboard(), loadWorkitemConnectors()])
})
</script>

<template>
  <div class="workspace">
    <div class="hero">
      <div>
        <p class="eyebrow">Requirement Review Workspace</p>
        <h1>需求实现审阅工作台</h1>
        <p class="hero-text">当前链路：接入仓库、离线建图、导入需求工单、自动扩展图证据、生成审阅任务。当前仓库完成建库后，系统仅接受需求工单作为审阅输入。</p>
      </div>
      <el-space wrap>
        <el-button type="primary" @click="connectRepoDialogVisible = true"><el-icon><Link /></el-icon>接入代码仓库</el-button>
        <el-button type="primary" plain :disabled="!currentRepoReady" @click="openImportDialog"><el-icon><Download /></el-icon>导入需求工单</el-button>
        <el-button :loading="loadingIndexing" @click="refreshCurrentRepo"><el-icon><RefreshRight /></el-icon>刷新</el-button>
      </el-space>
    </div>

    <el-row :gutter="16" class="block-row">
      <el-col :xs="24" :xl="10">
        <el-card class="panel-card">
          <template #header>
            <div class="head">
              <span>当前仓库</span>
              <el-tag>{{ currentRepoReady ? '可审阅' : '未就绪' }}</el-tag>
            </div>
          </template>
          <template v-if="currentRepoJob">
            <p class="repo-title"><strong>{{ currentRepoJob.snapshot.repo_name }}</strong></p>
            <p class="mini">{{ currentRepoJob.snapshot.repo_url }}</p>
            <el-space wrap>
              <el-tag>{{ indexStatusMeta[currentRepoJob.summary.status] }}</el-tag>
              <el-tag>{{ parserModeMeta[currentRepoJob.summary.parser_mode] }}</el-tag>
              <el-tag>{{ graphStoreMeta[currentRepoJob.summary.graph_store_status] }}</el-tag>
            </el-space>
            <p class="mini">{{ currentRepoJob.current_step }}</p>
            <p class="mini">快照 {{ currentRepoJob.snapshot.commit_hash || currentRepoJob.snapshot.branch }}</p>
            <div class="stat-grid">
              <div class="stat-box"><span>文件</span><strong>{{ graphStats.file_count }}</strong></div>
              <div class="stat-box"><span>类</span><strong>{{ graphStats.class_count }}</strong></div>
              <div class="stat-box"><span>函数</span><strong>{{ graphStats.function_count }}</strong></div>
              <div class="stat-box"><span>边</span><strong>{{ graphStats.edge_count }}</strong></div>
            </div>
            <ul v-if="currentRepoJob.setup_hints.length" class="mini-list">
              <li v-for="hint in currentRepoJob.setup_hints" :key="hint">{{ hint }}</li>
            </ul>
            <div v-if="currentRepoJob.logs.length" class="log-box">
              <div v-for="log in currentRepoJob.logs" :key="log" class="log-line">{{ log }}</div>
            </div>
          </template>
          <el-empty v-else description="请先接入代码仓库" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="14">
        <el-card class="panel-card">
          <template #header>
            <div class="head">
              <span>建库任务</span>
              <el-button text @click="loadIndexingJobs()">刷新</el-button>
            </div>
          </template>
          <div v-for="job in indexingJobs" :key="job.job_id" class="list-card" :class="{ active: currentRepoJob?.summary.job_id === job.job_id }">
            <div class="head">
              <strong>{{ job.repo_name }}</strong>
              <el-tag size="small">{{ indexStatusMeta[job.status] }}</el-tag>
            </div>
            <p class="mini">{{ job.branch }} · {{ parserModeMeta[job.parser_mode] }} · {{ formatTime(job.updated_at) }}</p>
            <el-space wrap>
              <el-button size="small" @click="selectRepoJob(job.job_id)">查看</el-button>
              <el-button size="small" type="primary" plain :loading="runningRepoJobId === job.job_id" @click="handleRunRepoJob(job.job_id)">重新建库</el-button>
            </el-space>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="block-row">
      <el-col :xs="24" :xl="7">
        <el-card class="panel-card">
          <template #header>
            <div class="head">
              <span>审阅任务</span>
              <el-tag>{{ repoTasks.length }}</el-tag>
            </div>
          </template>
          <div class="stat-grid compact">
            <div class="stat-box"><span>总数</span><strong>{{ repoTaskStats.total }}</strong></div>
            <div class="stat-box"><span>已完成</span><strong>{{ repoTaskStats.completed }}</strong></div>
            <div class="stat-box"><span>待复核</span><strong>{{ repoTaskStats.review }}</strong></div>
          </div>
          <div v-for="task in repoTasks" :key="task.task_id" class="list-card clickable" :class="{ active: task.task_id === activeTaskId }" @click="loadTask(task.task_id)">
            <div class="head">
              <strong>{{ task.title }}</strong>
              <span class="mini">{{ reviewStatusMeta[task.status] }}</span>
            </div>
            <p class="mini">{{ task.requirement_id }} · {{ task.business_tag || '未分类' }}</p>
            <p class="mini">分数 {{ formatScore(task.overall_score) }}</p>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="17">
        <el-card class="panel-card">
          <template #header>
            <div class="head">
              <span>{{ taskDetail?.task.title || '审阅详情' }}</span>
              <el-button type="primary" plain :disabled="!activeTaskId || !currentRepoReady" :loading="loadingTask" @click="handleAnalyzeTask">重新生成报告</el-button>
            </div>
          </template>
          <el-empty v-if="!taskDetail" description="请选择一个审阅任务" :image-size="64" />
          <template v-else>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="需求编号">{{ taskDetail.task.requirement_id }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ reviewStatusMeta[taskDetail.task.status] }}</el-descriptions-item>
              <el-descriptions-item label="仓库">{{ taskDetail.task.repo_name }}</el-descriptions-item>
              <el-descriptions-item label="快照">{{ taskDetail.task.snapshot }}</el-descriptions-item>
            </el-descriptions>
            <el-card class="inner panel-card">
              <template #header><span>需求描述</span></template>
              <p>{{ taskDetail.requirement_text }}</p>
            </el-card>
            <el-card class="inner panel-card">
              <template #header><span>候选代码</span></template>
              <div v-for="snippet in taskDetail.candidate_snippets" :key="snippet.snippet_id" class="list-card">
                <strong>{{ snippet.filename }}</strong>
                <p class="mini">{{ snippet.recall_reason }}</p>
                <pre class="code">{{ snippet.code }}</pre>
              </div>
            </el-card>
            <el-card v-if="taskDetail.graph_evidence" class="inner panel-card">
              <template #header><span>图证据概览</span></template>
              <p class="mini">来源 {{ taskDetail.graph_evidence.source }}</p>
              <p class="mini">命中 seed {{ taskDetail.graph_evidence.summary.matched_seed_count }}，扩展节点 {{ taskDetail.graph_evidence.summary.expanded_node_count }}，路径 {{ taskDetail.graph_evidence.summary.evidence_path_count }}</p>
            </el-card>
            <el-card v-if="taskDetail.report" class="inner panel-card">
              <template #header><span>审阅报告</span></template>
              <el-alert :title="taskDetail.report.summary" type="info" :closable="false" />
              <div class="grid">
                <div>
                  <strong>逐条结论</strong>
                  <ul class="mini-list">
                    <li v-for="item in taskDetail.report.judgements" :key="item.item">{{ item.item }} · {{ reviewStatusMeta[item.status] }} · {{ item.score.toFixed(2) }}</li>
                  </ul>
                </div>
                <div>
                  <strong>证据路径</strong>
                  <ul class="mini-list">
                    <li v-for="path in taskDetail.report.evidence_paths" :key="path.path_id">{{ path.nodes.map((node) => node.label).join(' -> ') || path.title }}</li>
                  </ul>
                </div>
                <div>
                  <strong>结构性缺口</strong>
                  <ul class="mini-list">
                    <li v-for="gap in taskDetail.report.structural_gaps" :key="gap">{{ gap }}</li>
                  </ul>
                </div>
                <div>
                  <strong>建议复核点</strong>
                  <ul class="mini-list">
                    <li v-for="focus in taskDetail.report.review_focuses" :key="focus">{{ focus }}</li>
                  </ul>
                </div>
              </div>
            </el-card>
            <el-card class="inner panel-card">
              <template #header><span>人工复核</span></template>
              <el-form label-position="top">
                <el-row :gutter="12">
                  <el-col :span="8">
                    <el-form-item label="要点">
                      <el-select v-model="feedbackForm.judgementItem">
                        <el-option v-for="item in feedbackItems" :key="item" :label="item" :value="item" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="结论">
                      <el-select v-model="feedbackForm.decision">
                        <el-option label="认同" value="agree" />
                        <el-option label="存疑" value="question" />
                        <el-option label="误判" value="misjudged" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="复核人">
                      <el-input v-model="feedbackForm.reviewer" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="备注">
                  <el-input v-model="feedbackForm.comment" type="textarea" :rows="3" />
                </el-form-item>
                <el-button type="primary" :loading="submittingFeedback" @click="handleSubmitFeedback">提交复核</el-button>
              </el-form>
              <ul class="mini-list">
                <li v-for="entry in taskDetail.feedback_entries" :key="entry.feedback_id">{{ entry.judgement_item }} · {{ feedbackLabel[entry.decision] }} · {{ entry.reviewer }} · {{ formatTime(entry.created_at) }}</li>
              </ul>
              <ul class="mini-list">
                <li v-for="record in historyRecords" :key="record.record_id">{{ record.label }} · {{ formatScore(record.overall_score) }}</li>
              </ul>
            </el-card>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="connectRepoDialogVisible" title="接入代码仓库" width="680px">
      <el-form label-position="top">
        <el-form-item label="Git 仓库链接"><el-input v-model="repoForm.repoUrl" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="分支"><el-input v-model="repoForm.branch" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="仓库别名"><el-input v-model="repoForm.repoName" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="connectRepoDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creatingRepoJob" @click="handleCreateRepoJob">创建建库任务</el-button>
        </el-space>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入需求工单" width="1120px">
      <div class="dialog-grid">
        <el-card class="panel-card">
          <template #header>
            <div class="head">
              <span>工单来源</span>
              <el-select v-model="selectedConnectorKey" style="width: 220px">
                <el-option v-for="connector in workitemConnectors" :key="connector.connector_key" :label="connector.name" :value="connector.connector_key" />
              </el-select>
            </div>
          </template>
          <p v-if="selectedConnector" class="mini">{{ selectedConnector.description }}</p>
          <div v-for="item in workitems" :key="item.item_id" class="list-card clickable" :class="{ active: item.item_id === selectedWorkItemId }" @click="selectWorkItem(item.item_id)">
            <div class="head"><strong>{{ item.title }}</strong><el-tag size="small">{{ item.priority }}</el-tag></div>
            <p class="mini">{{ item.requirement_id }} · {{ item.business_tag || '未分类' }}</p>
            <p class="mini">{{ item.status }} · {{ formatTime(item.updated_at) }}</p>
          </div>
          <el-empty v-if="!loadingWorkitems && !workitems.length" description="当前接入器暂无工单" :image-size="56" />
        </el-card>

        <el-card class="panel-card">
          <template #header><div class="head"><span>工单详情</span><el-tag v-if="workitemDetail">{{ workitemDetail.requirement_id }}</el-tag></div></template>
          <el-skeleton v-if="loadingWorkitemDetail" :rows="8" animated />
          <el-empty v-else-if="!workitemDetail" description="请选择一条工单" :image-size="56" />
          <template v-else>
            <p class="repo-title"><strong>{{ workitemDetail.title }}</strong></p>
            <p class="mini">负责人 {{ workitemDetail.owner || '未指定' }} · 业务 {{ workitemDetail.business_tag || '未分类' }}</p>
            <p class="mini">系统输入固定为需求工单。导入器负责提供工单、commit 和 diff，审阅主链不接受人工补录。</p>
            <el-divider />
            <p>{{ workitemDetail.requirement_text }}</p>
            <ul class="mini-list">
              <li v-for="item in workitemDetail.acceptance_criteria" :key="item">{{ item }}</li>
            </ul>
            <p class="mini">关联 commit {{ workitemDetail.linked_commits.length }} 个，派生种子 {{ workitemDetail.derived_seed_count }} 个</p>
            <div class="seed-list">
              <div v-for="commit in workitemDetail.linked_commits" :key="commit.commit_id" class="list-card">
                <div class="head"><strong>{{ commit.title }}</strong><span class="mini">{{ commit.commit_hash.slice(0, 8) }}</span></div>
                <p class="mini">{{ commit.author || '未知作者' }} · {{ formatTime(commit.created_at) }}</p>
                <p v-if="commit.message" class="mini">{{ commit.message }}</p>
                <div v-for="fileDiff in commit.file_diffs" :key="fileDiff.diff_id" class="diff-card">
                  <div class="head"><strong>{{ fileDiff.filename }}</strong><span class="mini">{{ fileDiff.change_type }} +{{ fileDiff.additions }} -{{ fileDiff.deletions }}</span></div>
                  <div v-for="hunk in fileDiff.hunks" :key="hunk.hunk_id" class="hunk-box">
                    <p class="mini">{{ hunk.header || 'diff hunk' }}</p>
                    <pre class="code">{{ hunk.added_lines.join('\n') || hunk.context_lines.join('\n') }}</pre>
                  </div>
                </div>
              </div>
              <el-divider />
              <div v-for="seed in workitemDetail.derived_seeds" :key="seed.seed_id" class="list-card">
                <strong>{{ seed.filename }}</strong>
                <p class="mini">{{ seed.recall_reason }}</p>
                <pre class="code">{{ seed.code }}</pre>
              </div>
            </div>
          </template>
        </el-card>
      </div>
      <template #footer>
        <el-space>
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="importingWorkitem" :disabled="!workitemDetail || !currentRepoReady" @click="handleImportWorkitem">导入并创建任务</el-button>
        </el-space>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.workspace { min-height: 100vh; padding: 8px 0 24px; background: linear-gradient(180deg, #fffaf2 0%, #f5f8ff 48%, #f4f4f8 100%); }
.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; padding: 24px; border-radius: 20px; background: linear-gradient(135deg, #21344d 0%, #325b82 62%, #d98943 100%); color: #fff; }
.eyebrow { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.8; }
.hero-text { margin: 10px 0 0; max-width: 760px; line-height: 1.7; }
.block-row { margin-bottom: 16px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.panel-card { border-radius: 18px; border: 1px solid rgba(33, 52, 77, 0.08); background: rgba(255, 255, 255, 0.92); }
.list-card, .inner { margin-top: 12px; }
.list-card { padding: 12px; border: 1px solid rgba(50, 91, 130, 0.12); border-radius: 12px; background: linear-gradient(180deg, #fff 0%, #fafcff 100%); }
.list-card.active { border-color: rgba(50, 91, 130, 0.32); }
.clickable { cursor: pointer; }
.mini { margin: 6px 0 0; color: #6f7890; font-size: 12px; }
.mini-list { margin: 8px 0 0; padding-left: 18px; color: #33445d; line-height: 1.7; }
.repo-title { margin: 0; font-size: 20px; color: #21344d; }
.stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.stat-grid.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.stat-box { padding: 12px; border-radius: 12px; background: #fbfcff; border: 1px solid rgba(50, 91, 130, 0.08); }
.stat-box span { display: block; color: #6b748a; font-size: 12px; }
.stat-box strong { display: block; margin-top: 8px; color: #21344d; font-size: 22px; }
.log-box { max-height: 220px; overflow: auto; margin-top: 12px; padding: 12px; border-radius: 12px; background: #141b24; }
.log-line { color: #dbe7ff; font-size: 12px; line-height: 1.7; word-break: break-all; }
.code { overflow: auto; margin: 8px 0 0; padding: 12px; border-radius: 12px; background: #1f2632; color: #edf2fd; font-size: 12px; white-space: pre-wrap; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; }
.seed-list { max-height: 420px; overflow: auto; padding-right: 4px; }
.diff-card { margin-top: 10px; padding: 10px; border-radius: 10px; background: #f8fbff; border: 1px solid rgba(50, 91, 130, 0.08); }
.hunk-box { margin-top: 8px; }
@media (max-width: 960px) { .hero { flex-direction: column; align-items: flex-start; } .grid, .stat-grid, .stat-grid.compact, .dialog-grid { grid-template-columns: 1fr; } }
</style>
