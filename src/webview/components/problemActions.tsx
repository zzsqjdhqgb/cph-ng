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

import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import BackupIcon from '@mui/icons-material/Backup';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRunningVerdict, Problem } from '../../utils/types';
import {
    AddTcMsg,
    ChooseFileMsg,
    DelProblemMsg,
    LoadTcsMsg,
    OpenFileMsg,
    RemoveFileMsg,
    RunTcsMsg,
    StartBfCompareMsg,
    StopBfCompareMsg,
    StopTcsMsg,
    SubmitToCodeforcesMsg,
} from '../msgs';
import CphButton from './cphButton';
import CphFlex from './base/cphFlex';
import CphLink from './base/cphLink';
import Typography from '@mui/material/Typography';
import { basename } from '../utils';

interface ProblemActionsProps {
    problem: Problem;
}

const ProblemActions = ({ problem }: ProblemActionsProps) => {
    const { t } = useTranslation();
    const [isDelDialogOpen, setDelDialogOpen] = useState(false);
    const [isBfCompareDialogOpen, setBfCompareDialogOpen] = useState(false);
    const hasRunning = problem.tcs.some((tc) =>
        isRunningVerdict(tc.result?.verdict),
    );

    return (
        <>
            <Container>
                <CphFlex smallGap>
                    <CphButton
                        larger={true}
                        name={t('problemActions.addTc')}
                        icon={AddIcon}
                        onClick={() => {
                            vscode.postMessage({
                                type: 'addTc',
                            } satisfies AddTcMsg);
                        }}
                    />
                    <CphButton
                        larger={true}
                        name={t('problemActions.loadTcs')}
                        icon={FileCopyIcon}
                        onClick={() => {
                            vscode.postMessage({
                                type: 'loadTcs',
                            } satisfies LoadTcsMsg);
                        }}
                    />
                    {hasRunning ? (
                        <CphButton
                            larger={true}
                            name={t('problemActions.stopTcs')}
                            icon={PlaylistRemoveIcon}
                            color={'warning'}
                            onClick={(e) => {
                                vscode.postMessage({
                                    type: 'stopTcs',
                                    onlyOne: e.ctrlKey,
                                } satisfies StopTcsMsg);
                            }}
                        />
                    ) : (
                        <CphButton
                            larger={true}
                            name={t('problemActions.runTcs')}
                            icon={PlaylistPlayIcon}
                            color={'success'}
                            onClick={(e) => {
                                vscode.postMessage({
                                    type: 'runTcs',
                                    compile: e.altKey
                                        ? false
                                        : e.ctrlKey
                                          ? true
                                          : null,
                                } satisfies RunTcsMsg);
                            }}
                        />
                    )}
                    <CphButton
                        larger={true}
                        name={t('problemActions.bfCompare')}
                        icon={CompareArrowsIcon}
                        onClick={() => setBfCompareDialogOpen(true)}
                        sx={
                            problem.bfCompare?.running
                                ? {
                                      'animation': 'pulse 1s infinite',
                                      '@keyframes pulse': {
                                          '0%': {
                                              opacity: 1,
                                          },
                                          '50%': {
                                              opacity: 0.2,
                                          },
                                          '100%': {
                                              opacity: 1,
                                          },
                                      },
                                  }
                                : undefined
                        }
                    />
                    {(() => {
                        if (!problem.url) return null;
                        try {
                            if (
                                new URL(problem.url).hostname ===
                                'codeforces.com'
                            ) {
                                return (
                                    <CphButton
                                        larger={true}
                                        name={t(
                                            'problemActions.submitToCodeforces',
                                        )}
                                        icon={BackupIcon}
                                        color={'success'}
                                        onClick={() => {
                                            vscode.postMessage({
                                                type: 'submitToCodeforces',
                                            } satisfies SubmitToCodeforcesMsg);
                                        }}
                                    />
                                );
                            }
                        } catch {}
                        return null;
                    })()}
                    <CphButton
                        larger={true}
                        name={t('problemActions.deleteProblem')}
                        icon={DeleteForeverIcon}
                        color={'error'}
                        onClick={() => setDelDialogOpen(true)}
                    />
                </CphFlex>
            </Container>
            <Dialog
                open={isDelDialogOpen}
                onClose={() => setDelDialogOpen(false)}
            >
                <DialogTitle>{t('problemActions.delDialog.title')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('problemActions.delDialog.content')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDelDialogOpen(false)}
                        color={'primary'}
                    >
                        {t('problemActions.delDialog.cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            vscode.postMessage({
                                type: 'delProblem',
                            } as DelProblemMsg);
                            setDelDialogOpen(false);
                        }}
                        color={'primary'}
                        autoFocus
                    >
                        {t('problemActions.delDialog.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                fullWidth
                maxWidth='lg'
                open={isBfCompareDialogOpen}
                onClose={() => setBfCompareDialogOpen(false)}
            >
                <DialogTitle>
                    {t('problemActions.bfCompareDialog.title')}
                </DialogTitle>
                <CphButton
                    name={t('problemActions.bfCompareDialog.close')}
                    onClick={() => setBfCompareDialogOpen(false)}
                    sx={(theme) => ({
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: theme.palette.grey[500],
                    })}
                    icon={CloseIcon}
                />
                <DialogContent>
                    <CphFlex column>
                        <CphFlex>
                            <Typography>
                                {t('problemActions.bfCompareDialog.generator')}
                            </Typography>
                            {problem.bfCompare?.generator ? (
                                <>
                                    <CphLink
                                        name={problem.bfCompare.generator.path}
                                        onClick={() => {
                                            vscode.postMessage({
                                                type: 'openFile',
                                                path: problem.bfCompare!
                                                    .generator!.path,
                                            } satisfies OpenFileMsg);
                                        }}
                                    >
                                        {basename(
                                            problem.bfCompare.generator.path,
                                        )}
                                    </CphLink>
                                    <CphButton
                                        icon={CloseIcon}
                                        onClick={() => {
                                            vscode.postMessage({
                                                type: 'removeFile',
                                                file: 'generator',
                                            } satisfies RemoveFileMsg);
                                        }}
                                        name={t(
                                            'problemActions.bfCompareDialog.button.removeGenerator',
                                        )}
                                    />
                                </>
                            ) : (
                                <CphButton
                                    icon={FileOpenIcon}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'chooseFile',
                                            file: 'generator',
                                        } satisfies ChooseFileMsg);
                                    }}
                                    name={t(
                                        'problemActions.bfCompareDialog.button.chooseGenerator',
                                    )}
                                />
                            )}
                        </CphFlex>
                        <CphFlex>
                            <Typography>
                                {t('problemActions.bfCompareDialog.bruteForce')}
                            </Typography>
                            {problem.bfCompare?.bruteForce ? (
                                <>
                                    <CphLink
                                        name={problem.bfCompare.bruteForce.path}
                                        onClick={() => {
                                            vscode.postMessage({
                                                type: 'openFile',
                                                path: problem.bfCompare!
                                                    .bruteForce!.path,
                                            } satisfies OpenFileMsg);
                                        }}
                                    >
                                        {basename(
                                            problem.bfCompare.bruteForce.path,
                                        )}
                                    </CphLink>
                                    <CphButton
                                        icon={CloseIcon}
                                        onClick={() => {
                                            vscode.postMessage({
                                                type: 'removeFile',
                                                file: 'bruteForce',
                                            } satisfies RemoveFileMsg);
                                        }}
                                        name={t(
                                            'problemActions.bfCompareDialog.button.removeBruteForce',
                                        )}
                                    />
                                </>
                            ) : (
                                <CphButton
                                    icon={FileOpenIcon}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'chooseFile',
                                            file: 'bruteForce',
                                        } satisfies ChooseFileMsg);
                                    }}
                                    name={t(
                                        'problemActions.bfCompareDialog.button.chooseBruteForce',
                                    )}
                                />
                            )}
                        </CphFlex>
                        <CphFlex>{problem.bfCompare?.msg}</CphFlex>
                        {problem.bfCompare?.running ? (
                            <CphButton
                                name={t('problemActions.bfCompareDialog.stop')}
                                onClick={() => {
                                    vscode.postMessage({
                                        type: 'stopBfCompare',
                                    } as StopBfCompareMsg);
                                }}
                                icon={StopCircleIcon}
                                color={'warning'}
                            />
                        ) : (
                            <CphButton
                                name={t('problemActions.bfCompareDialog.run')}
                                onClick={() => {
                                    vscode.postMessage({
                                        type: 'startBfCompare',
                                    } as StartBfCompareMsg);
                                }}
                                icon={PlayCircleIcon}
                                color={'success'}
                                disabled={
                                    !problem.bfCompare?.generator ||
                                    !problem.bfCompare?.bruteForce
                                }
                            />
                        )}
                    </CphFlex>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default ProblemActions;
