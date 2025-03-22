import { FeishuRecord } from './types';
import { getImageRecordById, saveImageRecord, uploadImageToFeishu, getAccessToken } from './feishu';
import { callGeminiApi, parseGeminiResponse } from '../lib/gemini-api';
import crypto from 'crypto';

// 编辑任务状态
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 编辑任务模型
export interface EditTask {
  id: string;                  // 任务ID
  status: TaskStatus;          // 任务状态
  originalImageId: string;     // 原始图片ID
  originalImageToken?: string; // 原始图片token
  prompt: string;              // 编辑提示词
  resultImageId?: string;      // 结果图片ID
  resultImageUrl?: string;     // 结果图片URL
  textResponse?: string;       // 文本响应
  error?: {                    // 错误信息
    code: string;
    message: string;
    details?: string;
  };
  createdAt: number;           // 创建时间
  completedAt?: number;        // 完成时间
}

// 内存中的任务存储（生产环境应使用持久化存储如数据库）
const taskStore: Map<string, EditTask> = new Map();

// 任务过期时间（24小时，单位：毫秒）
const TASK_EXPIRY = 24 * 60 * 60 * 1000;

// 清理过期任务
function cleanupExpiredTasks() {
  const now = Date.now();
  for (const [taskId, task] of taskStore.entries()) {
    if (now - task.createdAt > TASK_EXPIRY) {
      taskStore.delete(taskId);
    }
  }
}

// 定期清理过期任务（每小时运行一次）
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredTasks, 60 * 60 * 1000);
}

// 创建新的编辑任务
export function createEditTask(originalImageId: string, prompt: string, originalImageToken?: string): EditTask {
  const taskId = crypto.randomUUID();
  const task: EditTask = {
    id: taskId,
    status: 'pending',
    originalImageId,
    originalImageToken,
    prompt,
    createdAt: Date.now()
  };
  
  taskStore.set(taskId, task);
  return task;
}

// 获取任务信息
export function getTaskById(taskId: string): EditTask | null {
  return taskStore.get(taskId) || null;
}

// 更新任务状态
export function updateTaskStatus(taskId: string, status: TaskStatus, data?: Partial<EditTask>): boolean {
  const task = taskStore.get(taskId);
  if (!task) return false;
  
  task.status = status;
  
  if (status === 'completed' || status === 'failed') {
    task.completedAt = Date.now();
  }
  
  if (data) {
    Object.assign(task, data);
  }
  
  taskStore.set(taskId, task);
  return true;
}

// 处理编辑任务
export async function processEditTask(taskId: string): Promise<void> {
  const task = taskStore.get(taskId);
  if (!task) {
    console.error(`processEditTask: 找不到任务 ${taskId}`);
    return;
  }
  
  try {
    // 更新任务状态为处理中
    updateTaskStatus(taskId, 'processing');
    console.log(`processEditTask: 开始处理任务 ${taskId}, 图片ID: ${task.originalImageId}, 提示词: ${task.prompt}`);
    
    // 从飞书获取原图片数据
    const { imageData, mimeType, imageRecord } = await fetchImageFromFeishu(
      task.originalImageId, 
      task.originalImageToken
    );
    
    // 检查是否成功获取图片数据
    if (!imageData || !mimeType) {
      throw new Error(`无法获取原始图片数据`);
    }
    
    // 调用Gemini API编辑图片
    console.log(`processEditTask: 调用Gemini API编辑图片`);
    const result = await callGeminiApi(task.prompt, imageData, mimeType);
    
    if (!result) {
      throw new Error(`Gemini API调用失败，可能超出速率限制`);
    }
    
    // 解析响应
    const { imageData: generatedImageData, mimeType: responseMimeType, textResponse } = 
      parseGeminiResponse(result.response);
    
    if (!generatedImageData) {
      throw new Error(`未能生成图片`);
    }
    
    // 保存生成的图片到飞书
    console.log(`processEditTask: 保存生成的图片到飞书`);
    const savedImageResult = await saveEditedImage(
      generatedImageData,
      task.prompt,
      responseMimeType,
      imageRecord
    );
    
    // 任务成功完成
    updateTaskStatus(taskId, 'completed', {
      resultImageId: savedImageResult.id,
      resultImageUrl: savedImageResult.url,
      textResponse
    });
    
    console.log(`processEditTask: 任务 ${taskId} 成功完成`);
  } catch (error) {
    console.error(`processEditTask: 处理任务 ${taskId} 出错:`, error);
    
    // 更新任务状态为失败
    updateTaskStatus(taskId, 'failed', {
      error: {
        code: error.code || 'PROCESSING_ERROR',
        message: error.message || '处理任务时发生错误',
        details: error.stack
      }
    });
  }
}

