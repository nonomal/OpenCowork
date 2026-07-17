# Agent SSH 工具链迁移评估

> M4 收尾时的遗留项：sidecar 保留了 `SshOpenSsh.cs` + `SshSearchTools.cs`（2040 行），
> 服务于 C# native Agent 运行时与 git-over-SSH。本文档评估把这条链并入主进程 ssh2 单栈的路径。
> 结论：**可行但属独立工程（约 1-2 个专门会话），建议按方案 A 实施，先确认方案 C 的产品方向**。

## 1. 现状调用链

```
native agent run (sidecar-manager / cron-agent-background 注入 connection payload)
  └─ AgentRuntimeNativeToolExecutor
       └─ AgentRuntimeSshToolExecutor (1656 行)
            工具面：Read / Write / Edit / NotebookEdit / LS / Glob / Grep / Bash / Shell
            语义：读快照乐观锁、审批判定(RequiresApproval)、shell 输出收集截断
            传输：SshOpenSsh —— spawn 系统 openssh，密码走 SSH_ASKPASS 临时脚本
git-over-SSH (git-handlers 注入 payload)
  └─ GitTools → SshOpenSsh.ExecuteAsync（远端 git 命令 + find 探测）
```

明文凭据流向：主进程加密仓储按请求解密 → `ssh-connection-payload.ts` → JSON RPC → sidecar 进程内存 + askpass 环境变量。每次 agent 工具调用 spawn 一个 ssh 进程、独立认证。

## 2. 方案

### A（推荐）：传输层桥接回主进程，语义留在 C#

在 C# 里抽一个 `IRemoteExecTransport`（exec / read / write / list / stat），现有 openssh 实现之外加一个 **bridge 实现**：把原语请求发回主进程，由 `sftp-service`/`exec-service` 在共享 ssh2 连接上执行。

- 改动面：worker→main 的反向请求协议（现有 worker 事件通道上加 request/response 语义，或复用 AgentRuntime 已有的审批回传机制——实施前需确认其形态）；C# 侧 executor/GitTools 改为面向接口；主进程加一组桥接 handler（直接映射到既有服务，薄）。
- 收益：SSH 全局单栈；agent 与用户终端**共享连接**（不再每工具调用重新认证/spawn）；askpass hack 与凭据出主进程问题彻底消失；删除最后 2040 行 sidecar SSH。
- 成本：跨运行时协议改动 + agent 全功能回归（前台 run、cron 后台、git 面板），估 1-2 个专门会话。
- 风险控制：transport 可按运行时开关灰度（env 或 settings），回退路径保留一版。

### B：维持现状（M4 已选的止损点）

保留 2040 行子集。缺点：agent 场景的认证行为与 UI 栈不一致、密码认证仍走 askpass、凭据仍按请求进 sidecar。作为过渡可接受。

### C：跟随 JS Agent 运行时的产品方向

CLAUDE.md 声明"Agent execution now runs in the main-process JS runtime"，而 native C# runtime 是并行路径。若产品方向是 JS 运行时为主：JS 运行时的 SSH 工具直接调用主进程服务（已在单栈上），C# 路径随其退役自然消亡，无需专门做 A。**实施 A 之前应先确认 native runtime 的存续计划**——若半年内退役，B 直接过渡到退役即可。

## 3. 建议的实施切口（若做 A）

1. 摸清 worker→main 反向请求机制（审批流是现成样板）。
2. C# 定义 transport 接口 + bridge 实现（先只覆盖 exec —— Bash/Shell/Grep/Glob/git 全是 exec 语义，可先切一半流量）。
3. 文件原语（Read/Write/LS/stat）第二步切，保留 C# 侧快照/审批语义不动。
4. 双路开关灰度 → 回归 → 删 SshOpenSsh/SshSearchTools + askpass 资产。
