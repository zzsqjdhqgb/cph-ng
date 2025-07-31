# CPH NG

> Quickly compile, run and judge competitive programming problems in VS Code. Automatically download testcases , or write & test your own problems.

This is the next generation of the [Competitive Programming Helper](https://github.com/agrawal-d/cph).

## Features

- Automatic compilation with display for compilation errors.
- Intelligent judge with support for signals, timeouts and runtime errors.
- Works with Competitive Companion.
- Works locally for your own problems.
- Support for several languages.

## Comparison with CPH

| Feature                 | CPH                  | CPH-NG                 |
| ----------------------- | -------------------- | ---------------------- |
| Automatic Compilation   | ✅                    | ✅                      |
| Intelligent Judge       | ✅                    | ✅                      |
| Competitive Companion   | ✅                    | ✅                      |
| Local Problem Support   | ✅                    | ✅                      |
| Language Support        | ✅ C/C++ and 8 others | ❌ Only C/C++           |
| Auto-submit Integration | ✅                    | ❌                      |
| Load Local Testcases    | ❌                    | ✅                      |
| Supported Result        | ❌ Only 3             | ✅ AC and 9 others [^1] |
| Store Result and Time   | ❌                    | ✅                      |
| Cache compiled program  | ❌                    | ✅ [^2]                 |

[^1]: They are: AC PE WA TLE OLE RE CE SE RJ SK
[^2]: CPH-NG calculates a hash of the current source code.
      If the hash matches the last one, it skips the compile process to emit the running time.

## License

This project is licensed under the terms of the [GNU Affero General Public License v3.0](https://github.com/langningchen/cph-ng/blob/main/LICENSE).

## Known Issues

See [GitHub Issues](https://github.com/langningchen/cph-ng/issues).

## Change Log

See [CHANGELOG.md](https://github.com/langningchen/cph-ng/blob/main/CHANGELOG.md)
