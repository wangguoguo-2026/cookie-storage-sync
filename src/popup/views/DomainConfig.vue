<template>
  <div class="domain-config">
    <a-button type="primary" block class="add-btn" @click="showAddModal = true">
      <template #icon><PlusOutlined /></template>
      添加新域名
    </a-button>

    <div class="domain-list" v-if="domains.length > 0">
      <div v-for="domain in domains" :key="domain.id" class="domain-item group">
        <div class="domain-info">
          <div class="icon-wrapper">
            <GlobalOutlined  :style="{fontSize: '20px', }" />
          </div>
          <div class="domain-details">
            <span class="domain-name">{{ domain.domain }}</span>
            <div class="status-row">
              <span class="status-dot" :class="getStatusClass(domain)"></span>
              <span class="status-text">上次同步：{{ domain.lastSyncAt ? formatDate(domain.lastSyncAt) : '从未' }}</span>
            </div>
          </div>
        </div>

        <div class="domain-actions">
          <a-tooltip title="查看历史">
            <div class="action-btn history-btn" @click="viewHistory(domain.domain)">
              <HistoryOutlined />
            </div>
          </a-tooltip>
          <a-tooltip :title="syncingDomainId === domain.id ? '同步中...' : '执行同步'">
              <div 
                class="action-btn"
                :class="{ 'disabled': syncingDomainId !== null }"
                @click="syncingDomainId === null && syncDomain(domain.id)"
              >
                <SyncOutlined :style="{fontSize: '16px', }"/>
              </div>
          </a-tooltip>
          <a-tooltip title="编辑">
            <div class="action-btn" @click="editDomain(domain)">
              <EditOutlined />
            </div>
          </a-tooltip>
          <a-popconfirm title="确定要删除此域名配置吗？" @confirm="deleteDomain(domain.id)">
            <a-tooltip title="删除">
              <div class="action-btn delete-btn">
                <DeleteOutlined />
              </div>
            </a-tooltip>
          </a-popconfirm>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon-wrapper">
        <InboxOutlined />
      </div>
      <div class="empty-text">还没有配置同步域名</div>
      <a-button type="primary" @click="showAddModal = true">
        <template #icon><PlusOutlined /></template>
        添加第一个域名
      </a-button>
    </div>

    <a-modal
      v-model:open="showAddModal"
      :title="editingDomain ? '编辑域名' : '添加新域名'"
      @ok="handleSave"
      @cancel="resetForm"
      :okText="editingDomain ? '保存' : '确定添加'"
      cancelText="取消"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="域名" required>
          <a-input v-model:value="form.domain" placeholder="例如: *.example.com" @change="validateDomainInput" />
          <div v-if="domainError" class="error-text">
            <ExclamationCircleOutlined />
            {{ domainError }}
          </div>
        </a-form-item>

        <a-form-item label="同步选项">
          <div class="checkbox-group">
            <a-checkbox v-model:checked="form.syncCookie">Cookie</a-checkbox>
            <a-checkbox v-model:checked="form.syncLocalStorage" :disabled="true" class="disabled-checkbox">
              localStorage
            </a-checkbox>
            <a-checkbox v-model:checked="form.syncSessionStorage" :disabled="true" class="disabled-checkbox">
              sessionStorage
            </a-checkbox>
          </div>
        </a-form-item>

        <a-form-item label="自动同步">
          <a-radio-group v-model:value="form.autoSync">
            <div class="radio-grid">
              <a-radio value="manual">手动触发</a-radio>
              <a-radio value="5min">每 5 分钟</a-radio>
              <a-radio value="30min">每 30 分钟</a-radio>
            </div>
          </a-radio-group>
        </a-form-item>

        <div class="modal-hint">
          <InfoCircleOutlined class="hint-icon" />
          <span>提示：支持通配符 *.example.com，设置后将应用于该域下的所有子级。</span>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { 
  PlusOutlined, 
  GlobalOutlined, 
  SyncOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  InboxOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  HistoryOutlined
} from '@ant-design/icons-vue';
import { sendMessageToBackground } from '@/utils/message';
import { validateDomain, formatDomain } from '@/utils/domain-validator';
import type { DomainConfig } from '@/types';

