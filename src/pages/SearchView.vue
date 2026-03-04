<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Search, Refresh, Connection } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as monaco from 'monaco-editor'
import CodeViewer from '@/components/CodeViewer.vue'
import {searchCode, type SearchRequest, SearchResult} from '@/api/search'

// ========== 响应式数据 ==========
const searchEditorContainer = ref<HTMLDivElement | null>(null)
let searchEditorInstance: monaco.editor.IStandaloneCodeEditor | null = null

const loading = ref(false)
const latency = ref(0)
const totalFound = ref(0)
const results = ref<SearchResult[]>([])
const searched = ref(false)

// ========== 初始化搜索编辑器 ==========
onMounted(() => {
  if (searchEditorContainer.value) {
    // 注册 ArkTS 语言支持
    monaco.languages.register({ id: 'arkts' });

    // 配置 ArkTS 语言的语法高亮
    monaco.languages.setMonarchTokensProvider('arkts', {
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*[\s\S]*?\*\//, 'comment'],
          [/\b(import|export|class|struct|interface|enum|type|function|fun|var|let|const|val|if|else|for|while|do|switch|case|default|break|continue|return|throw|try|catch|finally|async|await|public|private|protected|internal|static|override|abstract)\b/, 'keyword'],
          [/\b(boolean|number|string|any|void|undefined|null)\b/, 'type'],
          [/\b(true|false|null|undefined)\b/, 'constant'],
          [/\b\d+\.?\d*\b/, 'number'],
          [/'[^']*'/, 'string'],
          [/"[^"]*"/, 'string'],
          [/\b[A-Z][a-zA-Z0-9_]*\b/, 'type.identifier'],
          [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, 'identifier'],
          [/[{}()\[\];,.]/, 'delimiter']
        ]
      }
    });

    searchEditorInstance = monaco.editor.create(searchEditorContainer.value, {
      value: '',                    // 初始内容为空
      language: 'arkTs',            // 语言：ArkTS
      theme: 'vs-dark',             // 深色主题
      readOnly: false,              // 可编辑
      lineNumbers: 'on',            // 显示行号
      minimap: { enabled: true },   // 显示小地图
      fontSize: 14,
      scrollBeyondLastLine: false,
      automaticLayout: true,        // 自动调整大小
      wordWrap: 'on',               // 自动换行
      padding: { top: 10, bottom: 10},
      renderLineHighlight: 'all',
      quickSuggestions: true,       // 快速建议
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabSize: 2,
      lineHeight: 24,
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      contextmenu: true,
      placeholder: '请输入arkTS代码片段', // 编辑器占位符提示
      renderWhitespace: 'boundary', // 显示空白字符边界
    })

    // 监听编辑器内容变化，自动调整高度
    searchEditorInstance.onDidChangeModelContent(() => {
      adjustEditorHeight()
    })

    // 监听键盘事件，Ctrl+Enter 触发搜索
    searchEditorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          handleSearch()
        }
    )

    // 初始调整高度
    // 使用setTimeout确保父元素高度已计算完成
    setTimeout(() => {
      adjustEditorHeight()
    }, 100)
  }
})

// ========== 调整编辑器高度 ==========
const adjustEditorHeight = () => {
  if (!searchEditorInstance || !searchEditorContainer.value) return

  // 获取编辑器容器的父元素高度，使编辑器充满空间
  const editorWrapper = searchEditorContainer.value.parentElement
  if (editorWrapper) {
    const wrapperHeight = editorWrapper.clientHeight
    searchEditorContainer.value.style.height = `${wrapperHeight}px`
    searchEditorInstance.layout()
  }
}

