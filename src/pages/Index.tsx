import BackgroundRemover from '@/components/BackgroundRemover';
import { Toaster } from '@/components/ui/toaster';

const Index = () => {
  return (
    <div className="min-h-screen py-8">
      <BackgroundRemover />
      <Toaster />
    </div>
  );
};

export default Index;