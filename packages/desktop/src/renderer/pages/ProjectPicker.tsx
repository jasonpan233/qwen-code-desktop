import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FolderOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { Spinner } from '@renderer/components/ui/spinner';

export function ProjectPicker() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSelectFolder = async () => {
    const folder = await window.electronAPI.openFolder();
    if (folder) {
      setLoading(true);
      try {
        const result = await window.electronAPI.initializeApp(folder);
        if (result.success) {
          navigate('/chat');
        } else {
          // eslint-disable-next-line no-console
          console.error('Failed to initialize app:', result.error);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUseDefault = async () => {
    setLoading(true);
    try {
      const defaultCwd = process.cwd();
      const result = await window.electronAPI.initializeApp(defaultCwd);
      if (result.success) {
        navigate('/chat');
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize app with default directory:', result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <CardTitle>选择项目目录</CardTitle>
          <CardDescription>
            Qwen Code 需要访问您的项目目录以提供代码相关的帮助。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={handleSelectFolder} className="w-full" disabled={loading}>
            {loading ? <Spinner className="mr-2 h-4 w-4" /> : <FolderOpen className="mr-2 h-4 w-4" />}
            {loading ? '正在初始化...' : '选择文件夹'}
          </Button>
          <Button variant="outline" onClick={handleUseDefault} className="w-full" disabled={loading}>
            {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {loading ? '正在初始化...' : '使用默认目录'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