// ========== 搜索处理函数 ==========
const handleSearch = async () => {
  // 1. 获取编辑器内容
  const query = searchEditorInstance?.getValue() || ''

  // 2. 验证输入
  if (!query.trim()) {
    ElMessage.warning('请输入搜索内容')
    searchEditorInstance?.focus()
    return
  }

  // 3. 设置加载状态
  loading.value = true
  results.value = []
  searched.value = false

  try {
    // 4. 发送请求到后端
    const searchParams: SearchRequest = {
      query: query,
      top_k: 10, // 默认显示10条
      threshold: 0.5 // 默认相似度阈值0.5
    }
    const res = await searchCode(searchParams)

    // 5. 更新结果数据
    latency.value = res.latency_ms
    totalFound.value = res.total_found
    results.value = res.results
    searched.value = true

    // 6. 提示用户
    if (results.value.length === 0) {
      ElMessage.info('未找到匹配结果')
    } else {
      ElMessage.success(`找到 ${results.value.length} 个相关代码片段`)
    }
  } catch (error) {
    ElMessage.error('检索失败，请检查后端服务')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// ========== 测试后端连接函数 ==========
const testBackendConnection = async () => {
  loading.value = true
  searched.value = false
  try {
    // 发送测试搜索请求
    const testParams: SearchRequest = {
      query: '测试连接',
      top_k: 2,
      threshold: 0
    }
    const res = await searchCode(testParams)
    console.log(res)
    results.value = res.data.results
    console.log(results.value)
    searched.value = true
  } catch (error) {
    ElMessage.error('后端连接失败，请检查后端服务是否运行')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// ========== 清空搜索 ==========
const clearSearch = () => {
  searchEditorInstance?.setValue('')
  results.value = []
  searched.value = false
  searchEditorInstance?.focus()
  adjustEditorHeight()
}

// ========== 组件卸载前清理 ==========
onBeforeUnmount(() => {
  if (searchEditorInstance) {
    searchEditorInstance.dispose()
  }
})
</script>

<template>
  <el-container>
    <el-header class="search-header">
      <div class="header-font">ArkTS 代码 AR 回溯系统</div>
      <!--<div class="header-underline"></div>-->
    </el-header>

    <el-container>
      <el-aside class="left-container" :style="{width: searched || loading ? '42vw' : '55vw'}">
        <el-card class="left-card" shadow="hover">
          <div>
            <div class="search-label">
              代码编辑区
            </div>
            <div class="editor-wrapper">
              <div ref="searchEditorContainer"></div>
            </div>
            <el-row justify="center">
              <el-button
                  type="primary"
                  :loading="loading"
                  @click="handleSearch"
                  size="large"
              >
                开始回溯
              </el-button>
              <el-button
                  type="success"
                  :loading="loading"
                  @click="testBackendConnection"
                  size="large"
              >
                测试连接
              </el-button>
              <el-button @click="clearSearch" size="large" type="info">
                <el-icon><Refresh /></el-icon>
                清空
              </el-button>
            </el-row>
          </div>
        </el-card>
      </el-aside>

      <el-main class="right-container" :style="{width: searched || loading ? '45vw' : '35vw',}">
        <el-card class="right-card" shadow="never" v-if="!searched&& !loading">
          <div class="right-content">
            <p style="font-weight: bolder">· 在右侧代码编辑区输入需要追溯的代码</p>
            <p style="font-weight: bolder">· 点击开始回溯即可进行回溯并在右侧可以看到追溯进度</p>
            <p style="font-weight: bolder">· 支持Ctrl+Enter快捷追溯按键</p>
          </div>
        </el-card>

        <el-card class="right-card" shadow="hover" v-if="loading">
          <el-empty class="right-content" description="正在分析语义并检索代码..." :image-size="80">
            <el-progress :indeterminate="true" :stroke-width="4" />
          </el-empty>
        </el-card>

        <!-- 搜索结果 -->
        <div v-else-if="results.length > 0" style="width: 100%; max-width: 800px; animation: fadeIn 0.5s;">
          <div class="stats" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px;">
            <el-tag type="success">耗时：{{ latency }}ms</el-tag>
            <el-tag type="info">找到 {{ totalFound }} 个相关片段</el-tag>
          </div>

          <!-- 循环展示每个结果 -->
          <CodeViewer
              v-for="item in results"
              :key="item.snippet_id"
              v-bind="item"
              style="margin-bottom: 20px;"
          />
        </div>

        <!-- 空状态 -->
        <el-empty v-else-if="searched && results.length === 0" description="未找到相关代码" style="width: 100%; max-width: 800px;" />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>

.search-header {
  height: 20%;
}

.header-font {
  font-size: 40px;
  font-weight: bolder;
  margin-bottom: 20px;
}

.header-underline {
  width: 80%;
  height: 1px;
  background-color: var(--divider-color);
  margin: 0 auto;
}

.left-container {
  padding:20px;
  overflow:hidden;
  height:100%;
  transition:width 0.3s ease
}

.right-container {
  padding:20px;
  overflow:hidden;
  height: 100%;
  transition: width 0.3s ease;
}

.left-card {
  border-radius: 12px;
  background-color: transparent;
  border: none;
}

.right-card {
  border-radius: 12px;
  background-color: transparent;
  border: none;
}

.right-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 50vh;
}

.search-label {
  display: flex;
  margin-bottom: 12px;
  font-weight: bolder;
  font-size: 20px;
}

.editor-wrapper {
  border-radius: 8px;
  border: 2px solid var(--divider-color);
  overflow: hidden;
  transition: border-color 0.3s;
  text-align: left;
  min-height: 50vh;
  margin-bottom: 20px;
}

/* 淡入动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>


