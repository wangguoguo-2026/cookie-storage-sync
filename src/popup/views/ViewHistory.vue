<template>
  <div class="view-history">
    <div v-if="loading" class="loading-state">
      <a-spin size="large" />
      <p>加载历史记录中...</p>
    </div>

    <div v-else-if="records.length === 0" class="empty-state">
      <div class="empty-icon-wrapper">
        <InboxOutlined />
      </div>
      <div class="empty-text">暂无同步历史记录</div>
    </div>

    <div v-else class="history-list">
      <div v-for="record in records" :key="record.id" 
           class="history-item" 
           :class="{ 
             'item-success': record.status === 'success',
             'item-failed': record.status === 'failed'
           }"
           @click="toggleExpand(record.id)">
        <div class="item-main">
          <div class="item-info">
            <div class="item-time-row">
              <CheckCircleOutlined v-if="record.status === 'success'" class="status-icon icon-success" />
              <CloseCircleOutlined v-else class="status-icon icon-error" />
              <span class="sync-time">{{ formatSyncTime(record.syncedAt || record.startTime) }}</span>
            </div>
            <div class="item-badges">
              <span class="badge" v-if="record.cookieCount > 0">
                {{ record.cookieCount }}个 Cookie
              </span>
              <span class="badge" v-if="record.sessionStorageCount > 0">
                {{ record.sessionStorageCount }}个 Session
              </span>
            </div>
          </div>
          <RightOutlined class="expand-arrow" :class="{ expanded: isExpanded(record.id) }" />
        </div>

        <div v-if="record.error" class="error-pill">
          同步失败: {{ record.error }}
        </div>

        <transition name="expand">
          <div v-if="isExpanded(record.id)" class="cookie-details-container">
            <div v-if="loadingCookies.has(record.id)" class="cookie-loading">
              <a-spin size="small" />
              <span>加载 Cookie 数据...</span>
            </div>
            
            <div v-else-if="!cookieDataMap[record.id] || cookieDataMap[record.id].length === 0" class="cookie-empty">
              <InboxOutlined />
              <span>暂无 Cookie 数据</span>
            </div>
            
            <div v-else class="cookie-list">
              <div v-for="cookie in cookieDataMap[record.id]" :key="cookie.id" class="cookie-card">
                <div class="cookie-header">
                  <div class="cookie-name">
                    <span class="cookie-icon">🍪</span>
                    <span class="name-text">{{ cookie.key }}</span>
                  </div>
                  <div class="cookie-actions">
                    <span class="remaining-time" :class="{ expired: isExpired(cookie.expirationDate) }">
                      <ClockCircleOutlined />
                      {{ formatRemainingTime(cookie.expirationDate) }}
                    </span>
                    <a-button 
                      type="text" 
                      size="small" 
                      class="visibility-toggle"
                      @click.stop="toggleCookieVisibility(cookie.id)"
                    >
                      <EyeOutlined v-if="isCookieVisible(cookie.id)" />
                      <EyeInvisibleOutlined v-else />
                    </a-button>
                  </div>
                </div>

                <div v-if="isCookieVisible(cookie.id)" class="cookie-content">
                  <div class="cookie-value-row">
                    <span class="value-label">Value:</span>
                    <span class="value-text" :class="{ 'http-only': cookie.httpOnly }">
                      {{ cookie.httpOnly ? '**** (HttpOnly)' : cookie.value }}
                    </span>
                  </div>
                  
                  <div class="cookie-meta">
                    <div class="meta-item">
                      <span class="meta-label">Domain:</span>
                      <span class="meta-value">{{ cookie.domain || '-' }}</span>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Path:</span>
                      <span class="meta-value">{{ cookie.path || '/' }}</span>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Secure:</span>
                      <span class="meta-value" :class="{ 'status-true': cookie.secure }">
                        {{ cookie.secure ? '✓' : '✗' }}
                      </span>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">HttpOnly:</span>
                      <span class="meta-value" :class="{ 'status-true': cookie.httpOnly }">
                        {{ cookie.httpOnly ? '✓' : '✗' }}
                      </span>
                    </div>
                    <div class="meta-item" v-if="cookie.sameSite">
                      <span class="meta-label">SameSite:</span>
                      <span class="meta-value">{{ cookie.sameSite }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { 
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RightOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons-vue';
import { sendMessageToBackground } from '@/utils/message';
import type { SyncRecord, SyncDataItem } from '@/types';

const props = defineProps<{
  domain: string
}>();

defineEmits<{
  (e: 'back'): void
}>();

const records = ref<SyncRecord[]>([]);
const loading = ref(false);
const expandedRecords = ref<Set<string>>(new Set());
const cookieDataMap = ref<Record<string, SyncDataItem[]>>({});
const loadingCookies = ref<Set<string>>(new Set());
const visibleCookies = ref<Set<string>>(new Set());

async function loadHistory() {
  loading.value = true;
  try {
    const result = await sendMessageToBackground('GET_SYNC_RECORDS', { 
      limit: 50,
      sourceDomain: props.domain 
    });
    records.value = (result || []).filter((r: SyncRecord) => r.sourceDomain === props.domain);
  } catch (error) {
    message.error('加载历史记录失败');
  } finally {
    loading.value = false;
  }
}

async function loadCookieData(recordId: string) {
  if (cookieDataMap.value[recordId]) return;
  
  loadingCookies.value.add(recordId);
  try {
    const result = await sendMessageToBackground('GET_SYNC_DATA_ITEMS', {
      recordId,
      page: 1,
      pageSize: 100,
      type: 'cookie'
    });
    cookieDataMap.value[recordId] = (result as any)?.items || [];
  } catch (error) {
    message.error('加载 Cookie 数据失败');
  } finally {
    loadingCookies.value.delete(recordId);
  }
}

function toggleExpand(recordId: string) {
  const newSet = new Set(expandedRecords.value);
  if (newSet.has(recordId)) {
    newSet.delete(recordId);
  } else {
    newSet.add(recordId);
    loadCookieData(recordId);
  }
  expandedRecords.value = newSet;
}

function isExpanded(recordId: string): boolean {
  return expandedRecords.value.has(recordId);
}

function toggleCookieVisibility(cookieId: string) {
  const newSet = new Set(visibleCookies.value);
  if (newSet.has(cookieId)) {
    newSet.delete(cookieId);
  } else {
    newSet.add(cookieId);
  }
  visibleCookies.value = newSet;
}

function isCookieVisible(cookieId: string): boolean {
  return visibleCookies.value.has(cookieId);
}

function formatRemainingTime(expirationDate?: number): string {
  if (!expirationDate) return '会话 Cookie';
  
  const now = Date.now() / 1000;
  const remaining = expirationDate - now;
  
  if (remaining <= 0) return '已过期';
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

function isExpired(expirationDate?: number): boolean {
  if (!expirationDate) return false;
  return expirationDate < Date.now() / 1000;
}

function formatSyncTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

onMounted(() => {
  loadHistory();
});
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.view-history {
  .flex-column(@spacing-md);
  height: 100%;
}

.header-bar {
  display: flex;
  align-items: center;
  gap: @spacing-sm;
  padding-bottom: @spacing-md;
  border-bottom: @border-width-base @border-style-base @outline-variant;
  

  
  .domain-title {
    margin: 0;
    font-size: @font-size-base;
    font-weight: @font-weight-semibold;
    color: @text-color;
    flex: 1;
    .text-ellipsis();
  }
}

.loading-state {
  .flex-column(@spacing-md);
  align-items: center;
  justify-content: center;
  padding: @spacing-xxxl 0;
  color: @text-color-secondary;
}

.empty-state {
  .flex-column(@spacing-md);
  align-items: center;
  justify-content: center;
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
  }
}

.history-list {
  .flex-column(@card-gap);
  overflow: auto;
  padding: 4px 0;
}

.history-item {
  border-radius: @border-radius-lg;
  padding: @spacing-md @spacing-lg;
  cursor: pointer;
  transition: all @transition-fast ease;
  border: @border-width-base @border-style-base transparent;
  
  &.item-success {
    background: @success-bg;
    border-color: @success-border;
    
    &:hover {
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.1);
    }
  }
  
  &.item-failed {
    background: @error-bg;
    border-color: @error-border;
    
    &:hover {
      box-shadow: 0 2px 8px rgba(186, 26, 26, 0.1);
    }
  }
  
  .item-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    .item-info {
      flex: 1;
      min-width: 0;
      
      .item-time-row {
        display: flex;
        align-items: center;
        gap: @spacing-xs;
        margin-bottom: @spacing-xs;
        
        .status-icon {
          font-size: 16px;
          flex-shrink: 0;
          
          &.icon-success {
            color: @success-color;
          }
          
          &.icon-error {
            color: @error-color;
          }
        }
        
        .sync-time {
          font-size: @font-size-base;
          font-weight: @font-weight-semibold;
          color: @text-color;
        }
      }
      
      .item-badges {
        display: flex;
        flex-wrap: wrap;
        gap: @spacing-xs;
        
        .badge {
          display: inline-block;
          padding: 2px @spacing-sm;
          background: rgba(0, 0, 0, 0.06);
          border-radius: @border-radius-full;
          font-size: @font-size-xs;
          color: @text-color-secondary;
          font-weight: @font-weight-medium;
        }
      }
    }
    
    .expand-arrow {
      font-size: @font-size-base;
      color: @text-color-secondary;
      transition: transform @transition-base ease;
      flex-shrink: 0;
      margin-left: @spacing-sm;
      
      &.expanded {
        transform: rotate(90deg);
      }
    }
  }
  
  .error-pill {
    margin-top: @spacing-xs;
    padding: 2px @spacing-sm;
    background: rgba(0, 0, 0, 0.06);
    border-radius: @border-radius-full;
    font-size: @font-size-xs;
    color: @text-color-secondary;
    display: inline-block;
  }
  
  .cookie-details-container {
    margin-top: @spacing-sm;
    padding-top: @spacing-sm;
    border-top: @border-width-base @border-style-base @outline-variant;
    
    .cookie-loading,
    .cookie-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: @spacing-sm;
      padding: @spacing-xl 0;
      color: @text-color-muted;
      font-size: @font-size-xs;
      
      .anticon {
        font-size: 24px;
      }
    }
    
    .cookie-list {
      display: flex;
      flex-direction: column;
      gap: @spacing-sm;
    }
    
    .cookie-card {
      background: @surface-container-low;
      border-radius: @border-radius-base;
      padding: @spacing-sm;
      transition: all @transition-fast ease;
      
      &:hover {
        box-shadow: @shadow-sm;
      }
      
      .cookie-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: @spacing-xs;
        
        .cookie-name {
          display: flex;
          align-items: center;
          gap: @spacing-xs;
          flex: 1;
          min-width: 0;
          
          .cookie-icon {
            font-size: 14px;
            flex-shrink: 0;
          }
          
          .name-text {
            font-size: @font-size-sm;
            font-weight: @font-weight-semibold;
            color: @text-color;
            .text-ellipsis();
          }
        }
        
        .cookie-actions {
          display: flex;
          align-items: center;
          gap: @spacing-sm;
          
          .remaining-time {
            display: inline-flex;
            align-items: center;
            gap: @spacing-xs;
            padding: 2px @spacing-xs;
            background: @success-bg;
            color: @success-color;
            border-radius: @border-radius-sm;
            font-size: 11px;
            font-weight: @font-weight-medium;
            
            &.expired {
              background: @error-bg;
              color: @error-color;
            }
            
            .anticon {
              font-size: 10px;
            }
          }
          
          .visibility-toggle {
            padding: 4px;
            color: @text-color-secondary;
            
            &:hover {
              color: @primary-color;
            }
          }
        }
      }
      
      .cookie-content {
        .cookie-value-row {
          margin-bottom: @spacing-sm;
          padding: @spacing-xs;
          background: @bg-color-white;
          border-radius: @border-radius-sm;
          
          .value-label {
            display: block;
            font-size: 10px;
            color: @text-color-muted;
            font-weight: @font-weight-medium;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .value-text {
            display: block;
            font-size: @font-size-xs;
            font-family: @font-family-mono;
            color: @text-color;
            word-break: break-all;
            line-height: 1.4;
            
            &.http-only {
              color: @text-color-muted;
              font-style: italic;
            }
          }
        }
        
        .cookie-meta {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: @spacing-xs;
          
          .meta-item {
            display: flex;
            align-items: center;
            gap: @spacing-xs;
            padding: @spacing-xs;
            background: @bg-color-white;
            border-radius: @border-radius-sm;
            
            .meta-label {
              font-size: 10px;
              color: @text-color-muted;
              font-weight: @font-weight-medium;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              flex-shrink: 0;
            }
            
            .meta-value {
              font-size: @font-size-xs;
              color: @text-color;
              font-weight: @font-weight-medium;
              
              &.status-true {
                color: @success-color;
              }
            }
          }
        }
      }
    }
  }
}

// 展开/折叠动画
.expand-enter-active,
.expand-leave-active {
  transition: all @transition-base ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
