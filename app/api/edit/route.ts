import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";
import { createTask } from "@/lib/task-manager";
import { extractImageIdFromUrl } from "@/app/api/edit/utils";

/**
 * 图片编辑API端点（向后兼容模式）
 * 该端点现在会将请求转发到新的拆分API架构
 */
export async function POST(req: NextRequest) {
  console.log(`旧版编辑API - 收到请求，将重定向到新的API架构`);
  
  try {
    // 解析请求数据
    const reqBody = await req.json();
    const { prompt, imageUrl } = reqBody;

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
    
    // 1. 创建新任务
    const task = await createTask({
      imageUrl,
      prompt,
      internal: {
        originalImageId: imageId
      }
    });
    
    // 2. 触发处理API
    const processUrl = `${req.nextUrl.origin}/api/edit/process`;
    console.log(`触发处理API: ${processUrl}`);
    
    const processResponse = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId: task.id }),
    });
    
    if (!processResponse.ok) {
      const errorData = await processResponse.json();
      return NextResponse.json({
        success: false,
        error: errorData.error || {
          code: "PROCESS_ERROR",
          message: "处理图片失败"
        }
      } as ApiResponse, { status: 500 });
    }
    
    // 3. 等待图片处理和保存完成
    // 注意：这里我们会持续等待，但是如果时间过长可能会导致超时
    let result = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // 最多等待40次状态更新（约80秒）
    
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      
      // 等待2秒
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 检查任务状态
      const statusUrl = `${req.nextUrl.origin}/api/edit/status?taskId=${task.id}`;
      const statusResponse = await fetch(statusUrl);
      
      if (!statusResponse.ok) {
        continue;
      }
      
      const statusData = await statusResponse.json();
      const status = statusData.data?.status;
      
      console.log(`检查任务状态: ${status}, 尝试次数: ${attempts}`);
      
      if (status === 'completed' && statusData.data?.result?.url) {
        result = statusData.data.result;
        break;
      } else if (status === 'failed') {
        return NextResponse.json({
          success: false,
          error: statusData.data?.error || {
            code: "TASK_FAILED",
            message: "处理任务失败"
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 如果接近超时，提前返回，避免Vercel超时
      if (attempts >= 4) { // 约8秒，给Vercel留2秒缓冲
        return NextResponse.json({
          success: false,
          error: {
            code: "PROCESSING_TIMEOUT",
            message: "处理时间过长，请稍后通过任务ID查询结果",
            taskId: task.id
          }
        } as ApiResponse, { status: 202 });
      }
    }
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: {
          code: "RESULT_TIMEOUT",
          message: "等待处理结果超时，请稍后通过任务ID查询结果",
          taskId: task.id
        }
      } as ApiResponse, { status: 202 });
    }
    
    // 返回成功结果
    return NextResponse.json({
      success: true,
      data: {
        imageUrl: result.url,
        imageId: result.id,
        taskId: task.id
      }
    } as ApiResponse);
  } catch (error: any) {
    console.error(`旧版编辑API - 处理错误:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: "API_ERROR",
        message: "处理请求时发生错误",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
