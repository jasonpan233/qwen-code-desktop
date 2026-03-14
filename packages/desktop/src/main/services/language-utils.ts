/**
 * 输出语言工具函数 — 从 CLI languageUtils.ts 和 languages.ts 移植。
 *
 * 管理 ~/.qwen/output-language.md 规则文件的生成与更新，
 * 以及 ~/.qwen/settings.json 中 general.outputLanguage 的读写。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '@qwen-code/qwen-code-core';
import stripJsonComments from 'strip-json-comments';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const LLM_OUTPUT_LANGUAGE_RULE_FILENAME = 'output-language.md';
const LLM_OUTPUT_LANGUAGE_MARKER_PREFIX = 'qwen-code:llm-output-language:';

/** 特殊值：从系统设置自动检测 */
export const OUTPUT_LANGUAGE_AUTO = 'auto';

/** 支持的语言定义列表（对齐 CLI languages.ts） */
export interface LanguageDefinition {
  code: string;
  id: string;
  fullName: string;
  nativeName?: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: 'en', id: 'en-US', fullName: 'English', nativeName: 'English' },
  { code: 'zh', id: 'zh-CN', fullName: 'Chinese', nativeName: '中文' },
  { code: 'ru', id: 'ru-RU', fullName: 'Russian', nativeName: 'Русский' },
  { code: 'de', id: 'de-DE', fullName: 'German', nativeName: 'Deutsch' },
  { code: 'ja', id: 'ja-JP', fullName: 'Japanese', nativeName: '日本語' },
  { code: 'pt', id: 'pt-BR', fullName: 'Portuguese', nativeName: 'Português' },
];

// ---------------------------------------------------------------------------
// 语言检测与解析
// ---------------------------------------------------------------------------

/** 将 locale code 映射为英文语言名 */
export function getLanguageNameFromLocale(locale: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === locale);
  return lang?.fullName || 'English';
}

/** 检测系统语言，返回 locale code（如 'en'、'zh'） */
function detectSystemLanguage(): string {
  const envLang = process.env['QWEN_CODE_LANG'] || process.env['LANG'] || '';
  if (envLang) {
    const lower = envLang.toLowerCase();
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lower.startsWith(lang.code)) {
        return lang.code;
      }
    }
  }
  // 回退：使用 Intl
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const prefix = locale.split('-')[0].toLowerCase();
    for (const lang of SUPPORTED_LANGUAGES) {
      if (prefix === lang.code) {
        return lang.code;
      }
    }
  } catch {
    // ignore
  }
  return 'en';
}

/** 检查值是否为 "auto" */
export function isAutoLanguage(value: string | undefined | null): boolean {
  return !value || value.toLowerCase() === OUTPUT_LANGUAGE_AUTO;
}

/**
 * 将语言输入正规化为标准名称。
 * 已知 locale code（如 "zh"）会转为完整名称（如 "Chinese"），
 * 未知输入原样返回以支持任意语言名。
 */
export function normalizeOutputLanguage(language: string): string {
  const lowered = language.toLowerCase();
  const fullName = getLanguageNameFromLocale(lowered);
  if (fullName !== 'English' || lowered === 'en') {
    return fullName;
  }
  return language;
}

/** 解析输出语言：auto 转为检测到的系统语言 */
export function resolveOutputLanguage(
  value: string | undefined | null,
): string {
  if (isAutoLanguage(value)) {
    const detectedLocale = detectSystemLanguage();
    return getLanguageNameFromLocale(detectedLocale);
  }
  return normalizeOutputLanguage(value!);
}

// ---------------------------------------------------------------------------
// output-language.md 文件操作
// ---------------------------------------------------------------------------

function getOutputLanguageFilePath(): string {
  return path.join(
    Storage.getGlobalQwenDir(),
    LLM_OUTPUT_LANGUAGE_RULE_FILENAME,
  );
}

function sanitizeForMarker(language: string): string {
  return language
    .replace(/[\r\n]/g, ' ')
    .replace(/--!?>/g, '')
    .replace(/--/g, '');
}

function generateOutputLanguageFileContent(language: string): string {
  const safeLanguage = sanitizeForMarker(language);
  return `# Output language preference: ${language}
<!-- ${LLM_OUTPUT_LANGUAGE_MARKER_PREFIX} ${safeLanguage} -->

## Goal
Prefer responding in **${language}** for normal assistant messages and explanations.

## Keep technical artifacts unchanged
Do **not** translate or rewrite:
- Code blocks, CLI commands, file paths, stack traces, logs, JSON keys, identifiers
- Exact quoted text from the user (keep quotes verbatim)

## When a conflict exists
If higher-priority instructions (system/developer) require a different behavior, follow them.

## Tool / system outputs
Raw tool/system outputs may contain fixed-format English. Preserve them verbatim, and if needed, add a short **${language}** explanation below.
`;
}

/** 写入 output-language.md 规则文件 */
export function writeOutputLanguageFile(language: string): void {
  const filePath = getOutputLanguageFilePath();
  const content = generateOutputLanguageFileContent(language);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** 根据设置值更新规则文件（auto 会先解析为具体语言） */
export function updateOutputLanguageFile(settingValue: string): void {
  const resolved = resolveOutputLanguage(settingValue);
  writeOutputLanguageFile(resolved);
}

// ---------------------------------------------------------------------------
// settings.json 读写
// ---------------------------------------------------------------------------

type AnySettings = Record<string, unknown>;

function readSettingsFile(filePath: string): AnySettings {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(stripJsonComments(content));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as AnySettings;
      }
    }
  } catch {
    // 静默忽略
  }
  return {};
}

function writeSettingsFile(filePath: string, settings: AnySettings): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}

/** 从 ~/.qwen/settings.json 读取 general.outputLanguage */
export function readCurrentOutputLanguageSetting(): string {
  const settingsPath = Storage.getGlobalSettingsPath();
  const settings = readSettingsFile(settingsPath);
  const general = settings['general'] as AnySettings | undefined;
  return (general?.['outputLanguage'] as string) || OUTPUT_LANGUAGE_AUTO;
}

/** 写入 general.outputLanguage 到 ~/.qwen/settings.json */
export function saveOutputLanguageSetting(value: string): void {
  const settingsPath = Storage.getGlobalSettingsPath();
  const settings = readSettingsFile(settingsPath);
  if (!settings['general'] || typeof settings['general'] !== 'object') {
    settings['general'] = {};
  }
  (settings['general'] as AnySettings)['outputLanguage'] = value;
  writeSettingsFile(settingsPath, settings);
}
