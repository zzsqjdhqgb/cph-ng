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

import { BoxProps } from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import React, { useState } from 'react';

interface CphMenuProps extends BoxProps {
    children: React.ReactNode;
    menu: Record<string, () => void>;
}

const CphMenu = ({ children, menu }: CphMenuProps) => {
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
    } | null>(null);

    const handleContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();

        setContextMenu(
            contextMenu === null
                ? {
                      mouseX: event.clientX + 2,
                      mouseY: event.clientY - 6,
                  }
                : null,
        );

        const selection = document.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);

            setTimeout(() => {
                selection.addRange(range);
            });
        }
    };

    const handleClose = () => {
        setContextMenu(null);
    };

    return (
        <div
            onContextMenu={handleContextMenu}
            style={{ cursor: 'context-menu' }}
        >
            {children}
            <Menu
                open={contextMenu !== null}
                onClose={handleClose}
                anchorReference='anchorPosition'
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                {Object.entries(menu).map(([key, value]) => (
                    <MenuItem
                        dense
                        key={key}
                        onClick={() => {
                            value();
                            handleClose();
                        }}
                    >
                        {key}
                    </MenuItem>
                ))}
            </Menu>
        </div>
    );
};

export default CphMenu;
