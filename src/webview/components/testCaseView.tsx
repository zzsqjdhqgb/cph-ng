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
import { isRunningStatus, TestCase } from '../../types';
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

interface TestCaseViewProp {
    testCase: TestCase;
    index: number;
}

const TestCaseView = ({ testCase, index }: TestCaseViewProp) => {
    const { t } = useTranslation();
    const running = isRunningStatus(testCase.status);

    const emitUpdateTestCase = () =>
        vscode.postMessage({
            type: 'updateTestCase',
            index,
            testCase,
        } as UpdateTestCaseMessage);

    return (
        <Accordion
            expanded={testCase.isExpand}
            disableGutters={true}
            onChange={(_, expanded) => {
                testCase.isExpand = expanded;
                emitUpdateTestCase();
            }}
            sx={{
                borderLeft: `4px solid`,
                ...(testCase.status
                    ? {
                          borderLeftColor: `rgb(${testCase.status.color})`,
                          backgroundColor: `rgba(${testCase.status.color}, 0.1)`,
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
                        <Tooltip title={testCase.status?.fullName}>
                            <CphText>{testCase.status?.name}</CphText>
                        </Tooltip>
                    </CphFlex>
                    {testCase.time && (
                        <Chip
                            label={t('testCaseView.time', {
                                time: testCase.time,
                            })}
                            size={'small'}
                            sx={{ marginLeft: 'auto', fontSize: '0.8rem' }}
                        />
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
                                label={t('testCaseView.input')}
                                isFile={testCase.inputFile}
                                value={testCase.input}
                                onBlur={(value) => {
                                    testCase.inputFile = false;
                                    testCase.input = value;
                                    emitUpdateTestCase();
                                }}
                                onChooseFile={() =>
                                    vscode.postMessage({
                                        type: 'chooseTestCaseFile',
                                        index,
                                        label: 'input',
                                    } as ChooseTestCaseFileMessage)
                                }
                            />
                            <TestCaseDataView
                                label={t('testCaseView.answer')}
                                isFile={testCase.answerFile}
                                value={testCase.answer}
                                onBlur={(value) => {
                                    testCase.answerFile = false;
                                    testCase.answer = value;
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
                        {!running && (
                            <>
                                <Divider />
                                <CphFlex smallGap>
                                    <TestCaseDataView
                                        label={t('testCaseView.output')}
                                        isFile={testCase.outputFile}
                                        value={testCase.output ?? ''}
                                        readOnly={true}
                                        outputActions={{
                                            onSetAnswer: () => {
                                                testCase.status = undefined;
                                                testCase.answer =
                                                    testCase.output ?? '';
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
                                    {testCase.error &&
                                        testCase.error.length > 0 && (
                                            <TestCaseDataView
                                                label={t('testCaseView.error')}
                                                value={testCase.error}
                                                readOnly={true}
                                            />
                                        )}
                                    {testCase.message &&
                                        testCase.message.length > 0 && (
                                            <TestCaseDataView
                                                label={t(
                                                    'testCaseView.message',
                                                )}
                                                value={testCase.message}
                                                readOnly={true}
                                            />
                                        )}
                                </CphFlex>
                            </>
                        )}
                    </CphFlex>
                </AccordionDetails>
            )}
        </Accordion>
    );
};

export default TestCaseView;
