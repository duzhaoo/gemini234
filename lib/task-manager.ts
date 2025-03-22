import { randomUUID } from 'crypto';

// 任务状态类型
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 任务数据接口
export interface TaskData {
  id: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
  prompt?: string;
  result?: {
    id?: string;
    url?: string;
    textResponse?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  // 任务内部数据，不会返回给前端
  internal?: {
    originalImageId?: string;
    systemInternalId?: string;
    fileToken?: string;
    imageData?: string;
    mimeType?: string;
    processedImageData?: string;
    responseType?: string;
    isUploadedImage?: boolean;
  };
}

// 任务存储
class TaskStore {
  private tasks: Map<string, TaskData> = new Map();
  private expirationTimes: Map<string, number> = new Map();
  private readonly DEFAULT_EXPIRATION_MS = 30 * 60 * 1000; // 30分钟

  constructor() {
    // 创建自动清理过期任务的定时器
    // 但只在非Vercel环境中启动，因为Vercel函数可能会在执行后终止
    if (typeof window === 'undefined' && process.env.VERCEL !== '1') {
      setInterval(() => this.cleanExpiredTasks(), 60 * 1000); // 每分钟清理一次
    }
  }

  /**
   * 创建新任务
   */
  createTask(initialData: Partial<TaskData> = {}): TaskData {
    const now = Date.now();
    const task: TaskData = {
      id: randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...initialData
    };
    
    this.tasks.set(task.id, task);
    this.expirationTimes.set(task.id, now + this.DEFAULT_EXPIRATION_MS);
    
    console.log(`创建新任务: ${task.id}, 状态: ${task.status}`);
    return task;
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string): TaskData | null {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        console.log(`获取任务失败: ${taskId} - 任务不存在`);
        return null;
      }
      
      // 更新过期时间
      this.expirationTimes.set(taskId, Date.now() + this.DEFAULT_EXPIRATION_MS);
      return { ...task }; // 返回副本以避免直接修改
    } catch (err) {
      console.error(`获取任务失败: ${taskId}`, err);
      return null;
    }
  }

  /**
   * 更新任务信息
   */
  updateTask(taskId: string, updates: Partial<TaskData>): TaskData | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.log(`更新任务失败: ${taskId} - 任务不存在`);
      return null;
    }
    
    const updatedTask: TaskData = {
      ...task,
      ...updates,
      updatedAt: Date.now()
    };
    
    // 如果internal字段在更新中，确保正确合并
    if (updates.internal && task.internal) {
      updatedTask.internal = {
        ...task.internal,
        ...updates.internal
      };
    }
    
    this.tasks.set(taskId, updatedTask);
    
    // 更新过期时间
    this.expirationTimes.set(taskId, Date.now() + this.DEFAULT_EXPIRATION_MS);
    
    console.log(`更新任务: ${taskId}, 新状态: ${updatedTask.status}`);
    return { ...updatedTask }; // 返回副本以避免直接修改
  }

  /**
   * 清理过期任务
   */
  private cleanExpiredTasks(): void {
    const now = Date.now();
    let count = 0;
    
    for (const [taskId, expirationTime] of this.expirationTimes.entries()) {
      if (now > expirationTime) {
        this.tasks.delete(taskId);
        this.expirationTimes.delete(taskId);
        count++;
      }
    }
    
    if (count > 0) {
      console.log(`清理了 ${count} 个过期任务`);
    }
  }

  /**
   * 获取所有任务（仅用于调试）
   */
  getAllTasks(): TaskData[] {
    return Array.from(this.tasks.values()).map(task => ({ ...task }));
  }
}

// 创建全局实例
const taskStore = new TaskStore();

// 导出函数
export async function createTask(initialData: Partial<TaskData> = {}): Promise<TaskData> {
  return taskStore.createTask(initialData);
}

export async function getTask(taskId: string): Promise<TaskData | null> {
  return taskStore.getTask(taskId);
}

export async function updateTask(taskId: string, updates: Partial<TaskData>): Promise<TaskData | null> {
  return taskStore.updateTask(taskId, updates);
}

// 获取任务的公开数据(排除内部字段)
export function getPublicTaskData(task: TaskData): Omit<TaskData, 'internal'> {
  const { internal, ...publicData } = task;
  return publicData;
}