const domains = ref<DomainConfig[]>([]);
const showAddModal = ref(false);
const editingDomain = ref<DomainConfig | null>(null);
const domainError = ref<string>('');
const syncingDomainId = ref<string | null>(null);

const emit = defineEmits<{
  (e: 'view-history', domain: string): void
}>();

function viewHistory(domain: string) {
  emit('view-history', domain);
}

const form = ref({
  domain: '',
  syncCookie: true,
  syncLocalStorage: false,
  syncSessionStorage: false,
  autoSync: 'manual' as DomainConfig['autoSync']
});

function getStatusClass(domain: DomainConfig): string {
  if (!domain.lastSyncAt) return 'status-idle';
  // 这里可以根据实际情况添加错误状态判断
  return 'status-connected';
}

async function loadDomains() {
  try {
    const result = await sendMessageToBackground('GET_DOMAIN_CONFIGS', undefined);
    domains.value = result || [];
  } catch (error) {
    message.error('加载域名列表失败');
  }
}

function validateDomainInput() {
  const result = validateDomain(form.value.domain);
  domainError.value = result.message || '';
}

async function handleSave() {
  const result = validateDomain(form.value.domain);
  if (!result.valid) {
    domainError.value = result.message || '';
    return;
  }

  const formattedDomain = formatDomain(form.value.domain);
  const exists = domains.value.some(d => d.domain === formattedDomain);
  
  if (exists && !editingDomain.value) {
    domainError.value = '该域名已存在';
    return;
  }

  try {
    const config: DomainConfig = {
      id: editingDomain.value?.id || `domain_${Date.now()}`,
      domain: formattedDomain,
      syncCookie: form.value.syncCookie,
      syncLocalStorage: form.value.syncLocalStorage,
      syncSessionStorage: form.value.syncSessionStorage,
      autoSync: form.value.autoSync,
      createdAt: editingDomain.value?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastSyncAt: editingDomain.value?.lastSyncAt
    };

    await sendMessageToBackground('SAVE_DOMAIN_CONFIG', config);
    message.success(editingDomain.value ? '域名更新成功' : '域名添加成功');
    showAddModal.value = false;
    resetForm();
    await loadDomains();
  } catch (error) {
    message.error('保存失败，请重试');
  }
}

function editDomain(domain: DomainConfig) {
  editingDomain.value = domain;
  form.value = {
    domain: domain.domain,
    syncCookie: domain.syncCookie,
    syncLocalStorage: domain.syncLocalStorage,
    syncSessionStorage: domain.syncSessionStorage,
    autoSync: domain.autoSync
  };
  showAddModal.value = true;
}

async function deleteDomain(id: string) {
  try {
    await sendMessageToBackground('DELETE_DOMAIN_CONFIG', id);
    message.success('域名删除成功');
    await loadDomains();
  } catch (error) {
    message.error('删除失败，请重试');
  }
}

async function syncDomain(domainId: string) {
  if (syncingDomainId.value) {
    message.warning('同步任务正在进行中，请稍候...');
    return;
  }

  syncingDomainId.value = domainId;
  message.info('同步任务已开始，请稍候...');

  try {
    const result = await sendMessageToBackground('SYNC_DOMAIN', { domainId });

    if (result?.success) {
      message.success('同步完成！');
      await loadDomains();
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    message.error(`同步失败: ${errorMessage}`);
  } finally {
    syncingDomainId.value = null;
  }
}

function resetForm() {
  editingDomain.value = null;
  form.value = {
    domain: '',
    syncCookie: true,
    syncLocalStorage: false,
    syncSessionStorage: false,
    autoSync: 'manual'
  };
  domainError.value = '';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg.type === 'DOMAIN_CONFIGS_UPDATED') {
    domains.value = msg.data || [];
  } else if (msg.type === 'SYNC_COMPLETE') {
    loadDomains();
  } else if (msg.type === 'SYNC_ERROR') {
    syncingDomainId.value = null;
  }
  return true;
});

onMounted(() => {
  loadDomains();
});
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.domain-config {
  .flex-column(@spacing-lg);
  height: 100%;
}

