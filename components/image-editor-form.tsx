"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ImageIcon, Upload, Loader2, InfoIcon, CheckIcon } from "lucide-react";

interface ImageEditorFormProps {
  onImageEdited?: (imageUrl: string) => void;
  initialImageUrl?: string;
  readOnlyUrl?: boolean;
}

// 轮询间隔 (ms)
const POLLING_INTERVAL = 2000;

export function ImageEditorForm({ 
  onImageEdited, 
  initialImageUrl = "", 
  readOnlyUrl = false 
}: ImageEditorFormProps) {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState<number>(0);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed'>('idle');
  const [uploadedImage, setUploadedImage] = useState<{url: string, imageId: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 重置表单
  const resetForm = () => {
    setImageUrl("");
    setPrompt("");
    setSelectedFile(null);
    setError(null);
    setIsLoading(false);
    setResultImage(null);
    setStatusMessage(null);
    setTaskId(null);
    setPollingCount(0);
    setTaskStatus('idle');
    setUploadedImage(null);
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        setError("请选择有效的图片文件");
        return;
      }
      
      setSelectedFile(file);
      setError(null);
      
      // 如果已经有URL，清除它
      if (imageUrl) {
        setImageUrl("");
      }
    }
  };

  // 处理URL输入
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(e.target.value);
    
    // 如果已经选择了文件，清除它
    if (selectedFile) {
      setSelectedFile(null);
    }
    
    setError(null);
  };

  // 处理提示词输入
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setError(null);
  };

  // 第一步：上传图片到飞书
  const handleUploadImage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 检查是否有图像来源（URL或上传的文件）
    if (!imageUrl && !selectedFile) {
      setError("请上传图片或输入图像网址");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage("准备上传图片...");
    setTaskStatus("uploading");

    try {
      let targetImageUrl;
      
      if (selectedFile) {
        // 如果有上传的文件，先上传图片
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', "用户上传的原始图片"); // 添加固定提示词
        
        setStatusMessage("正在上传图片到飞书...");
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error?.message || "上传图片失败");
        }
        
        const uploadData = await uploadResponse.json();
        targetImageUrl = uploadData.data?.imageUrl;
        
        if (!targetImageUrl) {
          throw new Error("上传图片后未返回有效的URL");
        }
      } else {
        // 使用输入的URL
        targetImageUrl = imageUrl;
      }

      // 提取图片ID
      const imageId = await extractImageIdFromUrl(targetImageUrl);
      
      // 上传完成，设置状态
      setUploadedImage({url: targetImageUrl, imageId});
      setStatusMessage("图片已上传到飞书，请输入处理指令并点击处理图片");
      setTaskStatus("uploaded");
      setIsLoading(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传图片时发生错误");
      setTaskStatus("failed");
      setIsLoading(false);
    }
  };

  // 第二步：发送到Gemini处理
  const handleProcessImage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedImage) {
      setError("请先上传图片");
      return;
    }
    
    if (!prompt.trim()) {
      setError("请输入编辑指令");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage("准备处理图片...");
    setTaskStatus("processing");
    setPollingCount(0);

    try {
      // 调用新的开始任务API
      setStatusMessage("正在启动编辑任务...");
      const startResponse = await fetch("/api/edit/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, imageUrl: uploadedImage.url }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        // 检查是否是速率限制错误
        if (startResponse.status === 429 || (errorData.error?.code === "RATE_LIMIT_EXCEEDED")) {
          throw new Error("超出 API 速率限制，请等待几分钟后再试。");
        } else {
          throw new Error(errorData.error?.message || "启动编辑任务失败");
        }
      }

      const startData = await startResponse.json();
      const newTaskId = startData.data?.taskId;
      
      if (!newTaskId) {
        throw new Error("未能获取有效的任务ID");
      }
      
      setTaskId(newTaskId);
      
      // 直接调用process API以获取结果，传递完整任务数据
      setStatusMessage("正在处理图片...");
      const processResponse = await fetch('/api/edit/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: newTaskId,
          imageId: uploadedImage.imageId,
          prompt
        })
      });
      
      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        throw new Error(errorData.error?.message || "处理图片失败");
      }
      
      const processData = await processResponse.json();
      
      if (!processData.success) {
        throw new Error(processData.error?.message || "图片处理失败");
      }
      
      // 如果处理成功但没有图片数据，开始轮询
      if (!processData.data?.processedImageData) {
        setStatusMessage("正在等待处理结果...");
        pollTaskStatus(newTaskId);
        return;
      }
      
      // 如果有图片数据，直接保存
      setStatusMessage("图片处理完成，正在保存...");
      await saveProcessedImage(newTaskId, processData.data);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理图片时发生错误");
      setTaskStatus("failed");
      setIsLoading(false);
    }
  };

  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    try {
      // 增加轮询计数
      setPollingCount(prev => prev + 1);
      
      // 首次轮询直接调用处理结果API，而不是状态API
      if (pollingCount === 0) {
        try {
          const processResponse = await fetch(`/api/edit/process-result?taskId=${taskId}`);
          
          if (!processResponse.ok) {
            if (processResponse.status === 404) {
              // 处理结果还未准备好，继续轮询
              setStatusMessage("正在处理图片，请稍候...");
              setTimeout(() => pollTaskStatus(taskId), POLLING_INTERVAL);
              return;
            }
            throw new Error("获取处理结果失败");
          }
          
          const processData = await processResponse.json();
          
          if (processData.success && processData.data) {
            // 处理成功，保存图片
            setStatusMessage("图片处理完成，正在保存...");
            await saveProcessedImage(taskId, processData.data);
            return;
          }
        } catch (error) {
          // 如果处理结果API失败，回退到状态轮询
          console.warn("获取处理结果失败，回退到状态轮询", error);
        }
      }
      
      // 正常状态轮询
      const statusResponse = await fetch(`/api/edit/status?taskId=${taskId}`);
      
      if (!statusResponse.ok) {
        throw new Error("获取任务状态失败");
      }
      
      const statusData = await statusResponse.json();
      
      // 在我们的无状态架构中，status API总是返回processing状态
      // 我们需要有一个最大尝试次数限制，避免无限轮询
      if (pollingCount >= 30) {  // 最多轮询30次，约60秒
        throw new Error("处理超时，请稍后重试");
      }
      
      // 继续轮询
      setStatusMessage(`正在处理图片 (${pollingCount}/30)...`);
      setTimeout(() => pollTaskStatus(taskId), POLLING_INTERVAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "轮询状态时发生错误");
      setIsLoading(false);
    }
  };

  // 保存处理过的图片
  const saveProcessedImage = async (taskId: string, processData: any) => {
    try {
      if (!processData.processedImageData) {
        throw new Error("处理结果中没有图片数据");
      }
      
      setStatusMessage("正在保存处理后的图片...");
      
      const saveResponse = await fetch("/api/edit/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId,
          processedImageData: processData.processedImageData,
          responseType: processData.responseType,
          imageRecord: processData.imageRecord,
          fileName: `edited_${Date.now()}.jpg`
        }),
      });
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error?.message || "保存图片失败");
      }
      
      const saveData = await saveResponse.json();
      
      if (saveData.success && saveData.data) {
        setStatusMessage("处理完成！");
        setIsLoading(false);
        
        // 调用回调函数
        if (onImageEdited) {
          onImageEdited(saveData.data.url);
        }
        
        // 保存处理结果图片
        setResultImage(saveData.data.url);
      } else {
        throw new Error("保存成功但未返回图片URL");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存图片时发生错误");
      setIsLoading(false);
    }
  };

  const extractImageIdFromUrl = async (url: string) => {
    try {
      // 对于飞书URL，可能需要向后端请求提取
      const response = await fetch(`/api/edit/extract-image-id?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        throw new Error('提取图片ID失败');
      }
      const data = await response.json();
      return data.imageId;
    } catch (error) {
      console.error('提取图片ID失败:', error);
      // 尝试从URL中直接提取
      if (url.includes('open.feishu.cn')) {
        // 尝试提取飞书图片ID
        const match = url.match(/([a-zA-Z0-9-]+)(?:\?|$)/);
        if (match && match[1]) {
          return match[1];
        }
      }
      throw new Error('无法从URL提取图片ID');
    }
  };

  // Update imageUrl when initialImageUrl changes
  useEffect(() => {
    if (initialImageUrl) {
      setImageUrl(initialImageUrl);
      setPreviewUrl(initialImageUrl);
    }
  }, [initialImageUrl]);

  // 清理预览URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>编辑图像</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <AlertCircle className="h-4 w-4" />
            <span className="font-bold">错误</span> 
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        {statusMessage && (
          <div className="mb-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative" role="alert">
            <InfoIcon className="h-4 w-4" />
            <span className="font-bold">状态</span> 
            <span className="block sm:inline">{statusMessage}</span>
          </div>
        )}
        
        {resultImage && (
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2">处理结果</h3>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <img 
                src={resultImage.startsWith('https://open.feishu.cn') 
                  ? `/api/image-proxy?url=${encodeURIComponent(resultImage)}` 
                  : resultImage} 
                alt="处理结果" 
                className="w-full h-auto" 
                onError={(e) => {
                  console.error('结果图片加载失败:', resultImage);
                  e.currentTarget.src = '/placeholder-image.svg';
                }}
              />
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          {/* 第一步：上传图片部分 */}
          <div className={`border p-4 rounded-lg ${taskStatus === 'uploaded' || taskStatus === 'processing' || taskStatus === 'completed' ? 'bg-muted' : ''}`}>
            <h3 className="text-lg font-medium mb-2">第一步：选择图片</h3>
            <div className="space-y-3">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="image-upload">上传图片</Label>
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isLoading || taskStatus === 'uploaded' || taskStatus === 'processing' || taskStatus === 'completed'}
                />
              </div>
              
              <div className="text-center my-2">
                <span className="text-sm text-gray-500">或</span>
              </div>
              
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="image-url">图片URL</Label>
                <Input
                  id="image-url"
                  type="text"
                  placeholder="输入图片URL"
                  value={imageUrl}
                  onChange={handleUrlChange}
                  disabled={isLoading || taskStatus === 'uploaded' || taskStatus === 'processing' || taskStatus === 'completed'}
                />
              </div>
              
              <Button 
                onClick={handleUploadImage} 
                disabled={isLoading || (!imageUrl && !selectedFile) || taskStatus === 'uploaded' || taskStatus === 'processing' || taskStatus === 'completed'}
                className="w-full"
              >
                {isLoading && taskStatus === 'uploading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    上传中...
                  </>
                ) : taskStatus === 'uploaded' ? (
                  <>
                    <CheckIcon className="mr-2 h-4 w-4" />
                    已上传
                  </>
                ) : (
                  "上传图片"
                )}
              </Button>
            </div>
          </div>
          
          {/* 第二步：处理图片部分 */}
          <div className={`border p-4 rounded-lg ${taskStatus !== 'uploaded' && taskStatus !== 'processing' && taskStatus !== 'completed' ? 'opacity-50' : ''}`}>
            <h3 className="text-lg font-medium mb-2">第二步：处理图片</h3>
            <div className="space-y-3">
              {uploadedImage && (
                <div className="mb-4 text-center">
                  <div className="text-sm text-green-600 mb-2">图片已上传 ✓</div>
                  <div className="rounded-lg overflow-hidden border border-gray-200 max-h-48">
                    <img 
                      src={uploadedImage.url.startsWith('https://open.feishu.cn') 
                        ? `/api/image-proxy?url=${encodeURIComponent(uploadedImage.url)}` 
                        : uploadedImage.url} 
                      alt="已上传图片" 
                      className="w-full h-auto object-contain" 
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "/placeholder-image.png";
                        console.error("图片加载失败:", uploadedImage.url);
                      }}
                    />
                  </div>
                </div>
              )}
              
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="prompt">处理指令</Label>
                <Textarea
                  id="prompt"
                  placeholder="例如：给这张人像添加漫画风格"
                  value={prompt}
                  onChange={handlePromptChange}
                  disabled={isLoading || taskStatus === 'processing' || taskStatus === 'completed' || taskStatus !== 'uploaded'}
                  className="min-h-[100px]"
                />
              </div>
              
              <Button 
                onClick={handleProcessImage} 
                disabled={isLoading || !prompt.trim() || !uploadedImage || taskStatus === 'processing' || taskStatus === 'completed'}
                className="w-full"
              >
                {isLoading && taskStatus === 'processing' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : taskStatus === 'completed' ? (
                  <>
                    <CheckIcon className="mr-2 h-4 w-4" />
                    处理完成
                  </>
                ) : (
                  "处理图片"
                )}
              </Button>
            </div>
          </div>
          
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isLoading}
            >
              重置
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}