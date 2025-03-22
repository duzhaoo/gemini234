"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

interface ImageDisplayProps {
  imageUrl: string | null;
  isVercelEnv?: boolean;
}

export function ImageDisplay({ imageUrl, isVercelEnv }: ImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
      
      // 检查是否是飞书URL
      const isFeishuUrl = imageUrl.includes('open.feishu.cn');
      
      // 检查是否是本地URL
      const isLocalUrl = imageUrl.startsWith('/');
      
      // 检查是否在Vercel环境中（通过props或window.location）
      const isVercelEnvironment = isVercelEnv || 
        (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app'));
      
      // 在Vercel环境中，如果是本地URL，这将无法工作
      if (isVercelEnvironment && isLocalUrl) {
        console.error('在Vercel环境中检测到本地URL，这无法正常工作:', imageUrl);
        // 设置一个占位图像
        setImgSrc('/placeholder-image.svg');
        setIsLoading(false);
        return;
      }
      
      // 如果是飞书URL，使用代理
      if (isFeishuUrl) {
        setImgSrc(`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`);
      } else {
        setImgSrc(imageUrl);
      }
    }
  }, [imageUrl, isVercelEnv]);

  if (!imageUrl) {
    return (
      <Card className="w-full h-[400px] flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No image generated yet</p>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-0">
        <div className="relative w-full h-[400px]">
          {/* 使用原生img标签显示所有图片 */}
          {imgSrc && (
            <img
              src={imgSrc}
              alt="Generated image"
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={() => setIsLoading(false)}
              onError={(e) => {
                console.error('图片加载失败:', imgSrc);
                e.currentTarget.src = '/placeholder-image.svg';
                setIsLoading(false);
              }}
            />
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <p>Loading image...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}