// 从飞书获取图片数据和记录
async function fetchImageFromFeishu(imageId: string, fileToken?: string) {
  try {
    console.log(`从飞书获取图片数据, ID: ${imageId}`);
    
    // 获取图片记录
    const imageRecord = await getImageRecordById(imageId, false);
    
    if (!imageRecord || !imageRecord.fileToken) {
      throw new Error(`未找到图片记录或fileToken为空`);
    }
    
    // 获取图片数据
    // 注意：这部分代码需要根据现有的图片数据获取逻辑实现
    // 这里假设已经存在获取图片数据的方法
    const { imageData, mimeType } = await fetchImageDataByToken(imageRecord.fileToken);
    
    return { imageData, mimeType, imageRecord };
  } catch (error) {
    console.error(`获取图片数据失败:`, error);
    throw new Error(`获取图片数据失败: ${error.message}`);
  }
}

// 保存编辑后的图片到飞书
async function saveEditedImage(imageData: string, prompt: string, mimeType: string, originalRecord: FeishuRecord) {
  try {
    // 生成随机ID
    const id = crypto.randomUUID();
    
    // 从原图记录中获取系统内部ID
    const parentId = originalRecord.id;
    const rootParentId = originalRecord.rootParentId || parentId;
    const isUploadedImage = originalRecord.type === 'uploaded';
    
    // 上传图片到飞书
    console.log(`上传编辑后的图片到飞书`);
    const fileInfo = await uploadImageToFeishu(
      imageData,
      `${id}.png`, // 假设输出都是PNG格式
      mimeType
    );
    
    if (fileInfo.error) {
      throw new Error(`上传图片到飞书失败: ${fileInfo.errorMessage}`);
    }
    
    // 保存记录到飞书多维表格
    console.log(`保存编辑后图片记录到飞书`);
    const recordInfo = await saveImageRecord({
      id,
      url: fileInfo.url,
      fileToken: fileInfo.fileToken,
      prompt,
      timestamp: Date.now(),
      parentId, // 使用系统内部ID，而不是fileToken
      rootParentId,
      type: isUploadedImage ? 'uploaded' : 'generated'
    });
    
    if (recordInfo.error) {
      throw new Error(`保存记录到飞书失败: ${recordInfo.errorMessage}`);
    }
    
    return {
      id,
      url: fileInfo.url,
      fileToken: fileInfo.fileToken
    };
  } catch (error) {
    console.error(`保存编辑后的图片失败:`, error);
    throw error;
  }
}

// 从飞书获取图片数据
// 注意：这部分代码需要根据现有的图片数据获取逻辑实现
async function fetchImageDataByToken(fileToken: string): Promise<{imageData: string, mimeType: string}> {
  try {
    // 获取访问令牌，假设已存在该函数
    const token = await getAccessToken();
    
    // 使用飞书API获取图片数据
    const feishuUrl = `https://open.feishu.cn/open-apis/im/v1/images/${fileToken}`;
    const response = await fetch(feishuUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`从飞书获取图片数据失败: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageData = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    return { imageData, mimeType };
  } catch (error) {
    console.error('获取图片数据失败:', error);
    throw error;
  }
}
