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

import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Problem } from '../../utils/types';
import {
    ChooseFileMsg,
    EditProblemDetailsMsg,
    OpenFileMsg,
    RemoveFileMsg,
} from '../msgs';
import { basename } from '../utils';
import CphButton from './cphButton';
import CphFlex from './base/cphFlex';
import CphLink from './base/cphLink';
import CphText from './base/cphText';
import Typography from '@mui/material/Typography';

interface ProblemTitleProps {
    problem: Problem;
}

const ProblemTitle = ({ problem }: ProblemTitleProps) => {
    const { t } = useTranslation();
    const [isHoveringTitle, setHoveringTitle] = useState(false);
    const [isEditDialogOpen, setEditDialogOpen] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedUrl, setEditedUrl] = useState('');
    const [editedTimeLimit, setEditedTimeLimit] = useState(0);
    const [editedMemoryLimit, setEditedMemoryLimit] = useState(0);

    useEffect(() => {
        setEditedTitle(problem.name);
        setEditedUrl(problem.url || '');
        setEditedTimeLimit(problem.timeLimit);
        setEditedMemoryLimit(problem.memoryLimit);
    }, [problem.name, problem.url, problem.timeLimit, problem.memoryLimit]);

    const handleEditTitle = () => {
        setEditDialogOpen(true);
    };

    const handleEditDialogClose = () => {
        setEditDialogOpen(false);
        vscode.postMessage({
            type: 'editProblemDetails',
            title: editedTitle,
            url: editedUrl,
            timeLimit: editedTimeLimit,
            memoryLimit: editedMemoryLimit,
        } satisfies EditProblemDetailsMsg);
    };

    return (
        <Container>
            <CphFlex
                onMouseEnter={() => setHoveringTitle(true)}
                onMouseLeave={() => setHoveringTitle(false)}
            >
                <CphFlex
                    column
                    alignStart
                    flexShrink={1}
                    width={'unset'}
                >
                    <CphText
                        whiteSpace={'nowrap'}
                        sx={{ cursor: problem.url ? 'pointer' : 'default' }}
                        title={problem.name}
                        width={'100%'}
                    >
                        {problem.url ? (
                            <CphLink
                                href={problem.url}
                                name={problem.url}
                            >
                                {problem.name}
                            </CphLink>
                        ) : (
                            problem.name
                        )}
                    </CphText>
                    <CphText fontSize={'0.8rem'}>
                        {t('problemTitle.timeLimit', {
                            time: problem.timeLimit,
                        })}
                        &emsp;
                        {t('problemTitle.memoryLimit', {
                            memory: problem.memoryLimit,
                        })}
                        {problem.checker && (
                            <>
                                &emsp;
                                <CphLink
                                    name={problem.checker.path!}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'openFile',
                                            path: problem.checker!.path,
                                        } satisfies OpenFileMsg);
                                    }}
                                >
                                    {t('problemTitle.specialJudge')}
                                </CphLink>
                            </>
                        )}
                        &emsp;
                        <CphLink
                            name={problem.src.path}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'openFile',
                                    path: problem.src.path,
                                } satisfies OpenFileMsg);
                            }}
                        >
                            {basename(problem.src.path)}
                        </CphLink>
                    </CphText>
                </CphFlex>
                {isHoveringTitle && (
                    <CphButton
                        name={t('problemTitle.editTitle')}
                        icon={EditIcon}
                        color={'secondary'}
                        onClick={handleEditTitle}
                    />
                )}
            </CphFlex>
            <Dialog
                open={isEditDialogOpen}
                onClose={handleEditDialogClose}
            >
                <DialogTitle>{t('problemTitle.dialog.title')}</DialogTitle>
                <DialogContent>
                    <TextField
                        variant={'outlined'}
                        margin={'normal'}
                        label={t('problemTitle.dialog.field.title')}
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        fullWidth
                        autoFocus
                    />
                    <TextField
                        variant={'outlined'}
                        margin={'normal'}
                        label={t('problemTitle.dialog.field.url')}
                        value={editedUrl}
                        onChange={(e) => setEditedUrl(e.target.value)}
                        fullWidth
                        type={'url'}
                    />
                    <TextField
                        variant={'outlined'}
                        margin={'normal'}
                        label={t('problemTitle.dialog.field.time')}
                        value={editedTimeLimit}
                        onChange={(e) =>
                            (!e.target.value || parseInt(e.target.value)) &&
                            setEditedTimeLimit(
                                Math.min(parseInt(e.target.value), 1000 * 60),
                            )
                        }
                        fullWidth
                        type={'number'}
                    />
                    <TextField
                        variant={'outlined'}
                        margin={'normal'}
                        label={t('problemTitle.dialog.field.memory')}
                        value={editedMemoryLimit}
                        onChange={(e) =>
                            (!e.target.value || parseInt(e.target.value)) &&
                            setEditedMemoryLimit(
                                Math.min(parseInt(e.target.value), 1024 * 16),
                            )
                        }
                        fullWidth
                        type={'number'}
                    />
                    <CphFlex>
                        <Typography>
                            {t('problemTitle.dialog.field.specialJudge')}
                        </Typography>
                        {problem.checker ? (
                            <>
                                <CphLink
                                    name={problem.checker.path}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'openFile',
                                            path: problem.checker!.path,
                                        } satisfies OpenFileMsg);
                                    }}
                                >
                                    {basename(problem.checker.path)}
                                </CphLink>
                                <CphButton
                                    icon={CloseIcon}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'removeFile',
                                            file: 'checker',
                                        } satisfies RemoveFileMsg);
                                    }}
                                    name={t(
                                        'problemTitle.dialog.button.removeChecker',
                                    )}
                                />
                            </>
                        ) : (
                            <CphButton
                                icon={FileOpenIcon}
                                onClick={() => {
                                    vscode.postMessage({
                                        type: 'chooseFile',
                                        file: 'checker',
                                    } satisfies ChooseFileMsg);
                                }}
                                name={t(
                                    'problemTitle.dialog.button.chooseChecker',
                                )}
                            />
                        )}
                    </CphFlex>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setEditDialogOpen(false)}
                        color={'primary'}
                    >
                        {t('problemTitle.dialog.cancel')}
                    </Button>
                    <Button
                        onClick={handleEditDialogClose}
                        color={'primary'}
                        autoFocus
                    >
                        {t('problemTitle.dialog.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default ProblemTitle;
