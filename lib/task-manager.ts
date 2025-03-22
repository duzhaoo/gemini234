import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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

// 确定存储目录
const TASK_DIR = process.env.VERCEL === '1' 
  ? '/tmp/tasks' // Vercel环境使用/tmp
  : join(process.cwd(), 'tasks');

// 初始化存储目录
async function ensureTaskDir() {
  if (!existsSync(TASK_DIR)) {
    await mkdir(TASK_DIR, { recursive: true });
    console.log(`创建任务存储目录: ${TASK_DIR}`);
  }
}

// 创建新任务
export async function createTask(initialData: Partial<TaskData> = {}): Promise<TaskData> {
  await ensureTaskDir();
  
  const now = Date.now();
  const task: TaskData = {
    id: randomUUID(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...initialData
  };
  
  const taskPath = join(TASK_DIR, `${task.id}.json`);
  await writeFile(taskPath, JSON.stringify(task, null, 2));
  
  console.log(`创建新任务: ${task.id}, 状态: ${task.status}`);
  return task;
}

// 获取任务
export async function getTask(taskId: string): Promise<TaskData | null> {
  try {
    const taskPath = join(TASK_DIR, `${taskId}.json`);
    const taskData = await readFile(taskPath, 'utf-8');
    return JSON.parse(taskData) as TaskData;
  } catch (err) {
    console.error(`获取任务失败: ${taskId}`, err);
    return null;
  }
}

// 更新任务
export async function updateTask(taskId: string, updates: Partial<TaskData>): Promise<TaskData | null> {
  const task = await getTask(taskId);
  if (!task) {
    return null;
  }
  
  const updatedTask: TaskData = {
    ...task,
    ...updates,
    updatedAt: Date.now()
  };
  
  const taskPath = join(TASK_DIR, `${taskId}.json`);
  await writeFile(taskPath, JSON.stringify(updatedTask, null, 2));
  
  console.log(`更新任务: ${taskId}, 新状态: ${updatedTask.status}`);
  return updatedTask;
}

// 清理过期任务 (可选)
export async function cleanExpiredTasks(maxAgeHours = 24): Promise<void> {
  // 实现定期清理，删除过期任务文件
  // 此处省略具体实现
}

// 获取任务的公开数据(排除内部字段)
export function getPublicTaskData(task: TaskData): Omit<TaskData, 'internal'> {
  const { internal, ...publicData } = task;
  return publicData;
}
