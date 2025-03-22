"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Upload, ImageIcon, RefreshCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 新增状态
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("pending");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [pollingCount, setPollingCount] = useState(0);
  
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

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        // 创建预览
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setImageUrl(''); // 清空URL输入，因为用户选择了上传的文件
        setError(null);
      } else {
        setError('请选择有效的图片文件（JPEG、PNG等）');
        setSelectedFile(null);
      }
    }
  };

  // 触发文件选择
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError("请输入编辑指令");
      return;
    }

    // 检查是否有图像来源（URL或上传的文件）
    if (!imageUrl && !selectedFile) {
      setError("请上传图片或输入图像网址");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage("准备处理图片...");
    setTaskStatus("pending");
    setTaskId(null);
    setPollingCount(0);

    try {
      let targetImageUrl;
      
      if (selectedFile) {
        // 如果有上传的文件，先上传图片
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', "用户上传的原始图片"); // 添加固定提示词
        
        setStatusMessage("正在上传图片...");
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
      
      // 调用新的开始任务API
      setStatusMessage("正在启动编辑任务...");
      const startResponse = await fetch("/api/edit/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, imageUrl: targetImageUrl }),
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
      
      // 设置任务ID并开始轮询
      setTaskId(newTaskId);
      setTaskStatus("processing");
      setStatusMessage("图片处理中...");
      
      // 开始轮询任务状态
      pollTaskStatus(newTaskId);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生错误");
      setIsLoading(false);
    }
  };
  
  // 轮询任务状态
  const pollTaskStatus = async (taskId: string) => {
    try {
      // 增加轮询计数
      setPollingCount(prev => prev + 1);
      
      const statusResponse = await fetch(`/api/edit/status?taskId=${taskId}`);
      
      if (!statusResponse.ok) {
        throw new Error("获取任务状态失败");
      }
      
      const statusData = await statusResponse.json();
      const currentStatus = statusData.data?.status;
      
      // 更新状态信息
      setTaskStatus(currentStatus);
      
      // 根据状态更新消息
      switch (currentStatus) {
        case "pending":
          setStatusMessage("等待处理...");
          break;
        case "processing":
          setStatusMessage("正在处理图片...");
          break;
        case "completed":
          if (statusData.data?.result?.url) {
            // 成功完成，更新图片URL
            setStatusMessage("处理完成！");
            setIsLoading(false);
            
            // 调用回调函数
            if (onImageEdited) {
              onImageEdited(statusData.data.result.url);
            }
          } else {
            throw new Error("处理完成但未返回图片URL");
          }
          return; // 完成，停止轮询
        case "failed":
          throw new Error(statusData.data?.error?.message || "图片处理失败");
        default:
          setStatusMessage(`当前状态: ${currentStatus}`);
      }
      
      // 继续轮询，除非已完成或失败
      if (currentStatus !== "completed" && currentStatus !== "failed") {
        setTimeout(() => pollTaskStatus(taskId), POLLING_INTERVAL);
      } else {
        setIsLoading(false);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "轮询状态时发生错误");
      setIsLoading(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>编辑图像</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full gap-4">
            <div className="flex flex-col space-y-2">
              {readOnlyUrl ? (
                <>
                  <Label>使用图像</Label>
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                    {previewUrl && (
                      <img
                        src={previewUrl.startsWith('https://open.feishu.cn') 
                          ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                          : previewUrl}
                        alt="要编辑的图像" 
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={(e) => {
                          console.error('图片加载失败:', previewUrl);
                          e.currentTarget.src = '/placeholder-image.svg';
                        }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    正在使用您刚才生成的图像进行编辑。
                  </p>
                </>
              ) : (
                <>
                  <Label>选择图像</Label>
                  <div className="grid gap-2">
                    {/* 图片预览区域 */}
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-md border border-dashed flex items-center justify-center"
                      onClick={handleSelectFileClick}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl.startsWith('https://open.feishu.cn') 
                            ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                            : previewUrl}
                          alt="要编辑的图像" 
                          className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('图片加载失败:', previewUrl);
                            e.currentTarget.src = '/placeholder-image.svg';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
                          <ImageIcon className="h-10 w-10 mb-2" />
                          <p>点击选择图像或拖放图片到此处</p>
                        </div>
                      )}
                    </div>
                    
                    {/* 上传按钮 */}
                    <div className="flex items-center gap-2">
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleSelectFileClick}
                        disabled={isLoading}
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        选择图片
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                    
                    {/* 可选的URL输入 */}
                    <div className="flex flex-col mt-2">
                      <p className="text-sm text-muted-foreground mb-1">或输入图像URL:</p>
                      <Input
                        id="imageUrl"
                        placeholder="输入要编辑的图像网址"
                        value={imageUrl}
                        onChange={(e) => {
                          setImageUrl(e.target.value);
                          if (e.target.value) {
                            setPreviewUrl(e.target.value);
                            setSelectedFile(null);
                          }
                        }}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="prompt">修改指令</Label>
              <Textarea
                id="prompt"
                placeholder="输入描述你想要的图像的文本..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                className="min-h-32 resize-none"
              />
            </div>
            
            {/* 新增：处理状态和进度显示 */}
            {isLoading && (
              <div className="flex flex-col space-y-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{statusMessage}</span>
                  <span className="text-xs text-muted-foreground">
                    {taskStatus === "processing" && `轮询中 (${pollingCount})`}
                  </span>
                </div>
                <Progress value={taskStatus === "completed" ? 100 : pollingCount * 5} />
              </div>
            )}
            
            {error && (
              <div className="text-red-500 text-sm mt-2">{error}</div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "编辑中..." : "编辑图像"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}