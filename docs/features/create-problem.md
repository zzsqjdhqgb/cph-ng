# 创建题目

在工作区中创建一个新的竞争性编程题目。

## 描述 { #description }

创建题目功能为当前活动的源文件初始化一个新题目。
它创建题目元数据结构并根据您的设置设置默认配置。

题目存储位置为当前工作目录下 `.cph-ng` 文件夹的相对文件路径中 `.bin` 结尾的文件，可通过 `cph-ng.problem.problemFilePath` 配置。
文件文件格式为由 Gzip 压缩的 JSON 数据，包含题目元数据和测试用例，使用二进制扩展名 `.bin` 以防止意外编辑。


## 交互 { #interaction }

### 触发功能 { #dispatch }

该功能可以通过多种方式触发：

- 打开一个没有题目的源文件并点击 CPH-NG 侧边栏面板中的 `创建` 按钮。
- 按 <kbd>F1</kbd> 或者 <kbd>Ctrl/Cmd+Shift+P</kbd> 打开命令面板，并输入并选择：`CPH-NG: 创建题目`
- 打开一个没有题目的源文件并按 <kbd>Ctrl/Cmd+Alt+B</kbd> 快捷键

### 前置条件 { #requirements }

- 必须有一个打开源文件的编辑器处于活动状态
- 此文件不应已存在题目

## 相关配置 { #configurations }

- [cph-ng.problem.defaultTimeLimit]
- [`cph-ng.problem.defaultMemoryLimit`]
- [`cph-ng.problem.problemFilePath`]
- [`cph-ng.problem.templateFile`]

[cph-ng.problem.defaultTimeLimit]: ../configuration/problem/#cph-ngproblemdefaultmemorylimit

## 错误处理 { #error-handling }

<div class="annotate" markdown>

| 错误 | 原因 | 解决方案 |
|:----:|:---:|:-------:|
|没有活动编辑器 |当前没有打开文件|打开源文件后重试|
|题目已存在 |此源文件的题目文件已存在|先删除现有题目或使用其他文件|

</div>

*[没有活动编辑器]:未找到活动编辑器，请打开一个文件以创建题目。
*[题目已存在]:该文件已存在题目。

**未找到工作区**

- **原因**：文件不在工作区文件夹中
- **消息**：题目创建静默失败
- **解决方案**：在工作区文件夹中打开文件

## 相关功能

- [添加测试用例](add-test-case.md) - 创建后添加测试用例
- [编辑题目](edit-problem.md) - 修改题目元数据
- [导入题目](import-problem.md) - 从 CPH 的替代创建方法
- [删除题目](delete-problem.md) - 删除创建的题目
