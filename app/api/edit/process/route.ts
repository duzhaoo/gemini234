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
    // 解析请求数据 - 接收完整任务数据而非仅任务ID
    const { imageId, prompt, taskId } = await req.json();
    
    if (!imageId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_ID",
          message: "缺少图片ID"
        }
      } as ApiResponse, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PROMPT",
          message: "缺少提示词"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 构建任务状态
      const taskStatus = {
        id: taskId,
        status: 'processing' as const,
        message: '正在处理图片',
        progress: 30
      };
      
      console.log(`开始处理图片, ID: ${imageId}, 任务ID: ${taskId}`);
      
      // 从飞书获取图片
      const { imageData, mimeType, imageRecord } = await fetchImageFromFeishu(imageId);
      
      // 更新进度
      taskStatus.progress = 50;
      taskStatus.message = '图片获取成功，开始处理';
      
      // 调用Gemini API处理图片
      const result = await callGeminiApi(prompt, imageData, mimeType);
      
      if (!result || result.isError) {
        console.error("调用Gemini API失败:", result?.error || "未知错误");
        return NextResponse.json({
          success: false,
          taskId,
          status: 'failed',
          error: {
            code: "GEMINI_API_ERROR",
            message: "调用Gemini API失败",
            details: result?.error?.message || "未知错误"
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 解析响应
      try {
        const parsedResponse = parseGeminiResponse(result);

        // 如果图片处理成功，返回结果
        if (parsedResponse.image && parsedResponse.image.data) {
          console.log(`成功处理图片`);
          return NextResponse.json({
            success: true,
            data: {
              imageData: parsedResponse.image.data,
              mimeType: parsedResponse.image.mimeType,
              text: parsedResponse.text || "图片处理完成",
              taskId: taskId
            }
          } as ApiResponse);
        } else {
          throw new Error("未找到有效的图片数据");
        }
      } catch (parseError) {
        console.error(`解析API响应失败:`, parseError);
        return NextResponse.json({
          success: false,
          error: {
            code: "PARSE_ERROR",
            message: `解析API响应时出错: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          }
        } as ApiResponse, { status: 500 });
      }
      
    } catch (error: any) {
      console.error(`处理图片失败:`, error);
      
      return NextResponse.json({
        success: false,
        taskId,
        status: 'failed',
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
