import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/task-manager";
import { ApiResponse } from "@/lib/types";
import { saveImage } from "@/lib/server-utils";

/**
 * 保存处理结果API - 将处理后的图片保存到飞书
 * 此API由process端点内部触发，不直接暴露给前端
 */
export async function POST(req: NextRequest) {
  console.log(`保存结果API - 请求开始处理`);
  
  try {
    // 解析请求数据
    const { taskId } = await req.json();
    
    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_TASK_ID",
          message: "缺少任务ID"
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
    
    // 检查任务是否包含处理结果
    if (!task.internal?.processedImageData) {
      return NextResponse.json({
        success: false,
        error: {
          code: "NO_PROCESSED_IMAGE",
          message: "任务中没有处理过的图片数据"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 保存到飞书
      const metadata = await saveImage(
        task.internal.processedImageData,
        task.prompt || "编辑图片",
        task.internal.responseType || "image/png",
        {
          isUploadedImage: task.internal.isUploadedImage || false,
          rootParentId: task.internal.systemInternalId,
          isVercelEnv: true
        },
        task.internal.systemInternalId // 确保使用系统内部ID作为parentId
      );
      
      // 更新任务状态为已完成
      await updateTask(taskId, {
        status: 'completed',
        result: {
          id: metadata.id,
          url: metadata.url,
          textResponse: ""
        }
      });
      
      // 返回成功响应
      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status: 'completed',
          id: metadata.id,
          url: metadata.url
        }
      } as ApiResponse);
    } catch (error: any) {
      console.error(`保存图片失败:`, error);
      
      // 更新任务状态为失败
      await updateTask(taskId, {
        status: 'failed',
        error: {
          code: "SAVE_ERROR",
          message: "保存图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      });
      
      return NextResponse.json({
        success: false,
        error: {
          code: "SAVE_ERROR",
          message: "保存图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`保存结果API - 错误:`, error);
    
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
