import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";
import { createTask } from "@/lib/task-manager";
import { extractImageIdFromUrl } from "@/app/api/edit/utils";

/**
 * 开始图片编辑任务
 * 该API接收图片URL和提示词，创建一个新任务并立即返回任务ID
 */
export async function POST(req: NextRequest) {
  console.log(`开始编辑任务API - 请求开始处理`);
  
  try {
    // 解析请求数据
    const { prompt, imageUrl } = await req.json();

    // 验证必要参数
    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_PROMPT",
          message: "缺少提示词参数"
        }
      } as ApiResponse, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_IMAGE_URL",
          message: "缺少图片URL参数"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 验证URL类型
    if (!imageUrl.includes('open.feishu.cn')) {
      return NextResponse.json({
        success: false,
        error: {
          code: "INVALID_URL_FORMAT",
          message: "在Vercel环境中只能使用飞书图片URL"
        }
      } as ApiResponse, { status: 400 });
    }
    
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
    
    // 创建新任务
    const task = await createTask({
      imageUrl,
      prompt,
      internal: {
        originalImageId: imageId
      }
    });
    
    // 立即触发后台处理
    fetch(`${req.nextUrl.origin}/api/edit/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId: task.id }),
    }).catch(err => {
      console.error(`触发后台处理失败:`, err);
    });
    
    // 返回任务ID
    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: task.status
      }
    } as ApiResponse);
  } catch (error: any) {
    console.error(`开始编辑任务API - 处理错误:`, error);
    
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
