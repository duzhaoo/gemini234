import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/feishu";
import axios from "axios";
import fs from 'fs';
import path from 'path';

/**
 * 记录图片请求错误
 * @param message 错误信息
 * @param details 错误详情
 */
function logError(message: string, details: any = {}) {
  const timestamp = new Date().toISOString();
  // 在Vercel环境中只使用控制台日志
  console.error(`[${timestamp}] ${message}`, details);
}

/**
 * 下载飞书图片
 * 飞书图片的访问需要特殊处理
 * @param imageId 图片ID
 * @param token 访问令牌
 * @returns 图片二进制数据和类型
 */
async function downloadFeishuImage(imageId: string, token: string) {
  // 构建正确的飞书图片API地址
  const imageUrl = `https://open.feishu.cn/open-apis/im/v1/images/${imageId}?image_type=image`;
  
  // 添加更详细的调试输出
  console.log(`尝试下载飞书图片: ${imageUrl}`);
  console.log(`使用的令牌: Bearer ${token.substring(0, 10)}...`);
  
  // 发送请求获取图片
  const response = await axios.get(imageUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'image/*'
    },
    responseType: 'arraybuffer',
    maxRedirects: 5, // 允许重定向
    timeout: 10000, // 10秒超时
    validateStatus: (status) => status < 500 // 允许400级别错误被捕获
  });
  
  // 处理状态码
  if (response.status !== 200) {
    throw new Error(`飞书API返回非200状态码: ${response.status}`);
  }
  
  // 获取内容类型
  let contentType = response.headers['content-type'] || 'image/jpeg';
  
  // 确保返回的数据是图片
  if (!contentType.startsWith('image/')) {
    contentType = 'image/jpeg'; // 默认假设为JPEG
  }
  
  return {
    data: response.data,
    contentType
  };
}

/**
 * 从飞书图片URL中提取图片ID
 * @param url 飞书图片URL
 * @returns 图片ID或null
 */
function extractImageId(url: string): string | null {
  if (!url) return null;
  
  try {
    // 处理不同的URL模式
    // 形如: https://open.feishu.cn/open-apis/im/v1/images/img_v3_02kj_a2fe0dbd-8dbf-4ab2-9723-f55b6f1190cg
    const matches = url.match(/\/images\/([^\/\?&]+)/);
    if (matches && matches[1]) {
      return matches[1];
    }
    
    return null;
  } catch (error) {
    logError('解析图片ID失败', { url, error });
    return null;
  }
}

/**
 * 获取占位图片数据
 * 从public目录读取占位图片
 */
async function getPlaceholderImage() {
  try {
    // 基于环境确定正确的路径
    let placeholderPath;
    if (process.env.NODE_ENV === 'development') {
      // 开发环境，使用相对路径
      placeholderPath = path.join(process.cwd(), 'public', 'placeholder-image.svg');
    } else {
      // 生产环境，尝试使用绝对路径
      placeholderPath = '/var/task/public/placeholder-image.svg';
    }
    
    // 检查文件是否存在，不存在则使用硬编码的SVG
    if (fs.existsSync(placeholderPath)) {
      const imageData = fs.readFileSync(placeholderPath);
      return {
        data: imageData,
        contentType: 'image/svg+xml'
      };
    } else {
      // 提供一个基本的SVG占位图作为备选
      const fallbackSvg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#f0f0f0"/>
        <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="#999">图片加载失败</text>
      </svg>`;
      
      return {
        data: Buffer.from(fallbackSvg),
        contentType: 'image/svg+xml'
      };
    }
  } catch (error) {
    console.error('获取占位图片失败:', error);
    // 提供一个最简单的SVG占位图
    const simpleSvg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#eee"/>
      <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle">加载失败</text>
    </svg>`;
    
    return {
      data: Buffer.from(simpleSvg),
      contentType: 'image/svg+xml'
    };
  }
}

/**
 * 图片代理API的处理函数
 * 用于请求飞书图片并应用适当的缓存和头信息
 */
export async function GET(req: NextRequest) {
  try {
    // 1. 获取源图片URL
    const sourceUrl = req.nextUrl.searchParams.get('url');
    if (!sourceUrl) {
      // 返回占位图片而不是JSON错误
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Error': '缺少URL参数'
        }
      });
    }
    
    console.log(`收到图片请求: ${sourceUrl}`);
    
    // 2. 验证URL是否为飞书图片URL
    if (!sourceUrl.includes('open.feishu.cn')) {
      // 返回占位图片而不是JSON错误
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Error': '只支持飞书图片地址'
        }
      });
    }
    
    // 3. 从飞书图片URL提取图片ID
    const imageId = extractImageId(sourceUrl);
    if (!imageId) {
      logError('无法提取图片ID', { url: sourceUrl });
      // 返回占位图片而不是JSON错误
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Error': '无法提取图片ID'
        }
      });
    }
    
    console.log(`提取到图片ID: ${imageId}`);
    
    // 4. 获取飞书访问令牌
    const token = await getAccessToken();
    if (!token) {
      logError('获取飞书令牌失败');
      // 返回占位图片而不是JSON错误
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Error': '获取访问令牌失败'
        }
      });
    }
    
    // 5. 下载飞书图片
    try {
      const { data, contentType } = await downloadFeishuImage(imageId, token);
      
      // 6. 返回图片数据
      console.log(`成功获取图片: ${imageId}, 类型: ${contentType}`);
      
      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400', // 缓存24小时
          'Access-Control-Allow-Origin': '*',
          'X-Image-Id': imageId
        }
      });
    } catch (downloadError) {
      logError('下载飞书图片失败', { 
        imageId,
        error: downloadError instanceof Error ? downloadError.message : String(downloadError)
      });
      
      // 7. 返回占位图片而不是JSON错误
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=3600', // 失败的图片只缓存1小时
          'X-Error': '下载图片失败',
          'X-Error-Details': downloadError instanceof Error ? downloadError.message : 'unknown error'
        }
      });
    }
  } catch (error) {
    // 全局错误处理
    logError('图片代理API未捕获错误', { 
      error: error instanceof Error ? error.stack : String(error)
    });
    
    // 返回占位图片而不是JSON错误
    try {
      const placeholder = await getPlaceholderImage();
      return new NextResponse(placeholder.data, {
        headers: {
          'Content-Type': placeholder.contentType,
          'Cache-Control': 'public, max-age=3600', // 失败的图片只缓存1小时
          'X-Error': '服务器内部错误'
        }
      });
    } catch (placeholderError) {
      // 最后的备用方案 - 使用硬编码的简单SVG
      const simpleSvg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#eee"/>
        <text x="200" y="150" font-family="Arial" font-size="20" text-anchor="middle">Error</text>
      </svg>`;
      
      return new NextResponse(Buffer.from(simpleSvg), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache'
        }
      });
    }
  }
}
