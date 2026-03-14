import { useState, useEffect, useCallback } from 'react';
import {
  LogIn,
  Key,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Separator } from '@renderer/components/ui/separator';

const MODEL_PROVIDERS_DOCUMENTATION_URL =
  'https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/#modelproviders';

/** 认证主菜单选项 */
interface AuthMainOption {
  key: string;
  label: string;
  description: string;
}

/** API-KEY 子菜单选项 */
interface ApiKeySubOption {
  key: string;
  label: string;
  description: string;
  region?: string;
}

/** OAuth 事件数据（从 stream event 中过滤） */
interface OAuthEventData {
  status:
    | 'requesting'
    | 'showing_uri'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'cancelled';
  verificationUri?: string;
  verificationUriComplete?: string;
  userCode?: string;
  expiresIn?: number;
  message?: string;
}

/** OAuth 流程状态 */
type OAuthState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | {
      phase: 'showing_uri';
      verificationUri: string;
      verificationUriComplete: string;
      userCode: string;
      expiresIn: number;
    }
  | { phase: 'polling' }
  | { phase: 'success' }
  | { phase: 'error'; message: string };

/** 视图层级（对齐 CLI 的 ViewLevel） */
type ViewLevel = 'main' | 'api-key-sub' | 'coding-plan-input' | 'custom-info';

export interface LoginDialogProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose?: () => void;
  allowClose?: boolean;
}

