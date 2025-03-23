"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ImageDisplayProps {
  imageUrl: string | null;
  isVercelEnv?: boolean;
}

export function ImageDisplay({ imageUrl, isVercelEnv }: ImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // 添加重试计数器
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
      setLoadError(false);
      // 重置重试计数
      retryCountRef.current = 0;
      
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
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
        console.log('使用代理URL:', proxyUrl);
        setImgSrc(proxyUrl);
      } else {
        console.log('使用原始URL:', imageUrl);
        setImgSrc(imageUrl);
      }
    } else {
      // 无图片URL时重置状态
      setImgSrc(null);
      setIsLoading(false);
      setLoadError(false);
    }
  }, [imageUrl, isVercelEnv]);

  // 处理重试逻辑的函数
  const handleRetry = (src: string) => {
    if (retryCountRef.current < 1) { // 只重试一次
      retryCountRef.current += 1;
      console.log(`重试加载图片 (${retryCountRef.current}/1): ${src}`);
      
      // 添加时间戳参数避免缓存
      const timestamp = new Date().getTime();
      return src.includes('?') 
        ? `${src}&_retry=${timestamp}` 
        : `${src}?_retry=${timestamp}`;
    }
    
    // 达到最大重试次数
    console.log('达到最大重试次数，使用占位图片');
    setLoadError(true);
    return '/placeholder-image.svg';
  };

  if (!imageUrl) {
    return (
      <Card className="w-full h-[400px] flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">暂无图片</p>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-0">
        <div className="relative w-full h-[400px]">
          {imgSrc && (
            <img
              src={imgSrc}
              alt="Generated image"
              className={`absolute inset-0 w-full h-full object-contain ${loadError ? 'opacity-70' : ''}`}
              onLoad={() => {
                console.log('图片加载成功:', imgSrc);
                setIsLoading(false);
                setLoadError(false);
              }}
              onError={(e) => {
                console.error('图片加载失败:', imgSrc);
                
                // 获取当前图片来源
                const currentSrc = e.currentTarget.src;
                
                // 如果当前来源已经是占位图片，不要再重试
                if (currentSrc.includes('/placeholder-image.svg')) {
                  setIsLoading(false);
                  setLoadError(true);
                  return;
                }
                
                // 应用重试逻辑
                const retrySrc = handleRetry(currentSrc);
                
                // 如果返回的是占位图片，表示已达到最大重试次数
                if (retrySrc.includes('/placeholder-image.svg')) {
                  setIsLoading(false);
                }
                
                // 设置新的源
                e.currentTarget.src = retrySrc;
              }}
            />
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <p>加载图片中...</p>
            </div>
          )}
          {loadError && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <p className="text-destructive">图片加载失败</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}