// Copyright (C) 2025 Langning Chen
//
// This file is part of cph-ng.
//
// cph-ng is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// cph-ng is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with cph-ng.  If not, see <https://www.gnu.org/licenses/>.

import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isRunningVerdict, TestCase } from '../../types';
import {
    ChooseTestCaseFileMessage,
    CompareTestCaseMessage,
    DeleteTestCaseMessage,
    RunTestCaseMessage,
    UpdateTestCaseMessage,
} from '../messages';
import CphButton from './cphButton';
import CphFlex from './cphFlex';
import CphText from './cphText';
import TestCaseDataView from './testCaseDataView';
import ErrorBoundary from './errorBoundary';

interface TestCaseViewProp {
    testCase: TestCase;
    index: number;
}

const TestCaseView = ({ testCase, index }: TestCaseViewProp) => {
    const { t } = useTranslation();
    const running = isRunningVerdict(testCase.result?.verdict);

    const emitUpdateTestCase = () =>
        vscode.postMessage({
            type: 'updateTestCase',
            index,
            testCase,
        } as UpdateTestCaseMessage);

    return (
        <ErrorBoundary>
            <Accordion
                expanded={testCase.isExpand}
                disableGutters={true}
                onChange={(_, expanded) => {
                    testCase.isExpand = expanded;
                    emitUpdateTestCase();
                }}
                sx={{
                    borderLeft: `4px solid`,
                    ...(testCase.result?.verdict
                        ? {
                              borderLeftColor: `rgb(${testCase.result.verdict.color})`,
                              backgroundColor: `rgba(${testCase.result.verdict.color}, 0.1)`,
                          }
                        : {
                              borderLeftColor: 'transparent',
                          }),
                }}
            >
                <AccordionSummary
                    sx={{
                        '& > span': { margin: '0 !important' },
                    }}
                >
                    <CphFlex smallGap>
                        <CphFlex flex={1}>
                            <CphText fontWeight={'bold'}>#{index + 1}</CphText>
                            <Tooltip title={testCase.result?.verdict.fullName}>
                                <CphText>
                                    {testCase.result?.verdict.name}
                                </CphText>
                            </Tooltip>
                        </CphFlex>
                        {testCase.result?.time ? (
                            <Chip
                                label={t('testCaseView.time', {
                                    time: testCase.result.time,
                                })}
                                size={'small'}
                                sx={{ marginLeft: 'auto', fontSize: '0.8rem' }}
                            />
                        ) : (
                            <></>
                        )}
                        <CphButton
                            name={t('testCaseView.run')}
                            icon={PlayArrowIcon}
                            color={'success'}
                            loading={running}
                            onClick={(e) => {
                                e.stopPropagation();
                                vscode.postMessage({
                                    type: 'runTestCase',
                                    index,
                                } as RunTestCaseMessage);
                            }}
                        />
                        <CphButton
                            name={t('testCaseView.delete')}
                            icon={DeleteIcon}
                            color={'error'}
                            onClick={(e) => {
                                e.stopPropagation();
                                vscode.postMessage({
                                    type: 'deleteTestCase',
                                    index,
                                } as DeleteTestCaseMessage);
                            }}
                        />
                    </CphFlex>
                </AccordionSummary>
                {testCase.isExpand && (
                    <AccordionDetails>
                        <CphFlex>
                            <CphFlex smallGap>
                                <TestCaseDataView
                                    label={t('testCaseView.stdin')}
                                    value={testCase.stdin}
                                    onBlur={(value) => {
                                        testCase.stdin = {
                                            useFile: false,
                                            data: value,
                                        };
                                        emitUpdateTestCase();
                                    }}
                                    onChooseFile={() =>
                                        vscode.postMessage({
                                            type: 'chooseTestCaseFile',
                                            index,
                                            label: 'stdin',
                                        } as ChooseTestCaseFileMessage)
                                    }
                                />
                                <TestCaseDataView
                                    label={t('testCaseView.answer')}
                                    value={testCase.answer}
                                    onBlur={(value) => {
                                        testCase.answer = {
                                            useFile: false,
                                            data: value,
                                        };
                                        emitUpdateTestCase();
                                    }}
                                    onChooseFile={() => {
                                        vscode.postMessage({
                                            type: 'chooseTestCaseFile',
                                            index,
                                            label: 'answer',
                                        } as ChooseTestCaseFileMessage);
                                    }}
                                />
                            </CphFlex>
                            {testCase.result && (
                                <>
                                    <Divider />
                                    <CphFlex smallGap>
                                        <TestCaseDataView
                                            label={t('testCaseView.stdout')}
                                            value={testCase.result.stdout}
                                            readOnly={true}
                                            outputActions={{
                                                onSetAnswer: () => {
                                                    testCase.answer =
                                                        testCase.result!.stdout;
                                                    testCase.result = undefined;
                                                    emitUpdateTestCase();
                                                },
                                                onCompare: () => {
                                                    vscode.postMessage({
                                                        type: 'compareTestCase',
                                                        index,
                                                    } as CompareTestCaseMessage);
                                                },
                                            }}
                                        />
                                        <TestCaseDataView
                                            label={t('testCaseView.stderr')}
                                            value={testCase.result.stderr}
                                            readOnly={true}
                                        />
                                        <TestCaseDataView
                                            label={t('testCaseView.message')}
                                            value={{
                                                useFile: false,
                                                data: testCase.result.message,
                                            }}
                                            readOnly={true}
                                        />
                                    </CphFlex>
                                </>
                            )}
                        </CphFlex>
                    </AccordionDetails>
                )}
            </Accordion>
        </ErrorBoundary>
    );
};

export default TestCaseView;
