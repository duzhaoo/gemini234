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
    
    // 对提示词添加前缀，使意图更明确
    let enhancedPrompt = prompt;
    if (!prompt.includes("将这张图片") && !prompt.includes("把这张图片")) {
      enhancedPrompt = `把这张图片${prompt}`;
    }
    
    // 初始化模型
    const model = genAI.getGenerativeModel({ 
      model: MODEL_ID,
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
        // @ts-expect-error - Gemini API JS 可能缺少这个类型
        responseModalities: ["Text", "Image"],
      }
    });
    
    // 构建提示，使用更明确的语言
    const textPrompt = { text: `编辑这张图片：${enhancedPrompt}` };
    
    // 处理图片数据 - 确保只使用纯Base64编码的数据（无前缀）
    let pureBase64Data = imageData;
    
    // 如果数据是Data URL格式，则提取纯Base64部分
    if (imageData.startsWith('data:')) {
      // 分离前缀和Base64数据
      const base64Marker = ';base64,';
      const baseIndex = imageData.indexOf(base64Marker) + base64Marker.length;
      pureBase64Data = imageData.substring(baseIndex);
      console.log('已从Data URL提取纯Base64数据');
    }
    
    // 构建图片提示
    const imagePrompt = {
      inlineData: {
        data: pureBase64Data,
        mimeType: mimeType
      }
    };
    
    // 使用简化的消息格式
    const messageParts = [textPrompt, imagePrompt];
    
    console.log(`使用提示词: ${textPrompt.text}`);
    
    // 直接使用generateContent进行调用
    const result = await model.generateContent(messageParts as any);
    
    console.log(`API调用成功`);
    
    // 获取原始响应以便检查
    const response = result.response;
    
    // 检查是否存在候选结果
    if (!response || !response.candidates || response.candidates.length === 0) {
      console.warn(`API调用成功但返回了无效响应`);
      if (retries < MAX_RETRIES - 1) {
        console.log(`将在 ${RETRY_DELAY_MS}ms 后重试无效响应...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return callGeminiApi(prompt, imageData, mimeType, retries + 1);
      }
      return {
        response: null,
        isError: true,
        error: new Error("API返回了无效响应")
      };
    }
    
    // 检查是否包含有效内容
    const candidate = response.candidates[0];
    const parts = candidate.content?.parts || [];
    
    // 打印响应部分的详细信息，便于调试
    console.log(`响应包含 ${parts.length} 个部分`);
    
    // 验证是否有图片内容
    let hasImageContent = false;
    let hasTextContent = false;
    
    for (const part of parts) {
      if (part && "inlineData" in part && part.inlineData) {
        console.log(`找到图片内容: ${part.inlineData.mimeType}`);
        hasImageContent = true;
      } else if (part && (part as any).inline_data) {
        // 兼容不同API版本
        console.log(`找到替代格式图片内容`);
        hasImageContent = true;
      } else if (part && "text" in part && part.text) {
        console.log(`找到文本内容: ${part.text.substring(0, 50)}...`);
        hasTextContent = true;
        
        // 有些版本的API会在文本中返回图片数据
        if (typeof part.text === 'string' && part.text.includes('data:image/')) {
          console.log(`在文本中找到图片数据`);
          hasImageContent = true;
        }
      }
    }
    
    console.log(`响应分析: 有图片内容=${hasImageContent}, 有文本内容=${hasTextContent}`);
    
    if (!hasImageContent) {
      console.warn(`API响应中没有图片内容`);
      
      // 如果是最后一次重试，或者响应中有文本但没图片，使用备用提示词
      if (retries >= MAX_RETRIES - 1) {
        console.log(`已达到最大重试次数，尝试使用备用提示词...`);
        // 使用更明确的备用提示词，强调生成图像的重要性
        const alternativePrompt = `生成一个新的图像。将这张图片${enhancedPrompt}。必须返回修改后的图像。`;
        return callGeminiApi(alternativePrompt, imageData, mimeType, 0);
      }
      
      console.log(`将在 ${RETRY_DELAY_MS}ms 后重试获取图片内容...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return callGeminiApi(prompt, imageData, mimeType, retries + 1);
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
 * 解析Gemini响应中的数据
 */
export function parseGeminiResponse(result: any) {
  try {
    let textResponse = null;
    let imageData = null;
    let imageMimeType = "image/png";
    
    console.log("开始解析Gemini响应...");
    
    if (!result || !result.response) {
      console.warn("无效的响应格式：响应为空或缺少response字段");
      throw new Error("无效的响应格式");
    }
    
    const response = result.response;
    
    // 使用更健壮的条件检查，不在中间步骤抛出错误
    if (response && response.candidates && response.candidates.length > 0 && 
        response.candidates[0].content && response.candidates[0].content.parts) {
      
      const parts = response.candidates[0].content.parts;
      console.log(`响应包含 ${parts.length} 个部分`);
      
      // 遍历所有部分，寻找图片和文本
      for (const part of parts) {
        // 检查是否包含内联数据（图片）
        if (part && "inlineData" in part && part.inlineData) {
          console.log("从inlineData中提取图片");
          imageData = part.inlineData.data;
          imageMimeType = part.inlineData.mimeType || "image/png";
        } 
        // 检查替代格式（兼容不同API版本）
        else if (part && (part as any).inline_data) {
          console.log("从替代格式inline_data中提取图片");
          const inlineData = (part as any).inline_data;
          imageData = inlineData.data;
          imageMimeType = inlineData.mimeType || "image/png";
        } 
        // 检查文本内容
        else if (part && "text" in part && part.text) {
          console.log("从响应中提取文本");
          textResponse = part.text;
          
          // 有时图片数据会在文本中返回
          if (typeof part.text === 'string') {
            // 寻找文本中的图片数据
            const dataUrlMatch = part.text.match(/data:image\/[^;]+;base64,[a-zA-Z0-9+\/=]+/);
            if (dataUrlMatch) {
              console.log("从文本中提取图片数据URL");
              const dataUrl = dataUrlMatch[0];
              const parts = dataUrl.split(';base64,');
              if (parts.length === 2) {
                const mime = parts[0].replace('data:', '');
                const base64Data = parts[1];
                imageData = base64Data;
                imageMimeType = mime;
              }
            }
          }
        }
      }
    } else {
      // 尝试使用替代方法获取响应数据
      console.warn("标准响应格式不满足条件，尝试替代方法解析响应");
      
      // 尝试直接获取原始部分
      if (response.candidates) {
        for (const candidate of response.candidates) {
          if (candidate.content) {
            const parts = candidate.content.parts || [];
            console.log(`尝试从替代路径获取响应部分，找到 ${parts.length} 个部分`);
            
            for (const part of parts) {
              if (part && part.inlineData) {
                console.log("从替代路径中找到图片数据");
                imageData = part.inlineData.data;
                imageMimeType = part.inlineData.mimeType || "image/png";
              } else if (part && typeof part === 'object' && 'text' in part) {
                textResponse = part.text;
              }
            }
          }
        }
      }
      
      // 尝试从直接路径访问
      if (!imageData && response.text) {
        console.log("尝试从response.text中获取数据");
        textResponse = response.text;
        
        // 检查文本是否包含图片数据
        if (typeof response.text === 'string') {
          const dataUrlMatch = response.text.match(/data:image\/[^;]+;base64,[a-zA-Z0-9+\/=]+/);
          if (dataUrlMatch) {
            const dataUrl = dataUrlMatch[0];
            const parts = dataUrl.split(';base64,');
            if (parts.length === 2) {
              imageData = parts[1];
              imageMimeType = parts[0].replace('data:', '');
            }
          }
        }
      }
      
      // 检查原始结果中是否有图片数据
      if (!imageData && result.response && typeof result.response === 'object') {
        console.log("从原始响应对象中查找图片数据");
        const searchImageData = (obj: any, depth = 0): any => {
          if (depth > 3) return null; // 限制搜索深度
          
          if (!obj || typeof obj !== 'object') return null;
          
          // 检查是否是图片数据对象
          if (obj.data && obj.mimeType && obj.mimeType.startsWith('image/')) {
            return { data: obj.data, mimeType: obj.mimeType };
          }
          
          // 递归搜索对象的所有属性
          for (const key in obj) {
            if (typeof obj[key] === 'object') {
              const found = searchImageData(obj[key], depth + 1);
              if (found) return found;
            }
          }
          
          return null;
        };
        
        const found = searchImageData(result.response);
        if (found) {
          console.log("在嵌套对象中找到图片数据");
          imageData = found.data;
          imageMimeType = found.mimeType;
        }
      }
    }
    
    if (!imageData) {
      console.error("未找到图片数据");
      throw new Error("未找到图片数据");
    }
    
    return {
      text: textResponse,
      image: {
        data: imageData,
        mimeType: imageMimeType
      }
    };
  } catch (error) {
    console.error("解析Gemini响应出错:", error);
    throw error;
  }
}
