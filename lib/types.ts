// Define the interface for conversation history items
export interface HistoryItem {
  role: "user" | "model";
  parts: HistoryPart[];
}

// Define the interface for history parts
export interface HistoryPart {
  text?: string;
  image?: string;
}

// Define the interface for image metadata
export interface ImageMetadata {
  id: string;
  prompt: string;
  createdAt: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  parentId?: string; // 添加parentId字段，用于标识这张图片是从哪张图片编辑而来
  rootParentId?: string; // 添加rootParentId字段，标识整个编辑链的原始图片
  type?: string;     // 添加type字段，用于标识图片类型，如"uploaded"表示用户上传
  timestamp?: number; // 时间戳，用于飞书多维表格排序
  feishuUrl?: string; // 飞书中的文件访问URL
  feishuFileToken?: string; // 飞书文件系统中的文件标识
  feishuSyncFailed?: boolean; // 标识是否同步到飞书失败
}

// Define the interface for API response
export interface ApiResponse {
  success: boolean;
  data?: {
    imageUrl?: string;
    description?: string;
    metadata?: ImageMetadata;
    history?: HistoryItem[];
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Define supported image formats
export type ImageFormat = 'png' | 'jpeg' | 'webp';

// Define image generation options
export interface ImageOptions {
  format?: ImageFormat;
  width?: number;
  height?: number;
  quality?: number;
  isUploadedImage?: boolean; // 添加标记，用于标识是否为用户上传的图片
  rootParentId?: string;   // 添加根父ID，用于跟踪编辑链的出处
  isVercelEnv?: boolean;   // 添加Vercel环境标志，用于区分处理逻辑
}