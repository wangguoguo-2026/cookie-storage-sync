<template>
  <div class="app-container">
    <header class="header">
      <a-button type="text" class="back-btn" @click="currentView = 'list'" v-if="currentView === 'history'">
        <template #icon><ArrowLeftOutlined /></template>
        返回
      </a-button>
      <div class="header-left">
        <CoffeeOutlined class="logo" />
        <span class="title">{{ viewTitle }}</span>
      </div>
      <div class="help-tip" v-if="currentView === 'list'">
        <InfoCircleOutlined />
        <span>支持通配符 *.example.com</span>
      </div>
    </header>

    <div class="content">
      <DomainConfig v-if="currentView === 'list'" @view-history="handleViewHistory" />
      <ViewHistory v-if="currentView === 'history'" :domain="selectedDomain" @back="handleBack" />
    </div>

    <footer class="footer">
      <span class="version">v1.0.0</span>
      <a class="help-link"
         href="https://github.com/guoguo-0101/cookie-storage-sync/blob/main/README.md"
         target="_blank" rel="noopener noreferrer"
      >
        <FileTextOutlined class="help-icon" />
        <span>帮助文档</span>
      </a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DomainConfig from './views/DomainConfig.vue';
import ViewHistory from './views/ViewHistory.vue';
import {CoffeeOutlined, FileTextOutlined, InfoCircleOutlined, ArrowLeftOutlined,} from '@ant-design/icons-vue';
import type { SyncRecord } from '@/types';

const currentView = ref<'list' | 'records' | 'detail' | 'history'>('list');
const selectedRecord = ref<SyncRecord | null>(null);
const selectedDomain = ref<string>('');

const viewTitle = computed(() => {
  if (currentView.value === 'history') {
    return `同步历史 - ${selectedDomain.value}`;
  }
  if (currentView.value === 'detail' && selectedRecord.value) {
    return `同步详情 - ${selectedRecord.value.domain}`;
  }
  if (currentView.value === 'records') {
    return '同步记录';
  }
  return 'Cookie同步助手';
});

function handleViewHistory(domain: string) {
  selectedDomain.value = domain;
  currentView.value = 'history';
}

function handleBack() {
  currentView.value = 'list';
  selectedDomain.value = '';
}

</script>

<style lang="less" scoped>
@import './styles/variables.less';
@import './styles/mixins.less';
  .back-btn {
    padding: 4px 8px;
    color: @text-color-secondary;
    
    &:hover {
      color: @primary-color;
    }
  }
.app-container {
  .flex-column(0);
  height: 100vh;
  background: @bg-color;
}

.header {
  .flex-between();
  height: @header-height;
  padding: 0 @container-padding;
  border-bottom: @border-width-base @border-style-base @outline-variant;
  background: @bg-color-white;
  flex-shrink: 0;
  
  .header-left {
    .flex-center();
    gap: @spacing-sm;
    
    .logo {
      font-size: @font-size-md;
      color: @primary-color;
    }
    
    .title {
      .text-headline();
      font-size: @font-size-base;
    }
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: @container-padding;
  .scrollbar-custom();
}

.footer {
  .flex-between();
  height: @footer-height;
  padding: 0 @container-padding;
  border-top: @border-width-base @border-style-base @outline-variant;
  background: @bg-color-white;
  font-size: @font-size-xs;
  color: @text-color-muted;
  flex-shrink: 0;
  opacity: 0.8;
  transition: opacity @transition-base ease;
  
  &:hover {
    opacity: 1;
  }
  
  .version {
    color: @text-color-secondary;
  }
  
  .help-link {
    .flex-center();
    gap: @spacing-xs;
    color: @text-color-secondary;
    cursor: pointer;
    transition: color @transition-fast ease;
    text-decoration: none;
    
    .help-icon {
      font-size: 14px;
    }
    
    &:hover {
      color: @primary-color;
    }
  }
}

.help-tip {
  .flex-center();
  gap: @spacing-xs;
  padding: @spacing-xs @spacing-sm;
  background: @primary-bg;
  border: @border-width-base @border-style-base @primary-border;
  border-radius: @border-radius-base;
  font-size: @font-size-xs;
  color: @primary-color;
  transition: all @transition-fast ease;
  
  &:hover {
    background: @surface-container-low;
  }
}
</style>