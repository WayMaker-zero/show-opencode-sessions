# Code Wiki

## 1. 项目基本介绍 (Introduction)

本项目 (`show-opencode-sessions`) 是一个为了解决 `opencode` CLI 工具历史会话查找不便而开发的 Web 可视化工具。在原生的命令行交互中，单凭标题很难确认是否为需要的会话。

本项目的核心功能：
- **历史会话列表**：自动读取并展示最近的 `opencode` 历史会话记录。
- **内容预览与详情**：点击特定会话，可在右侧展开查看具体的对话内容。
- **搜索功能**：支持按关键字搜索匹配的会话记录，并按时间倒序排列。
- **一键复制恢复命令**：为每个会话提供一键复制命令（如 `opencode --session <session_id>`），方便用户快速在终端中恢复特定对话。

## 2. 项目架构 (Architecture)

本项目采用 **前端 React 单页应用 + 嵌入式本地 Node.js API** 的轻量级架构：

- **前端层**：基于 React 19 + Vite + TailwindCSS 构建的用户界面。负责渲染会话列表、搜索交互以及对话气泡展示。
- **本地接口层 (Local API)**：由于浏览器无法直接读取系统本地文件，本项目没有起独立的后端服务，而是**巧妙地利用了 Vite 的插件机制**，在 `vite.config.ts` 中注入了一个自定义的中间件。该中间件拦截所有 `/api/opencode/*` 的请求，交由 Node.js 处理。
- **数据源读取**：本地接口直接读取当前运行用户的本地目录 `~/.local/share/opencode`，包括使用 `sql.js` 解析 SQLite 数据库文件（`opencode.db`）以及读取 JSON 格式的数据文件（位于 `storage/session/`, `storage/message/`, `storage/part/`）。

## 3. 项目中每一个脚本的作用 (File Roles)

以下是项目中关键文件和目录的说明：

### 根目录配置文件
- **`vite.config.ts`**：Vite 的主配置文件。除了配置 React 和 Tailwind 插件外，最重要的是定义了 `opencodeApiPlugin`，将 `opencode-api.ts` 注册为开发和预览服务器的中间件，拦截和处理本地数据请求。
- **`opencode-api.ts`**：**核心数据处理层**（充当轻量级后端）。这是一个 Node.js 脚本，处理如 `/api/opencode/sessions` 的路由逻辑。它负责读取 `opencode.db` 并解析复杂的会话和消息 JSON 文件，返回前端所需的结构化数据。
- **`package.json`**：项目依赖描述，包含 React, TailwindCSS, `sql.js` 等依赖，以及常规的 `dev`, `build`, `preview` 启动脚本。

### `src/` 前端源代码目录
- **`src/main.tsx`**：React 应用的入口点，负责挂载应用到 DOM。
- **`src/App.tsx`**：整个页面的核心组件。内部实现了左右分栏的布局结构、获取会话数据的请求逻辑、搜索过滤逻辑、以及选中某个会话后的对话气泡详情渲染。
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