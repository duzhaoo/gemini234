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
    
    // 检查响应是否有效
    // 根据API文档，检查response的内容
    const responseText = typeof result.response?.text === 'function' 
      ? result.response?.text() 
      : result.response?.text;
    const textContent = responseText ? responseText.trim() : '';
    const candidateParts = result.response?.candidates?.[0]?.content?.parts || [];
    
    // 判断响应是否为空
    const isEmpty = (!textContent || textContent === '') && candidateParts.length === 0;
    
    if (isEmpty) {
      console.warn(`API调用成功但返回了空响应`);
      if (retries < MAX_RETRIES - 1) {
        console.log(`将在 ${RETRY_DELAY_MS}ms 后重试空响应...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return callGeminiApi(prompt, imageData, mimeType, retries + 1);
      }
      return {
        response: null,
        isError: true,
        error: new Error("API返回了空响应")
      };
    }
    
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
    // 首先检查response是否存在及其结构
    if (!response) {
      console.log('响应为空');
      return {
        imageData: null,
        mimeType: 'image/png',
        textResponse: '处理失败：API返回空响应'
      };
    }

    // 处理不同版本API响应格式
    let textResponse = '';
    let imageData: string | null = null;
    let mimeType = 'image/png';
    
    // 1. 尝试获取text响应
    if (response.text) {
      textResponse = response.text;
      console.log(`获取到文本响应，长度: ${textResponse.length}`);
    } else if (response.response?.text) {
      textResponse = response.response.text;
      console.log(`获取到文本响应（response.text），长度: ${textResponse.length}`);
    }
    
    // 2. 尝试从不同格式中获取图片数据
    // 版本1: 直接从response.parts
    const parts = response.parts || [];
    // 版本2: 从candidates
    const candidateParts = response.candidates?.[0]?.content?.parts || 
                           response.response?.candidates?.[0]?.content?.parts || [];
    
    // 记录部分数量
    console.log(`成功获取响应，parts: ${parts.length}个, candidateParts: ${candidateParts.length}个`);
    
    // 处理所有可能的部分
    const allParts = [...parts, ...candidateParts];
    
    // 如果没有内容，输出警告
    if (allParts.length === 0 && !textResponse) {
      console.warn('API响应中没有任何内容');
      return {
        imageData: null,
        mimeType: 'image/png',
        textResponse: '处理失败：API响应中没有内容'
      };
    }
    
    // 遍历所有部分寻找图片数据
    for (const part of allParts) {
      // 处理文本
      if (part.text && typeof part.text === 'string') {
        textResponse += part.text;
      }
      
      // 处理图片数据 - 方式1
      if (part.inlineData) {
        console.log(`获取到图片数据，类型: ${part.inlineData.mimeType}`);
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
        break; // 找到图片就退出循环
      }
      // 处理图片数据 - 方式2
      else if (part.inline_data) {
        console.log(`获取到图片数据（替代格式），类型: ${part.inline_data.mime_type || part.inline_data.mimeType}`);
        imageData = part.inline_data.data;
        mimeType = part.inline_data.mime_type || part.inline_data.mimeType || 'image/png';
        break; // 找到图片就退出循环
      }
    }
    
    // 如果没有找到图片数据但有文本，附加错误信息
    if (!imageData && textResponse) {
      console.warn(`未找到图片数据，仅返回文本响应`);
      textResponse = `[错误] 未能生成图片，API返回: ${textResponse}`;
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
      textResponse: `解析API响应时出错: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
