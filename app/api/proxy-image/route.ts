import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(request: NextRequest) {
  try {
    // 从URL参数中获取目标图片URL
    const url = request.nextUrl.searchParams.get("url");
    
    // 如果没有提供URL，返回错误
    if (!url) {
      return NextResponse.json({ error: "需要提供图片URL" }, { status: 400 });
    }
    
    console.log(`代理图片请求: ${url}`);
    
    // 设置超时时间
    const timeout = 10000; // 10秒
    
    // 使用axios发送请求获取图片
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: timeout,
      headers: {
        // 模拟浏览器请求
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        // 飞书API可能需要这些头部
        "Referer": "https://applink.feishu.cn/",
        "Origin": "https://applink.feishu.cn"
      }
    });
    
    // 获取内容类型
    const contentType = response.headers["content-type"] || "image/jpeg";
    
    // 返回图片数据
    return new NextResponse(response.data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // 缓存一天
      }
    });
  } catch (error: any) {
    console.error("代理图片请求失败:", error.message);
    
    // 返回错误响应
    return NextResponse.json(
      { error: `获取图片失败: ${error.message}` },
      { status: 500 }
    );
  }
}
