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
import { isRunningVerdict, Problem } from '../../utils/types';
import {
    AddTcMsg,
    DelProblemMsg,
    LoadTcsMsg,
    RunTcsMsg,
    StopTcsMsg,
} from '../msgs';
import CphButton from './cphButton';
import CphFlex from './cphFlex';

interface ProblemActionsProps {
    problem: Problem;
}

const ProblemActions = ({ problem }: ProblemActionsProps) => {
    const { t } = useTranslation();
    const [isDelDialogOpen, setDelDialogOpen] = useState(false);
    const hasRunning = problem.tcs.some((tc) =>
        isRunningVerdict(tc.result?.verdict),
    );

    const handleDel = () => {
        vscode.postMessage({ type: 'delProblem' } as DelProblemMsg);
        setDelDialogOpen(false);
    };

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
                            } as AddTcMsg);
                        }}
                    />
                    <CphButton
                        larger={true}
                        name={t('problemActions.loadTcs')}
                        icon={FileCopyIcon}
                        onClick={() => {
                            vscode.postMessage({
                                type: 'loadTcs',
                            } as LoadTcsMsg);
                        }}
                    />
                    {hasRunning ? (
                        <CphButton
                            larger={true}
                            name={t('problemActions.stopTcs')}
                            icon={PlaylistRemoveIcon}
                            color={'warning'}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'stopTcs',
                                } as StopTcsMsg);
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
                                          : undefined,
                                } as RunTcsMsg);
                            }}
                        />
                    )}
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
                <DialogTitle>{t('problemActions.dialog.title')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('problemActions.dialog.content')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDelDialogOpen(false)}
                        color={'primary'}
                    >
                        {t('problemActions.dialog.cancel')}
                    </Button>
                    <Button
                        onClick={handleDel}
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
