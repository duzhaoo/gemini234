import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/task-manager";
import { ApiResponse } from "@/lib/types";
import { randomUUID } from "crypto";
import { extractImageIdFromUrl } from "@/app/api/edit/utils";

/**
 * 开始编辑API - 创建任务并返回任务ID
 */
export async function POST(req: NextRequest) {
  console.log(`开始编辑API - 请求开始处理`);
  
  try {
    // 解析请求数据
    const { imageUrl, prompt } = await req.json();
    
    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_URL",
          message: "缺少图片URL"
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
      // 从URL提取图片ID
      const imageId = await extractImageIdFromUrl(imageUrl);
      
      if (!imageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "INVALID_IMAGE_URL",
            message: "无法从URL中提取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 生成任务ID - 不再保存到任务存储，只是生成一个唯一ID
      const taskId = randomUUID();
      console.log(`生成任务ID: ${taskId}`);
      
      // 触发处理图片的API
      fetch(`${req.nextUrl.origin}/api/edit/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          taskId,
          imageId,
          prompt
        }),
      }).catch(err => {
        console.error(`触发处理图片失败:`, err);
      });
      
      // 返回任务ID和初始状态
      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status: 'pending',
          message: '已创建任务并开始处理'
        }
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`创建任务失败:`, error);
      
      return NextResponse.json({
        success: false,
        error: {
          code: "START_ERROR",
          message: "开始编辑图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`开始编辑API - 错误:`, error);
    
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