export function LoginDialog({
  isOpen,
  onSuccess,
  onClose,
  allowClose = false,
}: LoginDialogProps) {
  // 两级菜单数据
  const [mainOptions, setMainOptions] = useState<AuthMainOption[]>([]);
  const [apiKeySubOptions, setApiKeySubOptions] = useState<ApiKeySubOption[]>(
    [],
  );

  // 导航状态
  const [viewLevel, setViewLevel] = useState<ViewLevel>('main');
  const [selectedMainKey, setSelectedMainKey] = useState<string>('qwen-oauth');
  const [selectedSubKey, setSelectedSubKey] = useState<string>('');
  const [codingPlanRegion, setCodingPlanRegion] = useState<
    'china' | 'global'
  >('china');

  // 表单状态
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthState, setOAuthState] = useState<OAuthState>({ phase: 'idle' });
  const [copied, setCopied] = useState(false);

  // 加载支持的认证类型（两级结构）
  useEffect(() => {
    if (!isOpen) return;
    window.electronAPI
      .getAuthTypes()
      .then((result) => {
        setMainOptions(result.mainOptions);
        setApiKeySubOptions(result.apiKeySubOptions);
      })
      .catch(() => {
        // ignore
      });
  }, [isOpen]);

  // 打开时重置视图状态
  useEffect(() => {
    if (isOpen) {
      setViewLevel('main');
      setSelectedMainKey('qwen-oauth');
      setSelectedSubKey('');
      setApiKey('');
      setError(null);
      setOAuthState({ phase: 'idle' });
      setLoading(false);
      setCopied(false);
    }
  }, [isOpen]);

  // 监听 OAuth 事件
  useEffect(() => {
    const cleanup = window.electronAPI.onStreamEvent((event: unknown) => {
      const evt = event as { type: string; data: OAuthEventData };
      if (evt.type !== 'auth-oauth-event') return;

      const data = evt.data;
      switch (data.status) {
        case 'showing_uri':
          setOAuthState({
            phase: 'showing_uri',
            verificationUri: data.verificationUri ?? '',
            verificationUriComplete: data.verificationUriComplete ?? '',
            userCode: data.userCode ?? '',
            expiresIn: data.expiresIn ?? 0,
          });
          break;
        case 'polling':
          setOAuthState({ phase: 'polling' });
          break;
        case 'success':
          setOAuthState({ phase: 'success' });
          break;
        case 'error':
        case 'timeout':
          setOAuthState({
            phase: 'error',
            message: data.message ?? '认证失败',
          });
          setLoading(false);
          break;
        case 'cancelled':
          setOAuthState({ phase: 'idle' });
          setLoading(false);
          break;
        default:
          break;
      }
    });
    return cleanup;
  }, []);

  // --- 事件处理 ---

  const handleMainSelect = useCallback(
    (key: string) => {
      if (loading) return;
      setError(null);
      setOAuthState({ phase: 'idle' });
      setSelectedMainKey(key);

      if (key === 'api-key') {
        setViewLevel('api-key-sub');
      }
      // qwen-oauth 直接在当前视图处理
    },
    [loading],
  );

  const handleApiKeySubSelect = useCallback(
    (option: ApiKeySubOption) => {
      if (loading) return;
      setError(null);
      setSelectedSubKey(option.key);

      if (option.key === 'custom') {
        setViewLevel('custom-info');
      } else {
        // coding-plan or coding-plan-intl
        setCodingPlanRegion(
          (option.region as 'china' | 'global') || 'china',
        );
        setViewLevel('coding-plan-input');
      }
    },
    [loading],
  );

  const handleGoBack = useCallback(() => {
    setError(null);
    setOAuthState({ phase: 'idle' });

    if (viewLevel === 'api-key-sub') {
      setViewLevel('main');
    } else if (
      viewLevel === 'coding-plan-input' ||
      viewLevel === 'custom-info'
    ) {
      setViewLevel('api-key-sub');
    }
  }, [viewLevel]);

  const handleQwenOAuthSubmit = useCallback(async () => {
    setError(null);
    setLoading(true);
    setOAuthState({ phase: 'requesting' });

    try {
      const result = await window.electronAPI.startAuth('qwen-oauth');
      if (result.success) {
        setOAuthState({ phase: 'success' });
        setTimeout(() => {
          onSuccess();
        }, 800);
      } else {
        setError(result.error ?? '认证失败');
        setOAuthState({
          phase: 'error',
          message: result.error ?? '认证失败',
        });
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOAuthState({ phase: 'error', message });
      setLoading(false);
    }
  }, [onSuccess]);

  const handleCodingPlanSubmit = useCallback(async () => {
    setError(null);

    if (!apiKey.trim()) {
      setError('API Key 不能为空。');
      return;
    }

    setLoading(true);

    try {
      const result = await window.electronAPI.startCodingPlanAuth({
        apiKey: apiKey.trim(),
        region: codingPlanRegion,
      });
      if (result.success) {
        setTimeout(() => {
          onSuccess();
        }, 800);
      } else {
        setError(result.error ?? '认证失败');
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLoading(false);
    }
  }, [apiKey, codingPlanRegion, onSuccess]);

  const handleCancelOAuth = useCallback(() => {
    window.electronAPI.cancelOAuth();
    setOAuthState({ phase: 'idle' });
    setLoading(false);
  }, []);

  const handleCopyUserCode = useCallback(() => {
    if (oauthState.phase === 'showing_uri') {
      navigator.clipboard.writeText(oauthState.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [oauthState]);

  const isOAuthInProgress =
    selectedMainKey === 'qwen-oauth' &&
    (oauthState.phase === 'requesting' ||
      oauthState.phase === 'showing_uri' ||
      oauthState.phase === 'polling');

  // --- 渲染各视图 ---

  const renderMainView = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">
          您希望如何为此项目进行身份验证？
        </label>
        <div className="grid grid-cols-1 gap-2">
          {mainOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => handleMainSelect(option.key)}
              disabled={loading}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                selectedMainKey === option.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              {option.key === 'qwen-oauth' ? (
                <Globe className="h-4 w-4 shrink-0" />
              ) : (
                <Key className="h-4 w-4 shrink-0" />
              )}
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Qwen OAuth 区域 */}
      {selectedMainKey === 'qwen-oauth' && (
        <>
          <Separator />
          <div className="space-y-3">
            {oauthState.phase === 'idle' && (
              <p className="text-xs text-muted-foreground">
                点击下方按钮将启动 Qwen OAuth 设备授权流程，
                系统会自动打开浏览器进行授权。
              </p>
            )}

            {oauthState.phase === 'requesting' && (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在请求设备授权...</span>
              </div>
            )}

            {(oauthState.phase === 'showing_uri' ||
              oauthState.phase === 'polling') && (
              <div className="space-y-3">
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                  <p className="mb-2 text-sm font-medium">
                    请在浏览器中完成授权
                  </p>
                  {oauthState.phase === 'showing_uri' &&
                    oauthState.userCode && (
                      <div className="mb-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          您的授权码：
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-muted px-3 py-2 text-center font-mono text-lg font-bold tracking-widest">
                            {oauthState.userCode}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={handleCopyUserCode}
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  {oauthState.phase === 'showing_uri' && (
                    <a
                      href={oauthState.verificationUriComplete}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      在浏览器中打开授权页面
                    </a>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>等待授权完成...</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelOAuth}
                >
                  取消授权
                </Button>
              </div>
            )}

            {oauthState.phase === 'success' && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>认证成功，正在跳转...</span>
              </div>
            )}

            {oauthState.phase === 'error' && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{oauthState.message}</span>
              </div>
            )}

            {/* 提交按钮 */}
            {!isOAuthInProgress && oauthState.phase !== 'success' && (
              <Button
                onClick={handleQwenOAuthSubmit}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    认证中...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    使用 Qwen 账号登录
                  </>
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderApiKeySubView = () => (
    <div className="space-y-4">
      <button
        onClick={handleGoBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          选择 API-KEY 配置模式：
        </label>
        <div className="grid grid-cols-1 gap-2">
          {apiKeySubOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => handleApiKeySubSelect(option)}
              disabled={loading}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                selectedSubKey === option.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              {option.key === 'custom' ? (
                <Settings className="h-4 w-4 shrink-0" />
              ) : (
                <Key className="h-4 w-4 shrink-0" />
              )}
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCodingPlanInputView = () => (
    <div className="space-y-4">
      <button
        onClick={handleGoBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="api-key">
          Coding Plan API Key
        </label>
        <p className="text-xs text-muted-foreground">
          粘贴百炼 Coding Plan 的 API Key 即可完成配置。
        </p>
        <Input
          id="api-key"
          type="password"
          placeholder="输入您的 API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apiKey.trim()) {
              void handleCodingPlanSubmit();
            }
          }}
        />
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={handleCodingPlanSubmit}
        disabled={loading || !apiKey.trim()}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            认证中...
          </>
        ) : (
          <>
            <Key className="mr-2 h-4 w-4" />
            登录
          </>
        )}
      </Button>
    </div>
  );

  const renderCustomInfoView = () => (
    <div className="space-y-4">
      <button
        onClick={handleGoBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">自定义 API-KEY 配置</h3>
        <p className="text-sm text-muted-foreground">
          适合高级用户手动配置模型提供商。
        </p>
        <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">请在 settings.json 中配置您的模型：</p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>
              通过环境变量设置 API Key（例如 OPENAI_API_KEY）
            </li>
            <li>
              在 modelProviders[&apos;openai&apos;]（或其他认证类型）中添加模型配置
            </li>
            <li>
              每个提供商需要：id、envKey（必需），以及可选的 baseUrl、generationConfig
            </li>
            <li>
              支持的认证类型：openai、anthropic、gemini、vertex-ai 等
            </li>
          </ol>
        </div>
        <a
          href={MODEL_PROVIDERS_DOCUMENTATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline"
        >
          <ExternalLink className="h-3 w-3" />
          查看完整配置文档
        </a>
      </div>
    </div>
  );

  const getViewTitle = () => {
    switch (viewLevel) {
      case 'main':
        return '开始使用';
      case 'api-key-sub':
        return 'API-KEY 配置';
      case 'coding-plan-input':
        return 'Coding Plan 设置';
      case 'custom-info':
        return '自定义配置';
      default:
        return '开始使用';
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && allowClose && onClose) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="w-full max-w-lg"
        onInteractOutside={(e) => {
          if (!allowClose) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (!allowClose) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="text-center items-center">
          <LogIn className="mb-2 h-10 w-10 text-primary" />
          <DialogTitle className="text-2xl">Qwen Code Desktop</DialogTitle>
          <DialogDescription>{getViewTitle()}</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {viewLevel === 'main' && renderMainView()}
          {viewLevel === 'api-key-sub' && renderApiKeySubView()}
          {viewLevel === 'coding-plan-input' && renderCodingPlanInputView()}
          {viewLevel === 'custom-info' && renderCustomInfoView()}

          {/* 全局错误信息（非 OAuth 和非 Coding Plan 视图时显示） */}
          {error &&
            viewLevel === 'main' &&
            selectedMainKey !== 'qwen-oauth' && (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
