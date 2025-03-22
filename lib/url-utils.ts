/**
 * 从URL中提取图片ID的工具函数
 */

/**
 * 从URL中提取图片ID
 * @param imageUrl 图片URL
 * @returns 提取的图片ID或null
 */
export async function extractImageIdFromUrl(imageUrl: string): Promise<string | null> {
  console.log(`尝试从URL提取图片ID: ${imageUrl}`);
  
  // 检查是否是img_v3_格式
  if (imageUrl.includes('img_v3_')) {
    const matches = imageUrl.match(/img_v3_[\w-]+/);
    if (matches && matches[0]) {
      const imageId = matches[0];
      console.log(`从URL中提取到ID: ${imageId}`);
      return imageId;
    }
  }
  
  // 尝试从URL查询参数中获取ID
  try {
    const urlObj = new URL(imageUrl);
    const idFromQuery = urlObj.searchParams.get('id');
    if (idFromQuery) {
      console.log(`从URL查询参数中提取到ID: ${idFromQuery}`);
      return idFromQuery;
    }
    
    // 尝试从路径中提取ID
    const pathParts = urlObj.pathname.split('/');
    for (const part of pathParts) {
      if (part && part.length > 8) {
        console.log(`从路径中提取到可能的ID: ${part}`);
        return part;
      }
    }
  } catch (err) {
    console.error("解析URL失败:", err);
  }
  
  // 尝试匹配UUID格式
  const uuidMatches = imageUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatches && uuidMatches[0]) {
    console.log(`从URL中提取到UUID格式ID: ${uuidMatches[0]}`);
    return uuidMatches[0];
  }
  
  return null;
}
