# 删除题目

从工作区删除题目及其数据。

!!! danger "请确认你知道你在做什么"
    删除题目是永久的，不可恢复的。请在操作之前三思。

## 描述 { #description }

删除题目功能会永久删除与当前源文件关联的题目。这会删除包含元数据和测试样例的题目文件，但不会影响您的源代码文件。

## 交互 { #interaction }

### 触发功能 { #dispatch }

该功能可以通过多种方式触发：

- 点击题目操作面板底部控制栏中的删除按钮
- 按 ++f1++ 或者 ++ctrl+shift+p++ 打开命令面板，并输入并选择：`CPH-NG: 删除题目`

![](../images/deleteProblem.png)

### 前置条件 { #requirements }

- 当前文件必须已加载题目
- 题目面板必须可见

## 相关配置 { #configurations }

- [cph-ng.problem.problemFilePath](../configuration/problem.md#problemFilePath)

## 错误处理 { #error-handling }

| 错误 | 原因 | 解决方案 |
|:----:|:---:|:-------:|
| 没有活动编辑器 | 当前没有打开文件 | 打开源文件后重试 |
| 未找到工作区 | 文件不在工作区文件夹中 | 在工作区文件夹中打开文件 |
| 删除失败 | 题目文件可能已被删除或权限不足 | 重试 |

*[没有活动编辑器]:未找到活动编辑器，请打开一个文件以创建题目。
*[未找到工作区]:未打开任何工作区文件夹。
*[删除失败]:删除题目文件 {file} 失败。

## 相关功能 { #relatives }

- [创建题目](create-problem.md)
- [导入题目](import-problem.md)
- [编辑题目](edit-problem.md)
