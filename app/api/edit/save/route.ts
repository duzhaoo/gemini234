import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/task-manager";
import { uploadImageToFeishu } from "@/lib/feishu";
import { ApiResponse } from "@/lib/types";

/**
 * 保存图片API - 将处理好的图片保存到飞书
 */
export async function POST(req: NextRequest) {
  console.log(`保存图片API - 开始保存`);
  
  try {
    // 解析请求数据
    const {
      processedImageData,
      responseType,
      imageRecord,
      taskId,
      fileName,
      newImageName
    } = await req.json();
    
    if (!processedImageData) {
      return NextResponse.json({
        success: false,
        taskId,
        error: {
          code: "MISSING_IMAGE_DATA",
          message: "缺少图片数据"
        }
      } as ApiResponse, { status: 400 });
    }
    
    if (!imageRecord || !imageRecord.fileToken) {
      return NextResponse.json({
        success: false,
        taskId,
        error: {
          code: "MISSING_IMAGE_RECORD",
          message: "缺少图片记录信息"
        }
      } as ApiResponse, { status: 400 });
    }
    
    try {
      console.log(`准备上传图片到飞书，任务ID: ${taskId}`);
      
      // 生成文件名
      const finalFileName = newImageName || fileName || `edited_${Date.now()}.jpg`;
      
      // 上传图片到飞书
      const uploadResult = await uploadImageToFeishu(
        processedImageData,
        finalFileName,
        responseType || 'image/jpeg'
      );
      
      if (uploadResult.error) {
        console.error(`上传图片失败:`, uploadResult.errorMessage);
        
        return NextResponse.json({
          success: false,
          taskId,
          status: 'failed',
          error: {
            code: "UPLOAD_FAILED",
            message: "上传图片失败",
            details: uploadResult.errorMessage
          }
        } as ApiResponse, { status: 500 });
      }
      
      // 返回成功结果
      return NextResponse.json({
        success: true,
        taskId,
        status: 'completed',
        data: {
          id: uploadResult.fileToken,
          url: uploadResult.url,
          name: uploadResult.name
        }
      } as ApiResponse);
      
    } catch (error: any) {
      console.error(`保存图片失败:`, error);
      
      return NextResponse.json({
        success: false,
        taskId,
        status: 'failed',
        error: {
          code: "SAVE_ERROR",
          message: "保存图片时出错",
          details: error instanceof Error ? error.message : String(error)
        }
      } as ApiResponse, { status: 500 });
    }
  } catch (error: any) {
    console.error(`保存图片API - 错误:`, error);
    
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
