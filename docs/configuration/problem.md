# 题目设置

!!! abstract
    题目默认值和文件路径的设置，此页面下所有配置共有 `cph-ng.problem.` 前缀。

### `defaultTimeLimit` <small>数字</small> { #defaultTimeLimit }

设置将应用于扩展中新创建题目的**默认时间限制**（单位为**毫秒**）。如果未提供题目的特定时间限制，将使用此值，以确保执行有一个基准。

| 默认值 | 相关功能 |
|:-:|:-:|
|`1000`|[创建题目](../features/create-problem.md)|

### `defaultMemoryLimit` <small>数字</small> { #defaultMemoryLimit }

设置将应用于扩展中新创建题目的**默认内存限制**（单位为**MB**）。如果未提供题目的特定内存限制，将使用此值，以确保在执行期间有一个基准的内存使用限制。

| 默认值 | 相关功能 |
|:-:|:-:|
|`512`|[创建题目](../features/create-problem.md)|

### `problemFilePath` <small>字符串</small> { #problemFilePath }

指定**题目文件路径**，这是存储题目定义和测试样例的位置。

你可以使用以下占位符：

- `${workspace}`：工作区文件夹的路径。
- `${tmp}`：临时目录的路径。
- `${home}`：用户主目录的路径。
- `${dirname}`：源文件的目录名。
- `${relativeDirname}`：源文件的目录名（相对于工作区）。
- `${basename}`：源文件的基本名称。
- `${extname}`：源文件的扩展名。
- `${basenameNoExt}`：源文件的基本名称（不带扩展名）。

<div class="annotate" markdown>
| 默认值 | 相关功能 |
|:-:|:-:|
|`${workspace}/.cph-ng/${relativeDirname}/${basename}.bin` (1)|[创建题目](../features/create-problem.md) &emsp; [导入题目](../features/import-problem.md) &emsp; [删除题目](../features/delete-problem.md)|
</div>

1. 默认值是当前工作目录下的 `.cph-ng` 文件夹内，对应文件的相对路径，并将扩展名替换为 `.bin`。
   例如，如果打开了 `/home/langningchen/OI` 工作区当中的文件 `/home/langningchen/OI/luogu/P1000.cpp`，
   题目保存位置为 `/home/langningchen/OI/.cph-ng/luogu/P1000.bin`。

### `templateFile` <small>字符串</small> { #templateFile }

指定在创建新题目时使用的**模板文件**。
此文件可以包含题目详细信息的占位符，这些占位符将在创建新题目时被实际值替换。
这允许在题目之间保持一致的格式和结构。

占位符包括：

- `${title}`：题目的标题。
- `${timeLimit}`：题目的时间限制（以毫秒为单位）。
- `${url}`：题目的 URL。

| 默认值 | 相关功能 |
|:-:|:-:|
|该选项默认值为空。|[创建题目](../features/create-problem.md)|

### `clearBeforeImport`

- **类型**：布尔值
- **默认值**：`false`
- **用户影响**：加载测试样例前是否清除现有测试样例。

### `deleteAfterUnzip`

- **类型**：布尔值
- **默认值**：`false`
- **用户影响**：解压后是否删除 zip 文件。

### `maxInlineDataLength`

- **类型**：数字
- **默认值**：`65536`（字节）
- **用户影响**：内联数据的最大大小。超过时自动转换为文件存储。

### 相关功能

- [创建题目](../features/create-problem.md) - 使用默认限制
- [加载测试样例](../features/load-test-cases.md) - 使用导入设置
- [切换文件/内联](../features/toggle-file-inline.md) - 受 maxInlineDataLength 影响
