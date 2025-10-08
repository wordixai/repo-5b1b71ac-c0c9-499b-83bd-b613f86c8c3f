import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface ProcessingSettings {
  colorTolerance: number;
  edgeDetection: number;
  feathering: number;
}

const BackgroundRemover: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState<ProcessingSettings>({
    colorTolerance: 30,
    edgeDetection: 5,
    feathering: 2
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

  // 计算两个颜色之间的距离
  const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number => {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  };

  // 获取图像边缘像素的主要颜色（作为背景色）
  const getBackgroundColors = (imageData: ImageData): Array<{r: number, g: number, b: number}> => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const colors: Array<{r: number, g: number, b: number, count: number}> = [];
    
    // 采样边缘像素
    const samplePixels = [];
    
    // 上边缘和下边缘
    for (let x = 0; x < width; x += 5) {
      samplePixels.push({x, y: 0});
      samplePixels.push({x, y: height - 1});
    }
    
    // 左边缘和右边缘
    for (let y = 0; y < height; y += 5) {
      samplePixels.push({x: 0, y});
      samplePixels.push({x: width - 1, y});
    }
    
    // 统计颜色
    samplePixels.forEach(({x, y}) => {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      // 查找相似颜色
      let found = false;
      for (let color of colors) {
        if (colorDistance(r, g, b, color.r, color.g, color.b) < 30) {
          color.count++;
          found = true;
          break;
        }
      }
      
      if (!found) {
        colors.push({r, g, b, count: 1});
      }
    });
    
    // 返回最常见的几种颜色
    return colors
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(({r, g, b}) => ({r, g, b}));
  };

  // 边缘检测
  const detectEdges = (imageData: ImageData, threshold: number): boolean[] => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const edges = new Array(width * height).fill(false);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const pixelIdx = idx * 4;
        
        // Sobel 边缘检测
        const gx = 
          -1 * data[((y-1) * width + (x-1)) * 4] + 1 * data[((y-1) * width + (x+1)) * 4] +
          -2 * data[(y * width + (x-1)) * 4] + 2 * data[(y * width + (x+1)) * 4] +
          -1 * data[((y+1) * width + (x-1)) * 4] + 1 * data[((y+1) * width + (x+1)) * 4];
          
        const gy =
          -1 * data[((y-1) * width + (x-1)) * 4] + -2 * data[((y-1) * width + x) * 4] + -1 * data[((y-1) * width + (x+1)) * 4] +
          1 * data[((y+1) * width + (x-1)) * 4] + 2 * data[((y+1) * width + x) * 4] + 1 * data[((y+1) * width + (x+1)) * 4];
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = magnitude > threshold;
      }
    }
    
    return edges;
  };

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
        const width = canvas.width;
        const height = canvas.height;

        // 获取背景颜色
        const backgroundColors = getBackgroundColors(imageData);
        console.log('检测到的背景色:', backgroundColors);

        // 边缘检测
        const edges = detectEdges(imageData, settings.edgeDetection * 10);

        // 创建alpha通道
        const alphaChannel = new Array(width * height).fill(255);

        // 第一步：基于颜色相似度移除背景
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const pixelIdx = idx * 4;
            
            const r = data[pixelIdx];
            const g = data[pixelIdx + 1];
            const b = data[pixelIdx + 2];

            // 检查是否与背景色相似
            let isBackground = false;
            for (let bgColor of backgroundColors) {
              const distance = colorDistance(r, g, b, bgColor.r, bgColor.g, bgColor.b);
              if (distance < settings.colorTolerance) {
                isBackground = true;
                break;
              }
            }

            // 如果是背景色且不在边缘附近
            if (isBackground && !edges[idx]) {
              alphaChannel[idx] = 0;
            }
            // 如果接近背景色，设置半透明
            else if (isBackground) {
              alphaChannel[idx] = Math.floor(255 * 0.3);
            }
          }
        }

        // 第二步：羽化处理
        if (settings.feathering > 0) {
          const featherRadius = settings.feathering;
          const newAlpha = [...alphaChannel];
          
          for (let y = featherRadius; y < height - featherRadius; y++) {
            for (let x = featherRadius; x < width - featherRadius; x++) {
              const idx = y * width + x;
              
              if (alphaChannel[idx] === 0) {
                // 对周围像素进行羽化
                for (let dy = -featherRadius; dy <= featherRadius; dy++) {
                  for (let dx = -featherRadius; dx <= featherRadius; dx++) {
                    const neighborIdx = (y + dy) * width + (x + dx);
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance <= featherRadius && alphaChannel[neighborIdx] > 0) {
                      const fadeAmount = 1 - (distance / featherRadius);
                      newAlpha[neighborIdx] = Math.min(
                        newAlpha[neighborIdx],
                        Math.floor(255 * fadeAmount)
                      );
                    }
                  }
                }
              }
            }
          }
          
          alphaChannel.splice(0, alphaChannel.length, ...newAlpha);
        }

        // 应用alpha通道
        for (let i = 0; i < alphaChannel.length; i++) {
          data[i * 4 + 3] = alphaChannel[i];
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
          智能识别并移除图片背景，导出透明PNG格式
        </p>
      </div>

      {!originalImage ? (
        <Card className="glass-effect border-dashed border-2 p-12 text-center">
          <div className="space-y-4">
            <Upload className="w-16 h-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-xl font-semibold mb-2">上传图片</h3>
              <p className="text-muted-foreground mb-4">
                支持 JPG、PNG、GIF 等格式，建议选择背景色单一的图片
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <Label htmlFor="colorTolerance">颜色容差: {settings.colorTolerance}</Label>
              <Slider
                id="colorTolerance"
                min={10}
                max={100}
                step={5}
                value={[settings.colorTolerance]}
                onValueChange={(value) => setSettings(prev => ({ ...prev, colorTolerance: value[0] }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">值越大，移除的背景范围越广</p>
            </div>
            <div className="space-y-3">
              <Label htmlFor="edgeDetection">边缘检测: {settings.edgeDetection}</Label>
              <Slider
                id="edgeDetection"
                min={1}
                max={10}
                step={1}
                value={[settings.edgeDetection]}
                onValueChange={(value) => setSettings(prev => ({ ...prev, edgeDetection: value[0] }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">保护主体边缘不被误删</p>
            </div>
            <div className="space-y-3">
              <Label htmlFor="feathering">边缘羽化: {settings.feathering}</Label>
              <Slider
                id="feathering"
                min={0}
                max={5}
                step={1}
                value={[settings.feathering]}
                onValueChange={(value) => setSettings(prev => ({ ...prev, feathering: value[0] }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">让边缘更自然平滑</p>
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
            {isProcessing ? '处理中...' : '智能移除背景'}
          </Button>
          
          {processedImage && (
            <Button
              onClick={downloadImage}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              <Download className="w-4 h-4 mr-2" />
              下载透明图片
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
      
      <Card className="glass-effect p-4">
        <h4 className="font-semibold mb-2">使用提示：</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• 选择背景色单一、对比度高的图片效果最佳</li>
          <li>• 如果背景没有完全移除，可以调高"颜色容差"参数</li>
          <li>• 如果主体被误删，可以调低"颜色容差"或调高"边缘检测"</li>
          <li>• 使用"边缘羽化"让切割边缘更自然</li>
        </ul>
      </Card>
    </div>
  );
};

export default BackgroundRemover;