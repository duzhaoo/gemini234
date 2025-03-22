import { NextRequest, NextResponse } from "next/server";
import { getTask, getPublicTaskData } from "@/lib/task-manager";
import { ApiResponse } from "@/lib/types";

/**
 * 查询任务状态API - 获取任务的当前状态和结果
 * 前端通过此API轮询获取处理进度和最终结果
 */
export async function GET(req: NextRequest) {
  try {
    // 从URL参数中获取任务ID
    const searchParams = req.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    
    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_TASK_ID",
          message: "缺少任务ID参数"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 获取任务信息
    const task = await getTask(taskId);
    
    if (!task) {
      return NextResponse.json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "找不到指定任务"
        }
      } as ApiResponse, { status: 404 });
    }
    
    // 获取任务的公开数据(排除内部字段)
    const publicData = getPublicTaskData(task);
    
    // 构建响应数据
    const responseData: any = {
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
    
    // 根据任务状态返回不同信息
    if (task.status === 'completed' && task.result) {
      responseData.result = task.result;
    } else if (task.status === 'failed' && task.error) {
      responseData.error = task.error;
    }
    
    // 返回任务状态
    return NextResponse.json({
      success: true,
      data: responseData
    } as ApiResponse);
  } catch (error: any) {
    console.error(`查询任务状态API - 错误:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: "REQUEST_ERROR",
        message: "处理请求时发生错误",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
