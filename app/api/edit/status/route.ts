import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";

/**
 * 查询任务状态API - 获取任务的当前状态和结果
 * 在无状态架构中，此API仅返回一个确认响应，实际状态由前端管理
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
    
    // 返回一个简单状态，通知前端此任务正在处理中
    // 前端将通过process和save API完成实际处理和状态更新
    return NextResponse.json({
      success: true,
      data: {
        taskId,
        status: 'processing',
        message: '任务正在处理中，请等待处理和保存API完成'
      }
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
