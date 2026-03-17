## opencode 历史会话存储，我目前的理解

我按 `Docs/目标.md` 里提到的几个路径实际看了一遍。

先说结论：

- 如果你想做一个“历史会话查看器”，`~/.local/share/opencode/opencode.db` 更像主数据源。
- `storage/session`、`storage/message`、`storage/part` 更像按层拆开的 JSON 存档。
- 这三层目录能帮助理解数据结构，但从我这台机器当前看到的情况来说，它们不像是“完整历史的唯一来源”。

当前机器里我看到的大概数量是：

- 数据库里有 `311` 条 session、`7664` 条 message、`29965` 条 part
- `storage/session` 里只有 `111` 个 session JSON
- `storage/message` 里有 `2571` 个 message JSON
- `storage/part` 里有 `10434` 个 part JSON

这说明一件很重要的事：

- 这些 `storage/*` 目录里有很多有用内容
- 但它们在这台机器上并不是完整历史
- 真要做“能搜全、能按时间排、尽量不漏”的页面，最好优先读数据库

---

## 1. `~/.local/share/opencode/opencode.db`

这个文件本质上是一个 SQLite 数据库，可以把它理解成 opencode 的总账本。

我实际看到的核心表有：

- `project`
- `session`
- `message`
- `part`
- `todo`
- 还有 `permission`、`workspace`、`account`、`session_share` 这类附加信息

### 这里面有什么

- 项目信息，比如项目 id、工作目录、更新时间
- 会话信息，比如 session id、标题、目录、版本、创建时间、更新时间
- 消息信息，比如 message id、属于哪个 session、时间、JSON 数据
- 消息分片信息，也就是 part，里面会放真正的文本、工具调用、patch、文件等内容
- todo、权限、账号、workspace 这类和会话相关但不是正文的辅助数据

### 这里面没有什么

- 没有现成给网页直接渲染的“完整聊天 HTML”
- 没有直接整理好的“左侧标题 + 右侧正文”成品结构
- 不是说查一张表就能拿到完整聊天全文，通常要把 `session -> message -> part` 串起来

### 对开发最有帮助的理解

- 这个库最适合做“完整索引”和“搜索入口”
- 要按时间倒序、按 session 聚合、根据 id 找消息，数据库会比扫目录稳很多
- 如果你要做搜索，最后大概率还是要落到 `part` 里的文本内容上
- 如果你要显示“复制打开命令”，数据库里的 `session.id` 就够用了

---

## 2. `~/.local/share/opencode/storage/session/`

这个目录是“会话级别”的轻量信息区。

它的第一层不是 session id，而是 `projectID`：

- 有些目录名是一串哈希，看起来对应某个项目
- 还有一个特殊目录叫 `global`

每个项目目录下面，会有很多 `ses_xxx.json` 文件，每个文件对应一个会话。

### 这里面有什么

一个 session JSON 里，我看到的典型字段有：

- `id`
- `slug`
- `version`
- `projectID`
- `directory`
- `title`
- `time.created`
- `time.updated`
- `summary.additions / deletions / files`

换句话说，这里更像：

- 会话列表页需要的基础信息
- 会话标题
- 会话属于哪个项目
- 会话大概什么时候创建和更新
- 这次改了多少文件、加减了多少代码

### 这里面没有什么

- 没有完整聊天正文
- 没有用户消息全文
- 没有 assistant 回复全文
- 没有工具调用细节
- 没有 patch 正文

### 对开发最有帮助的理解

- 如果只是做“会话列表”，这个目录看起来很顺手
- 但它更像 session 的摘要，不是 session 的完整内容
- 而且从当前机器的数据看，它不是全量的，不能单靠它做完整历史页

---

## 3. `~/.local/share/opencode/storage/message/`

这个目录是“消息级别”的信息区。

它的第一层是 `sessionID`，比如：

- `ses_xxx/`

每个 session 目录下面，会有很多 `msg_xxx.json` 文件，每个文件代表一条消息。

### 这里面有什么

我看到的 message JSON 里常见字段有：

- `id`
- `sessionID`
- `role`，比如 `user` 或 `assistant`
- `time.created`
- assistant 消息里常见 `time.completed`
- `parentID`
- `modelID`、`providerID`
- `agent`、`mode`
- `cost`
- `tokens`
- `summary.title`

