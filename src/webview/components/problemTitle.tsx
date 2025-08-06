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
import Checkbox from '@mui/material/Checkbox';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Problem } from '../../utils/types';
import {
    ChooseCheckerFileMsg,
    EditProblemDetailsMsg,
    OpenFileMsg,
} from '../msgs';
import { basename } from '../utils';
import CphButton from './cphButton';
import CphFlex from './base/cphFlex';
import CphLink from './base/cphLink';
import CphText from './base/cphText';

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
    const [editedIsSpecialJudge, setEditedIsSpecialJudge] = useState(false);

    useEffect(() => {
        setEditedTitle(problem.name);
        setEditedUrl(problem.url || '');
        setEditedTimeLimit(problem.timeLimit);
        setEditedIsSpecialJudge(problem.isSpecialJudge || false);
    }, [problem.name, problem.url, problem.timeLimit, problem.isSpecialJudge]);

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
            isSpecialJudge: editedIsSpecialJudge,
        } as EditProblemDetailsMsg);
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
                        {problem.isSpecialJudge && (
                            <>
                                &emsp;
                                <CphLink
                                    name={problem.checkerPath!}
                                    onClick={() => {
                                        vscode.postMessage({
                                            type: 'openFile',
                                            path: problem.checkerPath!,
                                        } as OpenFileMsg);
                                    }}
                                >
                                    {t('problemTitle.specialJudge')}
                                </CphLink>
                            </>
                        )}
                        &emsp;
                        <CphLink
                            name={problem.srcPath}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'openFile',
                                    path: problem.srcPath,
                                } as OpenFileMsg);
                            }}
                        >
                            {basename(problem.srcPath)}
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
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={editedIsSpecialJudge}
                                onChange={(e) =>
                                    setEditedIsSpecialJudge(e.target.checked)
                                }
                                color={'primary'}
                            />
                        }
                        label={t('problemTitle.dialog.field.specialJudge')}
                    />
                    {editedIsSpecialJudge && (
                        <Button
                            variant={'contained'}
                            color={'primary'}
                            onClick={() => {
                                vscode.postMessage({
                                    type: 'chooseCheckerFile',
                                } as ChooseCheckerFileMsg);
                            }}
                        >
                            {t('problemTitle.dialog.field.chooseCheckerFile')}
                        </Button>
                    )}
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
