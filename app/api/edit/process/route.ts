import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/task-manager";
import { fetchImageFromFeishu, callGeminiApi, parseGeminiResponse } from "@/app/api/edit/utils";
import { ApiResponse } from "@/lib/types";

/**
 * 图片处理API - 处理图片编辑请求
 * 此API由start端点内部触发，不直接暴露给前端
 */
export async function POST(req: NextRequest) {
  console.log(`处理图片API - 请求开始处理`);
  
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
    
    // 更新任务状态为处理中
    await updateTask(taskId, { status: 'processing' });
    
    try {
      // 获取原始图片数据
      const imageId = task.internal?.originalImageId;
      
      if (!imageId) {
        throw new Error('任务中缺少原始图片ID');
      }
      
      // 从飞书获取图片
      const { imageData, mimeType, imageRecord } = await fetchImageFromFeishu(imageId);
      
      // 更新任务中的系统内部ID
      await updateTask(taskId, {
        internal: {
          ...task.internal,
          systemInternalId: imageRecord.id,
          fileToken: imageRecord.fileToken,
          imageData,
          mimeType,
          isUploadedImage: imageRecord.type === "uploaded"
        }
      });
      
      // 调用Gemini API处理图片
      const result = await callGeminiApi(task.prompt || "", imageData, mimeType);
      
      if (!result || result.isError) {
        await updateTask(taskId, {
          status: 'failed',
          error: {
            code: "GEMINI_API_ERROR",
            message: "调用Gemini API失败"
          }
        });
        
        return NextResponse.json({
          success: false,
          error: {
            code: "GEMINI_API_ERROR",
            message: "处理图片失败"
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 解析响应
      const { imageData: processedImageData, mimeType: responseType, textResponse } = parseGeminiResponse(result.response);
      
      if (!processedImageData) {
        await updateTask(taskId, {
          status: 'failed',
          error: {
            code: "NO_IMAGE_GENERATED",
            message: "未能生成图片"
          }
        });
        
        return NextResponse.json({
          success: false,
          error: {
            code: "NO_IMAGE_GENERATED",
            message: "生成图片失败"
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 保存处理结果到任务
      await updateTask(taskId, {
        internal: {
          ...task.internal,
          processedImageData,
          responseType
        }
      });
      
      // 触发保存结果的API
      fetch(`${req.nextUrl.origin}/api/edit/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
      }).catch(err => {
        console.error(`触发保存结果失败:`, err);
      });
      
      // 返回成功
      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status: 'processing',
          message: '图片处理完成，正在保存结果'
        }
      } as ApiResponse);
    } catch (error: any) {
      console.error(`处理图片失败:`, error);
      
      // 更新任务状态为失败
      await updateTask(taskId, {
        status: 'failed',
        error: {
          code: "PROCESSING_ERROR",
          message: "处理图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      });
      
      return NextResponse.json({
        success: false,
        error: {
          code: "PROCESSING_ERROR",
          message: "处理图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`处理图片API - 错误:`, error);
    
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
