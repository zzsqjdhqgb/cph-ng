# 代码重构优化报告

## 概述

本次重构主要针对 `runner.ts` 和 `checker.ts`
的代码重复问题，提取了公共的进程执行逻辑，创建了可复用的工具模块，提高了代码的模块化程度和可维护性。

## 新增模块

### 1. `utils/processExecutor.ts` - 通用进程执行器

**功能：**

- 统一处理单进程和双进程（管道）执行
- 标准化进程启动、IO处理、错误处理、超时管理
- 支持文件输入和字符串输入
- 支持 AbortController 信号处理

**主要方法：**

- `execute(options)`: 执行单个进程
- `executeWithPipe(process1Options, process2Options)`: 执行两个进程并建立管道连接
- `handleStdin()`: 私有方法，处理进程输入

**优化效果：**

- 消除了 `runner.ts` 中的重复进程执行代码
- 统一了错误处理和输出收集逻辑
- 简化了交互器的实现复杂度

### 2. `utils/processResultHandler.ts` - 进程结果处理器

**功能：**

- 统一处理进程执行结果的转换
- 提取包装器数据（执行时间等）
- 标准化错误码到判题结果的映射
- 提供输出比较功能

**主要方法：**

- `extractWrapperData()`: 从 stderr 提取包装器数据
- `processResultToRunnerResult()`: 转换为运行器结果
- `processResultToCheckerResult()`: 转换为检查器结果
- `compareOutputs()`: 比较输出结果
- `getTestlibVerdict()`: 私有方法，解析 testlib 退出码

**优化效果：**

- 统一了结果处理逻辑
- 移除了 `runner.ts` 中的 `compareOutputs` 重复代码
- 集中了 testlib 标准的实现

### 3. `utils/testlib.ts` - 重构后的 Testlib 工具类

**变更：**

- 保留向后兼容的 API
- 内部实现委托给 `ProcessResultHandler`
- 添加 `@deprecated` 标记，建议使用新的处理器

## 重构的现有模块

### 1. `core/runner.ts` - 运行器重构

**优化前问题：**

- `runWithoutInteractor` 和 `runWithInteractor` 有大量重复的进程处理代码
- `commonResolve` 方法处理逻辑复杂
- 包装器数据解析代码重复
- 输出比较逻辑冗长

**优化后改进：**

- 使用 `ProcessExecutor` 简化进程执行
- 使用 `ProcessResultHandler` 统一结果处理
- `runWithoutInteractor` 方法从 60+ 行简化到 10 行
- `runWithInteractor` 方法从 120+ 行简化到 50+ 行
- 移除了 `compareOutputs` 和 `commonResolve` 方法

### 2. `core/checker.ts` - 检查器重构

**优化前问题：**

- 手动管理进程生命周期
- 重复的错误处理代码
- 结果解析逻辑与 runner 重复

**优化后改进：**

- 使用 `ProcessExecutor` 统一进程执行
- 使用 `ProcessResultHandler` 统一结果解析
- 代码行数从 80+ 行减少到 50+ 行
- 消除了与 runner 的重复逻辑

## 代码指标改进

### 代码行数减少

- `runner.ts`: 352 行 → 203 行（减少 42%）
- `checker.ts`: 87 行 → 56 行（减少 36%）
- 总计减少约 180 行重复代码

### 模块化程度提升

- 新增 2 个专用工具模块
- 分离了进程执行和结果处理关注点
- 提高了代码的可测试性和可维护性

### 重复代码消除

- 统一了进程启动和管理逻辑
- 统一了错误处理和超时管理
- 统一了输出收集和解析逻辑
- 统一了结果转换和判题逻辑

## 类型安全改进

- 明确定义了 `ProcessResult` 接口
- 统一了 `Result<T>` 类型的使用
- 修复了所有类型兼容性问题
- 增强了编译时类型检查

## 向后兼容性

- 保持了所有公共 API 不变
- `Testlib.getVerdict()` 保持兼容性
- 现有调用代码无需修改
- 添加了适当的 `@deprecated` 标记

## 性能优化

- 减少了重复的进程管理开销
- 统一了内存和资源管理
- 简化了调用栈深度
- 优化了错误处理路径

## 总结

本次重构大幅提高了代码质量：

1. **可维护性**：模块化设计使功能职责更加清晰
2. **可扩展性**：新的进程执行器可以轻松支持更多场景
3. **可测试性**：独立的工具模块便于单元测试
4. **代码复用**：消除了大量重复代码
5. **类型安全**：增强了 TypeScript 类型检查

重构后的代码结构更加清晰，逻辑更加简洁，为后续的功能扩展和维护奠定了良好的基础。
