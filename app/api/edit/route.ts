import { NextRequest, NextResponse } from "next/server";
import { extractImageIdFromUrl } from '../../../lib/url-utils';
import { ApiResponse } from '../../../lib/types';
import { 
  createEditTask, 
  processEditTask 
} from '../../../lib/task-manager';

/**
 * 图片编辑API
 * 
 * POST /api/edit
 * 
 * 请求参数:
 * - prompt: 编辑提示词
 * - imageUrl: 图片URL (来自飞书)
 * 
 * 响应:
 * {
 *   "success": true,
 *   "data": {
 *     "taskId": "uuid-task-id",
 *     "status": "pending"
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  console.log(`编辑图片API - 请求开始处理`);
  
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
          code: "INVALID_URL",
          message: "只支持飞书图片URL"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      // 从飞书URL提取图片ID
      const imageId = await extractImageIdFromUrl(imageUrl);
      
      if (!imageId) {
        return NextResponse.json({
          success: false,
          error: {
            code: "MISSING_IMAGE_ID",
            message: "无法从飞书URL获取图片ID"
          }
        } as ApiResponse, { status: 400 });
      }
      
      // 创建任务
      const task = createEditTask(imageId, prompt);
      console.log(`编辑图片API - 已创建任务: ${task.id} (图片ID: ${imageId})`);
      
      // 异步处理图片编辑任务
      // 注意：仅在后台启动处理，不等待结果
      setTimeout(() => {
        processEditTask(task.id).catch(err => {
          console.error(`编辑图片API - 异步处理任务 ${task.id} 出错:`, err);
        });
      }, 100);
      
      // 立即返回任务ID（不等待处理完成）
      return NextResponse.json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status
        }
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`编辑图片处理错误:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: "PROCESSING_ERROR",
          message: "处理图片编辑请求时发生错误",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`编辑图片API请求处理错误:`, error);
    return NextResponse.json({
      success: false,
      error: {
        code: "REQUEST_PROCESSING_ERROR",
        message: "处理请求时发生错误",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
