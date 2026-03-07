<script setup lang="ts">
import SearchView from '@/pages/SearchView.vue'
import ConsistencyView from '@/pages/ConsistencyView.vue'
import { ref } from 'vue'

const activeModule = ref<'consistency' | 'search'>('consistency')
</script>

<template>
  <div class="app-root">
    <el-container>
      <el-header class="top-nav">
        <el-segmented
          v-model="activeModule"
          :options="[
            { label: '需求审阅', value: 'consistency' },
            { label: '代码回溯', value: 'search' }
          ]"
        />
      </el-header>
      <el-main class="main-area">
        <ConsistencyView v-if="activeModule === 'consistency'" />
        <SearchView v-else />
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  min-height: 100vh;
}

.top-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 16px;
}

.main-area {
  width: 100%;
  padding: 10px 16px 20px;
}
</style>
