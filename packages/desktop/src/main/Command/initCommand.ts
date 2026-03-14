import type { Config } from '@qwen-code/qwen-code-core';
import type { PartListUnion } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** QWEN.md 上下文文件名 */
const CONTEXT_FILENAME = 'QWEN.md';

/**
 * 处理 /init 命令：创建空 QWEN.md 并返回分析 prompt
 * 返回 PartListUnion 供发送给模型，或 null 表示本地处理失败
 */
function initCommand(
  config: Config,
  onError: (message: string) => void,
): PartListUnion | null {
  const targetDir = config.getProjectRoot();
  const contextFilePath = path.join(targetDir, CONTEXT_FILENAME);

  try {
    // 如果文件已存在且有内容，仍然重新生成（桌面版简化，不做确认弹窗）
    fs.writeFileSync(contextFilePath, '', 'utf8');
  } catch (err) {
    onError(
      `无法创建 ${CONTEXT_FILENAME}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  // 返回专门的分析 prompt
  return [
    {
      text: `
You are Qwen Code, an interactive CLI agent. Analyze the current directory and generate a comprehensive ${CONTEXT_FILENAME} file to be used as instructional context for future interactions.

**Analysis Process:**

1.  **Initial Exploration:**
    *   Start by listing the files and directories to get a high-level overview of the structure.
    *   Read the README file (e.g., \`README.md\`, \`README.txt\`) if it exists. This is often the best place to start.

2.  **Iterative Deep Dive (up to 10 files):**
    *   Based on your initial findings, select a few files that seem most important (e.g., configuration files, main source files, documentation).
    *   Read them. As you learn more, refine your understanding and decide which files to read next. You don't need to decide all 10 files at once. Let your discoveries guide your exploration.

3.  **Identify Project Type:**
    *   **Code Project:** Look for clues like \`package.json\`, \`requirements.txt\`, \`pom.xml\`, \`go.mod\`, \`Cargo.toml\`, \`build.gradle\`, or a \`src\` directory. If you find them, this is likely a software project.
    *   **Non-Code Project:** If you don't find code-related files, this might be a directory for documentation, research papers, notes, or something else.

**${CONTEXT_FILENAME} Content Generation:**

**For a Code Project:**

*   **Project Overview:** Write a clear and concise summary of the project's purpose, main technologies, and architecture.
*   **Building and Running:** Document the key commands for building, running, and testing the project. Infer these from the files you've read (e.g., \`scripts\` in \`package.json\`, \`Makefile\`, etc.). If you can't find explicit commands, provide a placeholder with a TODO.
*   **Development Conventions:** Describe any coding styles, testing practices, or contribution guidelines you can infer from the codebase.

**For a Non-Code Project:**

*   **Directory Overview:** Describe the purpose and contents of the directory. What is it for? What kind of information does it hold?
*   **Key Files:** List the most important files and briefly explain what they contain.
*   **Usage:** Explain how the contents of this directory are intended to be used.

**Final Output:**

Write the complete content to the \`${CONTEXT_FILENAME}\` file. The output must be well-formatted Markdown.
`,
    },
  ];
}

export default initCommand;
