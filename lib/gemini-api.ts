import { GoogleGenerativeAI } from "@google/generative-ai";

// 初始化Gemini API客户端
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 定义使用的模型ID
const MODEL_ID = "gemini-2.0-flash-exp";

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * 调用Gemini API编辑图片
 * @param prompt 编辑提示词
 * @param imageData 图片数据(base64)
 * @param mimeType 图片MIME类型
 * @returns 生成结果
 */
export async function callGeminiApi(prompt: string, imageData: string, mimeType: string) {
  console.log(`调用Gemini API编辑图片`);
  
  // 初始化模型
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      // @ts-expect-error - Gemini API JS缺少此类型
      responseModalities: ["Text", "Image"],
    },
  });
  
  // 准备消息内容
  const messageParts = [
    { text: prompt },
    {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      }
    }
  ];
  
  // 添加重试逻辑
  let result;
  let retryCount = 0;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      console.log(`尝试编辑图片, 尝试次数: ${retryCount + 1}/${MAX_RETRIES + 1}`);
      
      result = await model.generateContent(messageParts as any);
      
      // 验证响应结构
      if (!result || !result.response) {
        throw new Error(`响应结构不完整`);
      }
      
      console.log(`API调用成功`);
      return result;
      
    } catch (error: any) {
      console.error(`编辑图片API调用错误:`, error);
      
      // 记录错误响应文本
      if (error.response && typeof error.response.text === 'function') {
        try {
          const errorText = await error.response.text();
          console.error('错误响应文本:', errorText);
        } catch (textError) {
          console.error('无法获取错误响应文本');
        }
      }
      
      retryCount++;
      
      // 根据错误类型处理重试
      const errorMessage = error.message || '';
      
      // 处理JSON解析错误
      if (errorMessage.includes("not valid JSON") && retryCount <= MAX_RETRIES) {
        console.log(`JSON解析错误，等待 ${RETRY_DELAY_MS}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      // 处理速率限制错误
      if (errorMessage.includes("Rate limit") && retryCount <= MAX_RETRIES) {
        const waitTime = RETRY_DELAY_MS * retryCount;
        console.log(`速率限制错误，等待 ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // 超过最大重试次数或其他错误
      if (retryCount > MAX_RETRIES) {
        console.error(`超过最大重试次数，放弃重试`);
      }
      
      throw error;
    }
  }
  
  throw new Error(`无法获取有效响应`);
}

/**
 * 解析Gemini API响应
 * @param response API响应
 * @returns 解析后的图片数据和文本
 */
export function parseGeminiResponse(response: any): {
  imageData: string | null;
  mimeType: string;
  textResponse: string | null;
} {
  let textResponse: string | null = null;
  let imageData: string | null = null;
  let mimeType = "image/png";
  
  try {
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      const parts = response.candidates[0].content.parts;
      console.log(`成功获取响应，包含 ${parts.length} 个部分`);
      
      for (const part of parts) {
        if (part && "inlineData" in part && part.inlineData) {
          // 获取图片数据
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
          console.log(`获取到图片数据，类型: ${mimeType}`);
        } else if (part && "text" in part && part.text) {
          // 获取文本
          textResponse = part.text;
          console.log(`获取到文本响应: ${textResponse?.substring(0, 50)}...`);
        } else {
          console.log(`未知的响应部分类型:`, part);
        }
      }
    } else {
      console.error(`响应结构不完整:`, response);
    }
  } catch (parseError) {
    console.error(`解析响应时发生错误:`, parseError);
    throw parseError;
  }
  
  return { imageData, mimeType, textResponse };
}
