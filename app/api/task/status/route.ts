import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from '../../../../lib/types';
import { getTaskById } from '../../../../lib/task-manager';

/**
 * 获取任务状态API
 * 
 * GET /api/task/status?taskId=xxx
 * 
 * 响应:
 * {
 *   "success": true,
 *   "data": {
 *     "taskId": "uuid",
 *     "status": "pending|processing|completed|failed",
 *     "resultImageUrl": "url", // 如果完成了
 *     "error": {...}  // 如果失败了
 *   }
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // 从查询字符串中获取taskId
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    
    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_TASK_ID",
          message: "缺少任务ID"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 获取任务状态
    const task = getTaskById(taskId);
    
    if (!task) {
      return NextResponse.json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "未找到指定任务"
        }
      } as ApiResponse, { status: 404 });
    }
    
    // 根据任务状态构造响应
    const response: ApiResponse = {
      success: true,
      data: {
        taskId: task.id,
        status: task.status,
        createdAt: task.createdAt,
        originalImageId: task.originalImageId,
        prompt: task.prompt
      }
    };
    
    // 如果任务已完成，添加结果信息
    if (task.status === 'completed') {
      response.data.resultImageId = task.resultImageId;
      response.data.resultImageUrl = task.resultImageUrl;
      response.data.textResponse = task.textResponse;
      response.data.completedAt = task.completedAt;
    }
    
    // 如果任务失败，添加错误信息
    if (task.status === 'failed' && task.error) {
      response.data.error = task.error;
      response.data.completedAt = task.completedAt;
    }
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`获取任务状态出错:`, error);
    return NextResponse.json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "服务器内部错误",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
