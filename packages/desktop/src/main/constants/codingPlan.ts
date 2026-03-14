/**
 * Coding Plan 常量和配置（从 CLI 复制，供 Desktop 独立使用）
 *
 * 此文件是 packages/cli/src/constants/codingPlan.ts 的副本。
 * 如果 CLI 侧的模板有更新，需要同步更新此文件。
 */

import { createHash } from 'node:crypto';
import type { ProviderModelConfig as ModelConfig } from '@qwen-code/qwen-code-core';

/**
 * Coding plan regions
 */
export enum CodingPlanRegion {
  CHINA = 'china',
  GLOBAL = 'global',
}

/**
 * Coding plan template - array of model configurations
 */
export type CodingPlanTemplate = ModelConfig[];

/**
 * Environment variable key for storing the coding plan API key.
 * Unified key for both regions since they are mutually exclusive.
 */
export const CODING_PLAN_ENV_KEY = 'BAILIAN_CODING_PLAN_API_KEY';

/**
 * Computes the version hash for the coding plan template.
 */
export function computeCodingPlanVersion(template: CodingPlanTemplate): string {
  const templateString = JSON.stringify(template);
  return createHash('sha256').update(templateString).digest('hex');
}

/**
 * Generate the complete coding plan template for a specific region.
 */
export function generateCodingPlanTemplate(
  region: CodingPlanRegion,
): CodingPlanTemplate {
  if (region === CodingPlanRegion.CHINA) {
    return [
      {
        id: 'qwen3.5-plus',
        name: '[Bailian Coding Plan] qwen3.5-plus',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
      {
        id: 'qwen3-coder-plus',
        name: '[Bailian Coding Plan] qwen3-coder-plus',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
      },
      {
        id: 'qwen3-coder-next',
        name: '[Bailian Coding Plan] qwen3-coder-next',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
      },
      {
        id: 'qwen3-max-2026-01-23',
        name: '[Bailian Coding Plan] qwen3-max-2026-01-23',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
      {
        id: 'glm-4.7',
        name: '[Bailian Coding Plan] glm-4.7',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
      {
        id: 'glm-5',
        name: '[Bailian Coding Plan] glm-5',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
      {
        id: 'MiniMax-M2.5',
        name: '[Bailian Coding Plan] MiniMax-M2.5',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
      {
        id: 'kimi-k2.5',
        name: '[Bailian Coding Plan] kimi-k2.5',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
        envKey: CODING_PLAN_ENV_KEY,
        generationConfig: {
          extra_body: {
            enable_thinking: true,
          },
        },
      },
    ];
  }

  // Global region
  return [
    {
      id: 'qwen3.5-plus',
      name: '[Bailian Coding Plan for Global/Intl] qwen3.5-plus',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
    {
      id: 'qwen3-coder-plus',
      name: '[Bailian Coding Plan for Global/Intl] qwen3-coder-plus',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
    },
    {
      id: 'qwen3-coder-next',
      name: '[Bailian Coding Plan for Global/Intl] qwen3-coder-next',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
    },
    {
      id: 'qwen3-max-2026-01-23',
      name: '[Bailian Coding Plan for Global/Intl] qwen3-max-2026-01-23',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
    {
      id: 'glm-4.7',
      name: '[Bailian Coding Plan for Global/Intl] glm-4.7',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
    {
      id: 'glm-5',
      name: '[Bailian Coding Plan for Global/Intl] glm-5',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
    {
      id: 'MiniMax-M2.5',
      name: '[Bailian Coding Plan for Global/Intl] MiniMax-M2.5',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
    {
      id: 'kimi-k2.5',
      name: '[Bailian Coding Plan for Global/Intl] kimi-k2.5',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      envKey: CODING_PLAN_ENV_KEY,
      generationConfig: {
        extra_body: {
          enable_thinking: true,
        },
      },
    },
  ];
}

/**
 * Get the complete configuration for a specific region.
 */
export function getCodingPlanConfig(region: CodingPlanRegion) {
  const template = generateCodingPlanTemplate(region);
  const baseUrl =
    region === CodingPlanRegion.CHINA
      ? 'https://coding.dashscope.aliyuncs.com/v1'
      : 'https://coding-intl.dashscope.aliyuncs.com/v1';
  const regionName =
    region === CodingPlanRegion.CHINA
      ? 'Coding Plan (Bailian, China)'
      : 'Coding Plan (Bailian, Global/Intl)';

  return {
    template,
    baseUrl,
    regionName,
    version: computeCodingPlanVersion(template),
  };
}

/**
 * Check if a config belongs to Coding Plan (any region).
 */
export function isCodingPlanConfig(
  baseUrl: string | undefined,
  envKey: string | undefined,
): CodingPlanRegion | false {
  if (!baseUrl || !envKey) {
    return false;
  }

  if (envKey !== CODING_PLAN_ENV_KEY) {
    return false;
  }

  if (baseUrl === 'https://coding.dashscope.aliyuncs.com/v1') {
    return CodingPlanRegion.CHINA;
  }
  if (baseUrl === 'https://coding-intl.dashscope.aliyuncs.com/v1') {
    return CodingPlanRegion.GLOBAL;
  }

  return false;
}
