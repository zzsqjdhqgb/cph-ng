# CPH-NG

CPH-NG (1) 是一个专为竞争性编程开发的 **Visual Studio Code 扩展**。
{ .annotate }

1.  CPH-NG 英文全称 `Competitive Programming Helper - Next Generation`，中文全称翻译可以理解为`新一代竞争性编程助手`

CPH-NG 使用户能够在 VS Code 环境中方便高效地**编译、运行和评测**程序。

!!! warning

    目前 CPH-NG 仅支持 C++ 和 Java，如果需要支持更多语言，欢迎提出建议。

## 什么是 CPH-NG？

CPH-NG 是 [Competitive Programming Helper](https://github.com/agrawal-d/cph) 的下一代版本，为在 VS Code 中工作的竞争性程序员提供全面的解决方案。无论您是在在线评测网站上练习还是处理自己的题目，CPH-NG 都能简化从题目创建到提交的整个工作流程。

## 安装

- 在 VSCode 扩展面板中搜索 `CPH-NG`
- 从 Visual Studio Code 市场直接安装 <https://marketplace.visualstudio.com/items?itemName=langningchen.cph-ng>

## 快速链接

- [快速入门指南](quickStart.md) - 几分钟内开始使用
- [功能指南](features/) - 详细的功能文档
- [配置参考](configuration.md) - 所有配置选项
- [常见问题](faq.md) - 常见问题解答
- [关于](about.md) - 项目信息和贡献指南

## 核心功能

### 智能测试数据管理

提供**多种灵活的方式**导入测试数据：

- 从 [Competitive Companion](https://github.com/jmerle/competitive-companion) 浏览器扩展导入
- [从 zip 文件或目录加载](features/load-test-cases)
- [手动创建测试用例](features/add-test-case)
- [从原始 CPH 格式导入](features/import-problem)

### 智能编译系统

CPH-NG 具有智能编译系统，能够：

- 检测文件更改，仅在必要时重新编译
- 缓存已编译的二进制文件以加快测试速度
- 支持自定义编译器标志和优化级别
- 提供清晰的编译错误消息
- 支持编译钩子和包装器

### 全面的评测系统

CPH-NG 支持 **20 种不同的评测状态**：

| 状态 | 名称 |
|------|------|
| AC   | 通过 | 
| CE   | 编译错误 | 
| CMP  | 正在比较 | 
| CP   | 正在编译 | 
| CPD  | 已编译 | 
| JG   | 正在评测 | 
| JGD  | 已评测 | 
| MLE  | 内存超限 | 
| OLE  | 输出超限 | 
| PC   | 部分正确 | 
| PE   | 格式错误 | 
| RE   | 运行时错误 | 
| RJ   | 已拒绝 | 
| SE   | 系统错误 | 
| SK   | 已跳过 | 
| TLE  | 时间超限 | 
| UKE  | 未知错误 | 
| WA   | 答案错误 | 
| WT   | 等待中 | 

### 🎓 特殊评测支持

![特殊评测](images/specialJudge.png)

CPH-NG 完全支持：

- 使用 testlib.h 或自定义检查器的**特殊评测（SPJ）**程序
- 带有自定义交互器的**交互式题目**
- 针对非标准输出格式的灵活题目验证

### 🔄 高级功能

- **暴力对拍**：使用暴力参考解法测试您的优化解决方案
- **文件/内联切换**：在内联数据和外部文件之间切换以处理大型测试用例
- **耗时跟踪**：监控您在题目上工作的时间
- **答案比较视图**：错误答案的可视化差异对比
- **结果持久化**：跨会话保持测试结果的记录