它更像是“消息头信息”或者“消息索引信息”。

### 这里面没有什么

- 通常没有这条消息的完整正文
- 你能看到它是谁发的、什么时候发的、用的什么模型
- 但你通常看不到真正要展示给用户的大段文本内容

### 对开发最有帮助的理解

- 这个目录适合拿来判断一条消息的身份
- 比如它是不是用户消息、是不是 assistant 消息、属于哪个 session
- 也适合做时间线排序
- 但如果你要把“聊天内容本体”显示出来，还得继续去 `storage/part/` 找

---

## 4. `~/.local/share/opencode/storage/part/`

这个目录是最关键的内容层。

它的第一层是 `messageID`，比如：

- `msg_xxx/`

每个 message 目录下面，会有一个或多个 `prt_xxx.json`。

### 这里面有什么

这里面放的是消息拆出来的“部件”。

我实际看到的类型有：

- `text`
- `reasoning`
- `tool`
- `patch`
- `file`
- `step-start`
- `step-finish`
- 少量 `compaction`

这意味着什么？

- 真正的人类可读正文，很多时候在 `type: "text"` 里
- 工具调用过程在 `type: "tool"` 里
- 改了哪些文件，可能在 `type: "patch"` 里
- 附件或文件内容，可能在 `type: "file"` 里
- 一条 assistant 消息不一定只有一段 text，可能是多段 part 拼起来的

### 这里面没有什么

- 没有天然整理好的“整条消息全文”
- 没有直接按 session 聚合好的完整页面结构
- 不是所有 part 都适合直接展示给用户
- 比如 `reasoning` 里我看到的是加密内容，`tool` 里是工具输入输出，`file` 里甚至可能是 base64 图片

### 对开发最有帮助的理解

- 如果你想在右侧面板展示“具体内容”，这里基本是绕不过去的
- 但展示时不能把所有 part 都原样扔给用户
- 你需要挑：哪些 part 该展示，哪些 part 该折叠，哪些 part 干脆不展示

我自己的建议是：

- 优先展示 `text`
- 视情况展示 `tool` 的摘要
- `reasoning` 一般没必要直接给普通用户看
- `patch` 可以提炼成“改了哪些文件”
- `file` 需要按类型单独处理

---

## 5. 这几个目录和文件之间，到底是什么关系

可以粗暴理解成三层：

- `session`：一整个会话
- `message`：会话里的一条消息
- `part`：一条消息拆出来的多个片段

关系大概是：

- 一个 session 下面有很多 message
- 一条 message 下面有很多 part
- 真正要展示给人的正文，通常在某些 `part.text` 里

如果你要在页面里还原一条会话，大概思路就是：

1. 先拿到 session 列表
2. 点开某个 session 后，拿它的 message 列表
3. 再把每条 message 对应的 part 拼起来
4. 最后只展示适合给用户看的内容

---

## 6. 如果这个项目要落地，我建议怎么用

### 用数据库做主入口

- 用 `opencode.db` 拿 session 列表
- 用数据库做时间倒序
- 用数据库做搜索
- 用数据库里的 `session.id` 生成复制命令：`opencode --session <session_id>`

### 用 `part` 做正文展示

- 真正展示具体内容时，重点看 `part`
- 尤其是 `text` 类型
- 其他类型当补充信息，不要一股脑全部展示

### 不要把 `storage/session` 当成唯一来源

- 它对理解结构很有帮助
- 但从当前机器的实际数据量来看，它不像全量数据源
- 只靠它，很可能会漏会话

---

## 7. 对开发者最实用的一句话版本

- `opencode.db`：总索引、总账本，最适合做搜索和列表
- `storage/session`：会话摘要，不是正文
- `storage/message`：消息头，不是正文
- `storage/part`：最接近真正聊天内容，但内容很杂，需要筛选后展示

如果后面真要开始写页面，我会倾向于：

- 先把数据库里的 `session / message / part` 关系跑通
- 再决定前端要展示哪些 `part.type`
- 最后再考虑要不要把 `storage/*` 目录当成补充来源或调试依据
