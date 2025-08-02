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

import AddIcon from '@mui/icons-material/Add';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
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
import { isRunningVerdict, Problem } from '../../types';
import {
    AddTestCaseMessage,
    DeleteProblemMessage,
    LoadTestCasesMessage,
    RunTestCasesMessage,
    StopTestCasesMessage,
} from '../messages';
import CphButton from './cphButton';
import CphFlex from './cphFlex';

interface ProblemActionsProps {
    problem: Problem;
}

const ProblemActions = ({ problem }: ProblemActionsProps) => {
    const { t } = useTranslation();
    const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const hasRunning = problem.testCases.some((tc) =>
        isRunningVerdict(tc.result?.verdict),
    );

    const handleDelete = () => {
        vscode.postMessage({ type: 'deleteProblem' } as DeleteProblemMessage);
        setDeleteDialogOpen(false);
    };

    return (
        <>
            <Container>
                <CphFlex smallGap>
                    <CphButton
                        larger={true}
                        name={t('problemActions.addTestCase')}
                        icon={AddIcon}
                        onClick={() => {
                            vscode.postMessage({
                                type: 'addTestCase',
                            } as AddTestCaseMessage);
                        }}
                    />
                    <CphButton
                        larger={true}
                        name={t('problemActions.loadTestCases')}
                        icon={FileCopyIcon}
                        onClick={() => {
                            vscode.postMessage({
                                type: 'loadTestCases',
                            } as LoadTestCasesMessage);
                        }}
                    />
                    {hasRunning ? (
                        <CphButton
                            larger={true}
                            name={t('problemActions.stopTestCases')}
                            icon={PlaylistRemoveIcon}
                            color={'warning'}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'stopTestCases',
                                } as StopTestCasesMessage);
                            }}
                        />
                    ) : (
                        <CphButton
                            larger={true}
                            name={t('problemActions.runAll')}
                            icon={PlaylistPlayIcon}
                            color={'success'}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'runTestCases',
                                } as RunTestCasesMessage);
                            }}
                        />
                    )}
                    <CphButton
                        larger={true}
                        name={t('problemActions.deleteProblem')}
                        icon={DeleteForeverIcon}
                        color={'error'}
                        onClick={() => setDeleteDialogOpen(true)}
                    />
                </CphFlex>
            </Container>
            <Dialog
                open={isDeleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>{t('problemActions.dialog.title')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('problemActions.dialog.content')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDeleteDialogOpen(false)}
                        color={'primary'}
                    >
                        {t('problemActions.dialog.cancel')}
                    </Button>
                    <Button
                        onClick={handleDelete}
                        color={'primary'}
                        autoFocus
                    >
                        {t('problemActions.dialog.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ProblemActions;
