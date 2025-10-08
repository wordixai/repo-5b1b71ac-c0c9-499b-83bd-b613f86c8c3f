import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface ProcessingSettings {
  threshold: number;
  smoothing: number;
}

const BackgroundRemover: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState<ProcessingSettings>({
    threshold: 128,
    smoothing: 2
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "错误",
        description: "请选择一个有效的图片文件",
        variant: "destructive"
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalImage(e.target?.result as string);
      setProcessedImage(null);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const removeBackground = useCallback(async () => {
    if (!originalImage || !canvasRef.current) return;

    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法获取画布上下文');

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 简单的背景移除算法
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 计算像素亮度
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
          
          // 检测边缘像素（简化的边缘检测）
          const isEdge = i > canvas.width * 4 && i < data.length - canvas.width * 4;
          
          // 如果亮度高于阈值且不是边缘，将其设为透明
          if (brightness > settings.threshold && !isEdge) {
            data[i + 3] = 0; // 设置 alpha 为 0（透明）
          } else if (brightness > settings.threshold * 0.8) {
            // 半透明处理
            data[i + 3] = Math.max(0, data[i + 3] - settings.smoothing * 20);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        setProcessedImage(canvas.toDataURL('image/png'));
        setIsProcessing(false);
        
        toast({
          title: "处理完成",
          description: "背景已成功移除",
        });
      };
      
      img.src = originalImage;
    } catch (error) {
      console.error('背景移除失败:', error);
      toast({
        title: "处理失败",
        description: "背景移除过程中出现错误",
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  }, [originalImage, settings, toast]);

  const downloadImage = useCallback(() => {
    if (!processedImage) return;

    const link = document.createElement('a');
    link.download = 'background-removed.png';
    link.href = processedImage;
    link.click();
    
    toast({
      title: "下载成功",
      description: "图片已保存到您的设备",
    });
  }, [processedImage, toast]);

  const resetImage = useCallback(() => {
    setOriginalImage(null);
    setProcessedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          AI 背景移除工具
        </h1>
        <p className="text-lg text-muted-foreground">
          轻松移除图片背景，导出透明PNG格式
        </p>
      </div>

      {!originalImage ? (
        <Card className="glass-effect border-dashed border-2 p-12 text-center">
          <div className="space-y-4">
            <Upload className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-xl font-semibold mb-2">上传图片</h3>
              <p className="text-muted-foreground mb-4">
                支持 JPG、PNG、GIF 等格式
              </p>
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                选择图片
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 原图预览 */}
          <Card className="glass-effect p-6">
            <h3 className="text-lg font-semibold mb-4">原图</h3>
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img
                src={originalImage}
                alt="原图"
                className="w-full h-full object-contain"
              />
            </div>
          </Card>

          {/* 处理后预览 */}
          <Card className="glass-effect p-6">
            <h3 className="text-lg font-semibold mb-4">处理结果</h3>
            <div className="relative aspect-square rounded-lg overflow-hidden checkerboard">
              {processedImage ? (
                <img
                  src={processedImage}
                  alt="处理后"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <p className="text-muted-foreground">等待处理...</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {originalImage && (
        <Card className="glass-effect p-6">
          <h3 className="text-lg font-semibold mb-4">处理设置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="threshold">背景检测阈值: {settings.threshold}</Label>
              <Slider
                id="threshold"
                min={50}
                max={200}
                step={1}
                value={[settings.threshold]}
                onValueChange={(value) => setSettings(prev => ({ ...prev, threshold: value[0] }))}
                className="w-full"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="smoothing">边缘平滑: {settings.smoothing}</Label>
              <Slider
                id="smoothing"
                min={0}
                max={5}
                step={1}
                value={[settings.smoothing]}
                onValueChange={(value) => setSettings(prev => ({ ...prev, smoothing: value[0] }))}
                className="w-full"
              />
            </div>
          </div>
        </Card>
      )}

      {originalImage && (
        <div className="flex flex-wrap gap-4 justify-center">
          <Button
            onClick={removeBackground}
            disabled={isProcessing}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            {isProcessing ? '处理中...' : '移除背景'}
          </Button>
          
          {processedImage && (
            <Button
              onClick={downloadImage}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              <Download className="w-4 h-4 mr-2" />
              下载图片
            </Button>
          )}
          
          <Button
            onClick={resetImage}
            variant="outline"
            className="border-red-500 text-red-600 hover:bg-red-50"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            重新开始
          </Button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default BackgroundRemover;