# 过目 · Second Look

<p align="center">
  <img src="./assets/readme/hero.png" width="100%" alt="过目 · Second Look 品牌横幅" />
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-second-look/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-second-look/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square" alt="License: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D0.2.1--rc.5%20%3C0.3.0--0-4d6bfe?style=flat-square" alt="DeepSeek Harness >=0.2.1-rc.5 <0.3.0-0" />
</p>

**让 AI 动手时，多一位独立的审核助手。**

过目是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的工具操作审核插件。在启用审查的会话里，常规低风险操作按规则放行，涉及高风险删除、整文件覆盖、可疑命令等操作时，再交给你指定的审核模型判断。需要人工决定的工具操作，会转回 DSH 的审批界面。

你可以按任务选择审查力度，也可以回看一次操作为什么被放行、拦截或转交人工。

> **测试版 0.1.3** · 需要 DSH `>=0.2.1-rc.5 <0.3.0-0` 和一个你信任的审核模型。

## 适合什么时候用？

- **让 AI 改文件、跑命令时**：在自动执行过程中增加独立判断，尤其关注高风险删除、覆盖、脚本与外传行为。
- **任务复杂、想多看一层时**：切换到加强审查，让审核模型进一步查看差异与脚本内容，必要时只读补充证据。
- **想弄清一次拦截时**：按工具、理由或会话找到相关记录，回看当时的判断依据。

## 审批记录，看得见理由

<p align="center">
  <img src="assets/readme/approval-history.png" width="900" alt="过目审批记录实机截图：拒绝与拦截列表、原因摘要、搜索与结果筛选，以及刷新、导出日志和清空记录按钮" />
</p>
<p align="center"><em>实机中的「拒绝与拦截」视图，展示出站请求的拦截记录与原因摘要。顶部为截图时插件配置的基础审核模型。</em></p>

审批记录支持搜索、按审批结果筛选、手动刷新、导出脱敏 JSON 和清空当前分类记录。「最近记录」保留本次运行最近 500 条事件；「拒绝与拦截」单独保留最近 100 条事件摘要，重启后仍可查看，普通放行不计入这 100 条。

## 按任务选择审查力度

在会话输入栏的权限菜单中选择，无需让所有会话使用同一档位。

| 档位 | 适合的任务 | 如何审查 |
| --- | --- | --- |
| **日常审查** | 常规开发与工具操作 | 常规只读、新建普通文件等操作按规则放行；已有非空文件的整文件覆盖送审，风险操作交独立模型判断，最多 1 轮只读补证。 |
| **加强审查** | 希望进一步检查代码改动、脚本或外传行为的任务 | 在日常规则基础上检查差异、脚本等内容，最多 3 轮只读补证，并支持交付前的文件核对。 |

审核模型由你选择，加强档也可以单独配置。启用审查后，子代理沿会话关系继承审查状态；界面和提示跟随宿主的中文或英文设置。

## 开始试用

1. **安装插件**：在 DSH 桌面版打开「插件 → 添加插件」，输入 `dsh-second-look@0.1.3`。安装后点击「立即启用」；若提示重启，退出并重新打开 DSH。 也可从 [GitHub Release](https://github.com/MaRi23333/dsh-second-look/releases/tag/v0.1.3) 下载 `.tgz`，不解压，在同一处输入文件的完整路径。
2. **选择审核模型**：在「设置 → 过目 → 审核设置」选择服务商和模型。送审时，工具参数、相关上下文和部分代码差异可能发给这个模型。插件无法脱敏所有敏感内容。
3. **为会话选档**：在输入栏权限菜单选择「日常审查」或「加强审查」，从非破坏性操作开始试用，并在审批记录中查看结果。

## 使用前了解这些边界

- **多一层判断，不等于安全保证。** 审核模型可能误报或漏报，真实环境中的判断准确率仍需持续验证；额外审核也会增加等待时间与 Token 消耗。
- **它不是操作系统沙箱。** 审查仅覆盖启用档位的会话及受管工具路径，不覆盖所有插件、自发网络请求或其他会话。敏感内容检测也有范围限制。
- **拦截不一定伴随确认弹窗。** 工具操作可转交人工审批；命中敏感内容的出站模型请求可能以脱敏副本继续，也可能直接阻断，目前没有专用的出站人工授权界面。
- **交付前核对需要智能体配合。** 加强档的汇总工具需由智能体主动调用，不能阻止最终文本回复；收到“已完成”不代表所有改动都已审查。

更完整的使用方法、配置、保留策略与安全边界见[使用与技术说明](https://github.com/MaRi23333/dsh-second-look/blob/main/docs/TECHNICAL.zh-CN.md)。

## 来源与许可

过目基于 [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) 改编，并使用了 dsh-heavy-approval 与 DSH 权限选择组件的部分代码。项目采用 **Apache-2.0**，所含第三方 MIT 声明与具体来源见 [LICENSE](LICENSE) 和 [THIRD-PARTY-SOURCES.md](THIRD-PARTY-SOURCES.md)。
