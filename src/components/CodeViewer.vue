<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Document } from '@element-plus/icons-vue'
import * as monaco from 'monaco-editor'
import type {SearchResult} from "@/api/search.ts";

// ========== 接收父组件传递的属性 ==========
const props = defineProps<SearchResult>()

// ========== 响应式数据 ==========
const editorContainer = ref<HTMLDivElement | null>(null)
let editorInstance: any = null
const lineCount = ref(props.end_line - props.start_line + 1)

// 监听属性变化，更新行号
watch(() => [props.start_line, props.end_line], () => {
  lineCount.value = props.end_line - props.start_line + 1
})

// ========== 生命周期钩子 ==========

// 组件挂载后（页面显示后）初始化编辑器
onMounted(() => {
  if (editorContainer.value) {
    editorInstance = monaco.editor.create(editorContainer.value, {
      value: props.code,
      language: 'typescript',  // 代码语言
      theme: 'vs-dark',        // 深色主题
      readOnly: true,          // 只读模式
      lineNumbers: 'off',      // 关闭默认行号（用自定义的）
      minimap: { enabled: false },  // 关闭小地图
      fontSize: 13,
      scrollBeyondLastLine: false,
      automaticLayout: true,    // 自动调整大小
      wordWrap: 'on',           // 自动换行
      padding: { top: 10, bottom: 10, left: 5, right: 5 },
      renderLineHighlight: 'all',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      tabSize: 2,               // 制表符大小
      lineHeight: 20,           // 行高
      letterSpacing: 0          // 字符间距
    })
  }
})

// 监听内容变化，动态更新编辑器
watch(() => props.code, (newVal) => {
  if (editorInstance) {
    editorInstance.setValue(newVal)
  }
})

// 组件卸载前清理编辑器（防止内存泄漏）
onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.dispose()
  }
})
</script>

<template>
  <div class="code-card">
    <!-- 卡片头部：文件信息 + 相似度 -->
    <div class="card-header">
      <div class="meta-info">
        <el-icon><Document /></el-icon>
        <span class="file-path">{{ filename }}</span>
        <el-tag size="small" type="info">
          Commit: {{ commit_message?.substring(0, 8) }}
        </el-tag>
      </div>
      <div class="score-info">
        <span>相似度:</span>
        <el-progress
            :percentage="similarity * 100"
            :stroke-width="10"
            :show-text="false"
            color="#42b983"
            class="mini-progress"
        />
        <span class="score-text">{{ (similarity * 100).toFixed(1) }}%</span>
      </div>
    </div>

    <!-- 卡片主体：行号 + 代码编辑器 -->
    <div class="card-body">
      <!-- 自定义行号 -->
      <div class="line-numbers">
        <div v-for="n in lineCount" :key="n" class="line-num">
          {{ props.start_line + n - 1 }}
        </div>
      </div>
      <!-- Monaco 编辑器容器 -->
      <div class="editor-container" ref="editorContainer"></div>
    </div>
  </div>
</template>

<style scoped>
/* 卡片容器 */
.code-card {
  background: transparent;
  border-radius: 8px;
  box-shadow: none;
  margin-bottom: 20px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

/* 文件信息 */
.meta-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #303133;
}

.file-path {
  font-family: monospace;
  font-size: 14px;
}

/* 相似度显示 */
.score-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 140px;
}

.mini-progress {
  flex: 1;
}

.score-text {
  font-size: 12px;
  color: #67c23a;
  font-weight: bold;
  width: 45px;
  text-align: right;
}

/* 卡片主体 */
.card-body {
  display: flex;
  position: relative;
  height: 300px;
}

/* 行号区域 */
.line-numbers {
  width: 50px;
  background: #282c34;
  color: #abb2bf;
  text-align: right;
  padding: 10px 5px;
  font-family: monospace;
  font-size: 13px;
  line-height: 20px;
  user-select: none;
  flex-shrink: 0;
}

/* 编辑器容器 */
.editor-container {
  flex: 1;
  height: 100%;
  overflow: hidden;
  text-align: left !important;
}

/* 确保卡片主体内的所有元素都靠左显示 */
.card-body {
  text-align: left !important;
}
</style>