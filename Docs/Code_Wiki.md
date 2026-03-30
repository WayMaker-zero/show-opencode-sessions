# Code Wiki

## 1. 项目基本介绍 (Introduction)

本项目 (`show-opencode-sessions`) 是一个为了解决 `opencode` CLI 工具历史会话查找不便而开发的 Web 可视化工具。在原生的命令行交互中，单凭标题很难确认是否为需要的会话。

本项目的核心功能：
- **历史会话列表**：自动读取并展示最近的 `opencode` 历史会话记录。
- **内容预览与详情**：点击特定会话，可在右侧展开查看具体的对话内容。
- **搜索功能**：支持按关键字搜索匹配的会话记录，并按时间倒序排列。
- **一键复制恢复命令**：为每个会话提供一键复制命令（如 `opencode --session <session_id>`），方便用户快速在终端中恢复特定对话。
- **会话导出**：支持将某个会话完整导出为 JSON 文件，便于备份或分享给其他人查看。
- **会话导入**：支持从 JSON 文件导入外部会话；导入的会话仅支持查看，不提供一键恢复命令。

## 2. 项目架构 (Architecture)

本项目采用 **前端 React 单页应用 + 嵌入式本地 Node.js API** 的轻量级架构，并支持**单文件独立可执行程序**打包：

- **前端层**：基于 React 19 + Vite + TailwindCSS 构建的用户界面。负责渲染会话列表、搜索交互、会话导入/导出操作以及对话气泡展示。
- **本地接口层 (Local API)**：
  - **开发环境**：巧妙地利用了 Vite 的插件机制，在 `vite.config.ts` 中注入了一个自定义的中间件拦截所有 `/api/opencode/*` 请求。
  - **生产环境 (独立打包)**：使用 `server.ts` 作为入口，启动一个原生 Node.js HTTP 服务器。它不仅提供相同的 `/api/opencode/*` 接口，还负责伺服 React 编译后的 `dist/` 静态文件，并自动打开浏览器。
- **数据源读取**：本地接口直接读取当前运行用户的本地目录 `~/.local/share/opencode`，包括使用 `sql.js` 解析 SQLite 数据库文件（`opencode.db`）以及读取 JSON 格式的数据文件（位于 `storage/session/`, `storage/message/`, `storage/part/`）。此外，本地接口也负责把完整会话整理成统一 JSON 结构，供前端下载导出。

## 3. 项目中每一个脚本的作用 (File Roles)

以下是项目中关键文件和目录的说明：

### 根目录配置文件
- **`vite.config.ts`**：Vite 的主配置文件。在开发环境中，通过 `opencodeApiPlugin` 将 `opencode-api.ts` 注册为中间件。
- **`server.ts`**：**生产环境独立启动脚本**。用于创建原生的 Node.js HTTP 服务器，整合 API 路由与静态前端文件服务（来自 `dist/`），并在启动后自动调起系统浏览器。这是 `pkg` 打包的入口点。
- **`opencode-api.ts`**：**核心数据处理层**（充当轻量级后端）。负责读取 `opencode.db` 并解析复杂的会话和消息 JSON 文件，返回前端所需的结构化数据；同时提供会话导出接口。该逻辑同时被 Vite (开发时) 和 `server.ts` (生产时) 引用。
- **`package.json`**：项目依赖描述，包含了一键构建出跨平台单文件可执行程序的 `pkg:build` 脚本及 `pkg` 资产配置。

### `src/` 前端源代码目录
- **`src/main.tsx`**：React 应用的入口点，负责挂载应用到 DOM。
- **`src/App.tsx`**：整个页面的核心组件。内部实现了左右分栏的布局结构、获取会话数据的请求逻辑、搜索过滤逻辑、会话文件导入/导出交互、导入会话的只读标记控制，以及选中某个会话后的对话气泡详情渲染。
- **`src/styles.css`**：全局样式表，主要包含 Tailwind 指令及少量自定义样式。
- **`src/components/` & `src/lib/`**：存放通用的 UI 组件和工具函数（如 className 拼接的 utils）。

### `Docs/` 文档目录
- **`Docs/目标.md`**：记录了本项目的初始需求、目标和期望的功能清单。
- **`Docs/opencode历史存储认知.md`**：**非常重要**。记录了对 `opencode` 本地存储数据结构的逆向分析和认知，包括 `opencode.db` 与各个 `storage/` 下 JSON 文件之间的引用关系和字段含义。在修改 `opencode-api.ts` 的解析逻辑前必读。

## 4. 新上手开发者须知 (Onboarding Guide)

对于新接手本项目的开发者，请留意以下几点：

1. **启动方式**：
   通过 `npm install` 安装依赖后，执行 `npm run dev` 即可启动项目。前端和本地 API 将在同一个端口（如 `3003`）启动。

2. **本地环境依赖**：
   本项目强依赖于运行机器上的 `~/.local/share/opencode` 目录。如果你在没有使用过 `opencode` 的机器上开发，前端请求会因为找不到对应目录或数据库而返回空数据或报错。你可能需要伪造/拷贝一份该目录结构用于测试。

3. **前后端通信方式**：
   前端在获取数据时，直接 `fetch('/api/opencode/...')`，无需处理跨域，因为 Vite 已经将这些请求拦截并交由本地中间件处理了。

4. **数据解析逻辑的维护**：
   由于 `opencode` CLI 未来的版本可能会改变其本地文件的存储结构（Schema），一旦遇到前端展示不正常、崩溃或者读不出历史消息，第一步应当检查 `~/.local/share/opencode` 下的数据结构是否发生变化，并对应修改 `opencode-api.ts` 中的解析逻辑。修改前请参考 `Docs/opencode历史存储认知.md`。

5. **导入会话的存储方式**：
   当前通过文件导入的会话仅保存在前端页面内存中，用于临时查看，不会写回本机 `~/.local/share/opencode` 历史目录。

## 5. 打包与分发说明 (Packaging & Distribution)

本项目支持利用 `pkg` 与 `esbuild` 将前后端打包成“单一可执行绿色软件”，极大地降低了用户的使用门槛（特别是对非开发者或者不懂配置运行环境的用户）。

- **一键构建命令**：
  在项目根目录下，运行以下命令：
  ```bash
  npm run pkg:build
  ```

- **构建过程说明**：
  1. 首先通过 Vite (`vite build`) 将 React 前端代码打包到 `dist/` 目录。
  2. 接着通过 `esbuild` 将 Node.js 服务端入口 `server.ts` 及其依赖（如 `opencode-api.ts`）打包成单文件 CommonJS 脚本 `build/server.cjs`。
  3. 最后利用 `pkg`，将 `build/server.cjs` 连同前端的 `dist/` 目录和 `sql.js` 的 `wasm` 静态文件一起打包。
  4. 打包完成后，额外通过脚本将多平台产物压缩为便于分发的 `.tar.gz` / `.zip` 文件。

- **构建产物**：
  构建完成后，会在根目录下生成 `bin/` 文件夹。该文件夹内包含了分别针对多个平台（macOS Intel/ARM, Windows, Linux）的独立无依赖可执行文件（如 `show-opencode-sessions-macos-arm64`），以及对应的压缩分发包。

- **分发给用户**：
  开发者只需将对应平台的单一可执行文件（几十MB）发送给目标用户。用户下载后无需安装 Node 环境，直接双击（Mac/Linux 端如果提示权限问题可运行 `chmod +x`），程序便会在后台静默启动 `3003` 端口服务，并瞬间自动呼叫用户的默认浏览器展示本地的 OpenCode 历史记录。
