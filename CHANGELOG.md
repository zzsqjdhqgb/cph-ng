# Change Log

All notable changes to the "cph-ng" extension will be documented in this file.

## [Unreleased]

- **feat**: Use the new Icon
- **fix**: Constantly check CPH status

## 0.0.8

- **fix**: Localize messages in LlmFileReader and LlmTcRunner for better
  internationalization support
- **fix**: Edit problem dialog changes with file

## 0.0.7

- **feat**: Hold `Ctrl` to force recompilation and `Alt` to skip compilation
- **fix**: Changing to answer file will not be considered as changing problem
  now
- **feat**: Introduce LLM tools for test case execution and file reading

## 0.0.6

- **feat**: Add error popup when webview handle occurs error
- **fix**: Cph auto import

## 0.0.5

- **fix**: Stop running when changes problem
- **fix**: Use correct output path
- **fix**: Correctly access stdout and stderr paths

## 0.0.4

- **feat**: Add problem file path configuration.
- **feat**: Add logging to help identify issues.
- **feat**: Implement ErrorBoundary component.
- **fix**: Hide empty stderr or message.

## 0.0.3

- **feat**: Add support for saving unsaved changes in the editor before
  compilation.
- **fix**: The "file not found" warning no longer appears when the current
  source file does not have a problem.
- **feat**: Add support for SPJ using testlib.

## 0.0.2

- **fix**: The icon in problem actions has been enlarged.
- **fix**: The "file not found" warning no longer appears when data is received
  from the companion app.
- **fix**: The test case status now updates correctly after a compilation error
  (CE) occurs.

## 0.0.1

- Initial release
