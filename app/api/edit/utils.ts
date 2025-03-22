import { getImageRecordById, getAccessToken } from "@/lib/feishu";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// 初始化Gemini API客户端
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 定义使用的模型ID
const MODEL_ID = "gemini-2.0-flash-exp";

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * 从URL中提取图片ID
 */
export async function extractImageIdFromUrl(imageUrl: string): Promise<string | undefined> {
  try {
    console.log(`尝试从URL提取图片ID: ${imageUrl}`);
    
    // 使用正则表达式匹配图片ID格式
    const regex = /\/images\/([^\/\?]+)/;
    const match = imageUrl.match(regex);
    
    if (match && match[1]) {
      console.log(`从URL中提取到ID: ${match[1]}`);
      return match[1];
    }
    
    console.log(`无法从URL中提取ID`);
    return undefined;
  } catch (error) {
    console.error(`提取图片ID时出错:`, error);
    return undefined;
  }
}

/**
 * 从飞书获取图片数据
 */
export async function fetchImageFromFeishu(imageId: string) {
  try {
    console.log(`从飞书获取图片数据, ID: ${imageId}`);
    
    // 获取图片记录
    const imageRecord = await getImageRecordById(imageId);
    
    if (!imageRecord || !imageRecord.id) {
      throw new Error(`无法获取图片记录或记录不完整，ID: ${imageId}`);
    }
    
    // 获取access token
    const token = await getAccessToken();
    
    if (!token) {
      throw new Error('无法获取飞书访问令牌');
    }
    
    // 从飞书下载图片
    const response = await axios.get(imageRecord.url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'arraybuffer'
    });
    
    // 转换为base64
    const imageData = Buffer.from(response.data).toString('base64');
    const mimeType = response.headers['content-type'] || 'image/png';
    
    return {
      imageData,
      mimeType,
      imageRecord
    };
  } catch (error) {
    console.error(`获取飞书图片数据失败:`, error);
    throw error;
  }
}

/**
 * 调用Gemini API处理图片
 */
export async function callGeminiApi(prompt: string, imageData: string, mimeType: string, retries = 0) {
  try {
    console.log(`尝试编辑图片, 尝试次数: ${retries + 1}/${MAX_RETRIES}`);
    
    // 初始化模型
    const model = genAI.getGenerativeModel({ model: MODEL_ID });
    
    // 构建提示
    const imagePrompt = {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      }
    };
    
    // 调用API
    const result = await model.startChat().sendMessage([
      prompt,
      imagePrompt
    ]);
    
    console.log(`API调用成功`);
    
    return {
      response: result,
      isError: false
    };
  } catch (error: any) {
    console.error(`API调用失败:`, error.message);
    
    // 处理重试逻辑
    if (retries < MAX_RETRIES - 1) {
      console.log(`将在 ${RETRY_DELAY_MS}ms 后重试...`);
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      
      return callGeminiApi(prompt, imageData, mimeType, retries + 1);
    }
    
    return {
      response: null,
      isError: true,
      error
    };
  }
}

/**
 * 解析Gemini API响应，提取图片和文本
 */
export function parseGeminiResponse(response: any) {
  try {
    console.log(`成功获取响应，包含 ${response.parts.length} 个部分`);
    
    let imageData: string | null = null;
    let mimeType = 'image/png';
    let textResponse = '';
    
    for (const part of response.parts) {
      if (part.text) {
        textResponse += part.text;
      }
      
      if (part.inlineData) {
        console.log(`获取到图片数据，类型: ${part.inlineData.mimeType}`);
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
      }
    }
    
    return {
      imageData,
      mimeType,
      textResponse
    };
  } catch (error) {
    console.error(`解析API响应失败:`, error);
    return {
      imageData: null,
      mimeType: 'image/png',
      textResponse: ''
    };
  }
}
