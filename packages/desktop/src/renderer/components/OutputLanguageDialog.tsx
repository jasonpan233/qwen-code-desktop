import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

/** 预设语言选项 */
const LANGUAGE_PRESETS = [
  { value: 'auto', label: 'Auto', description: '自动检测' },
  { value: 'Chinese', label: '中文', description: 'Chinese' },
  { value: 'English', label: 'English', description: 'English' },
  { value: 'Japanese', label: '日本語', description: 'Japanese' },
  { value: 'Russian', label: 'Русский', description: 'Russian' },
  { value: 'German', label: 'Deutsch', description: 'German' },
  { value: 'Portuguese', label: 'Português', description: 'Portuguese' },
] as const;

interface OutputLanguageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 语言变更后的回调，传回解析后的语言名 */
  onLanguageChanged?: (resolved: string) => void;
}

export function OutputLanguageDialog({
  open,
  onOpenChange,
  onLanguageChanged,
}: OutputLanguageDialogProps) {
  const [currentSetting, setCurrentSetting] = useState<string>('auto');
  const [resolvedLang, setResolvedLang] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customInput, setCustomInput] = useState('');

  // 打开弹窗时读取当前设置
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    window.electronAPI
      .getOutputLanguage()
      .then(({ setting, resolved }) => {
        setCurrentSetting(setting);
        setResolvedLang(resolved);
      })
      .catch(() => {
        // 读取失败时使用默认值
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelect = useCallback(
    async (value: string) => {
      setSaving(true);
      try {
        const result = await window.electronAPI.setOutputLanguage(value);
        if (result.success) {
          setCurrentSetting(value.toLowerCase() === 'auto' ? 'auto' : (result.resolved ?? value));
          setResolvedLang(result.resolved ?? value);
          onLanguageChanged?.(result.resolved ?? value);
          onOpenChange(false);
        }
      } catch {
        // 设置失败时静默处理
      } finally {
        setSaving(false);
      }
    },
    [onOpenChange, onLanguageChanged],
  );

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    void handleSelect(trimmed);
    setCustomInput('');
  }, [customInput, handleSelect]);

  /** 判断选项是否为当前激活项 */
  const isActive = (value: string): boolean => {
    if (value === 'auto') {
      return currentSetting.toLowerCase() === 'auto';
    }
    return currentSetting === value;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>模型输出语言</DialogTitle>
          <DialogDescription>
            设置 AI 回复使用的语言，修改后新对话生效
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 预设语言网格 */}
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGE_PRESETS.map((preset) => {
                const active = isActive(preset.value);
                return (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSelect(preset.value)}
                    className={cn(
                      'relative flex flex-col items-start rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      'disabled:pointer-events-none disabled:opacity-50',
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border',
                    )}
                  >
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {preset.value === 'auto' && resolvedLang
                        ? `${preset.description} → ${resolvedLang}`
                        : preset.description}
                    </span>
                    {active && (
                      <Check className="absolute right-2 top-2.5 h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 自定义输入区 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomSubmit();
                  }
                }}
                placeholder="输入其他语言名称..."
                className="flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                disabled={saving}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving || !customInput.trim()}
                onClick={handleCustomSubmit}
              >
                确定
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