// 添加按钮样式
.add-btn {
  position: sticky;
  z-index: 9;
  height: 44px;
  font-weight: @font-weight-medium;
  border-radius: @border-radius-base;
  box-shadow: @shadow-sm;
  transition: all @transition-base ease;
  
  &:hover {
    box-shadow: @shadow-base;
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
}

// 域名列表样式
.domain-list {
  .flex-column(@card-gap);
  height: 100%;
  overflow: auto;
  padding: 4px 0;
}

// 域名卡片样式
.domain-item {
  .card-base();
  .card-hover();
  padding: @spacing-md;
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  .domain-info {
    display: flex;
    align-items: center;
    gap: @spacing-md;
    flex: 1;
    min-width: 0;
    
    .icon-wrapper {
      .icon-container(40px, @surface-container, @primary-color);
    }
    
    .domain-details {
      flex: 1;
      min-width: 0;
      
      .domain-name {
        font-weight: @font-weight-semibold;
        color: @text-color;
        font-size: @font-size-sm;
        .text-ellipsis();
        display: block;
      }
      
      .status-row {
        display: flex;
        align-items: center;
        gap: @spacing-xs;
        margin-top: @spacing-xs;
        
        .status-dot {
          .status-dot();
          
          &.status-connected {
            background: @status-connected;
          }
          
          &.status-idle {
            background: @status-idle;
          }
          
          &.status-error {
            background: @status-error;
          }
        }
        
        .status-text {
          .text-muted();
          font-size: @font-size-xs;
        }
      }
    }
  }
  
  .domain-actions {
    display: flex;
    gap: @spacing-xs;
    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: @border-radius-full;
      transition: all @transition-fast ease;
      color: @text-color-secondary;
      cursor: pointer;
      
      &:hover {
        background: @surface-container;
        color: @primary-color;
      }
      
      &:active {
        transform: scale(0.95);
      }
      
      &.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }
      
      &.delete-btn {
        &:hover {
          background: @error-container;
          color: @error-color;
        }
      }
      
      &.history-btn {
        &:hover {
          background: @primary-bg;
          color: @primary-color;
        }
      }
      
      // 确保图标可见
      :deep(.anticon) {
        font-size: 16px;
        display: inline-block;
      }
    }
  }
}

// 空状态样式
.empty-state {
  .flex-column(@spacing-md);
  align-items: center;
  padding: @spacing-xxxl 0;
  opacity: 0.6;
  
  .empty-icon-wrapper {
    width: 64px;
    height: 64px;
    border-radius: @border-radius-full;
    background: @surface-container;
    .flex-center();
    font-size: 32px;
    color: @text-color-muted;
    margin-bottom: @spacing-md;
  }
  
  .empty-text {
    .text-muted();
    font-size: @font-size-base;
    margin-bottom: @spacing-sm;
  }
}

// 错误提示样式
.error-text {
  .flex-center();
  gap: @spacing-xs;
  color: @error-color;
  font-size: @font-size-xs;
  margin-top: @spacing-sm;
}

// 弹窗样式优化
:deep(.ant-modal) {
  .ant-modal-content {
    border-radius: @border-radius-lg;
    overflow: hidden;
  }
  
  .ant-modal-header {
    border-bottom: @border-width-base @border-style-base @outline-variant;
    padding: @spacing-xl @spacing-xl @spacing-md;
    
    .ant-modal-title {
      font-size: @font-size-lg;
      font-weight: @font-weight-semibold;
      color: @text-color;
    }
  }
  
  .ant-modal-body {
    padding: @spacing-lg @spacing-xl;
  }
  
  .ant-modal-footer {
    border-top: @border-width-base @border-style-base @outline-variant;
    padding: @spacing-md @spacing-xl;
  }
}

// 表单样式
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
}

.disabled-checkbox {
  opacity: 0.5;
  cursor: not-allowed;
}

.radio-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: @spacing-sm @spacing-lg;
}

.modal-hint {
  display: flex;
  align-items: flex-start;
  gap: @spacing-xs;
  padding: @spacing-sm;
  background: @primary-bg;
  border-radius: @border-radius-base;
  font-size: @font-size-xs;
  color: @text-color-secondary;
  margin-top: @spacing-md;
  
  .hint-icon {
    color: @primary-color;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 2px;
  }
}
</style>
