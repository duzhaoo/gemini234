import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";

/**
 * 获取处理结果API - 在无状态架构中，该API直接被前端调用以获取处理结果
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
    
    // 在无状态架构中，我们没有实际存储结果
    // 前端应该直接使用process API的响应，并在save API中使用它
    // 这个API仅用于兼容旧的轮询机制
    
    // 返回一个404状态，表示结果尚未准备好
    // 这将导致前端继续轮询状态API
    return NextResponse.json({
      success: false,
      error: {
        code: "RESULT_NOT_READY",
        message: "处理结果尚未准备好，请稍后再试"
      }
    } as ApiResponse, { status: 404 });
    
  } catch (error: any) {
    console.error(`获取处理结果API - 错误:`, error);
    
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
