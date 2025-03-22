import { NextRequest, NextResponse } from "next/server";
import { extractImageIdFromUrl } from "@/app/api/edit/utils";
import { ApiResponse } from "@/lib/types";

/**
 * 提取图片ID的API - 从URL中提取图片ID
 */
export async function GET(req: NextRequest) {
  try {
    // 从URL参数中获取图片URL
    const searchParams = req.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: {
          code: "MISSING_URL",
          message: "缺少图片URL参数"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 提取图片ID
    const imageId = await extractImageIdFromUrl(imageUrl);
    
    if (!imageId) {
      return NextResponse.json({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "无法从URL中提取图片ID"
        }
      } as ApiResponse, { status: 400 });
    }
    
    // 返回图片ID
    return NextResponse.json({
      success: true,
      imageId
    });
    
  } catch (error: any) {
    console.error(`提取图片ID - 错误:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: "EXTRACT_ERROR",
        message: "提取图片ID时出错",
        details: error instanceof Error ? error.message : String(error)
      }
    } as ApiResponse, { status: 500 });
  }
}
