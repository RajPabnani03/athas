import {
  ArrowsIn,
  Broom,
  SortAscending,
  SortDescending,
  TextAa,
  TextT,
} from "@phosphor-icons/react";
import {
  joinActiveEditorLines,
  sortActiveEditorLinesAscending,
  sortActiveEditorLinesDescending,
  transformActiveEditorToLowercase,
  transformActiveEditorToTitleCase,
  transformActiveEditorToUppercase,
  trimActiveEditorTrailingWhitespace,
} from "@/features/keymaps/commands/editor-command-actions";
import type { Action } from "../models/action.types";

interface EditActionsParams {
  onClose: () => void;
}

export const createEditActions = ({ onClose }: EditActionsParams): Action[] => [
  {
    id: "edit-sort-lines-ascending",
    label: "Edit: Sort Lines Ascending",
    description: "Sort the selected lines (or current line) alphabetically A→Z",
    icon: <SortAscending />,
    category: "Edit",
    commandId: "editor.sortLinesAscending",
    action: () => {
      onClose();
      sortActiveEditorLinesAscending();
    },
  },
  {
    id: "edit-sort-lines-descending",
    label: "Edit: Sort Lines Descending",
    description: "Sort the selected lines (or current line) alphabetically Z→A",
    icon: <SortDescending />,
    category: "Edit",
    commandId: "editor.sortLinesDescending",
    action: () => {
      onClose();
      sortActiveEditorLinesDescending();
    },
  },
  {
    id: "edit-transform-uppercase",
    label: "Edit: Transform to Uppercase",
    description: "Convert the selection (or current line) to uppercase",
    icon: <TextAa />,
    category: "Edit",
    commandId: "editor.transformToUppercase",
    action: () => {
      onClose();
      transformActiveEditorToUppercase();
    },
  },
  {
    id: "edit-transform-lowercase",
    label: "Edit: Transform to Lowercase",
    description: "Convert the selection (or current line) to lowercase",
    icon: <TextT />,
    category: "Edit",
    commandId: "editor.transformToLowercase",
    action: () => {
      onClose();
      transformActiveEditorToLowercase();
    },
  },
  {
    id: "edit-transform-title-case",
    label: "Edit: Transform to Title Case",
    description: "Capitalize the first letter of every word in the selection",
    icon: <TextAa />,
    category: "Edit",
    commandId: "editor.transformToTitleCase",
    action: () => {
      onClose();
      transformActiveEditorToTitleCase();
    },
  },
  {
    id: "edit-join-lines",
    label: "Edit: Join Lines",
    description: "Join the selected lines (or the current line with the next) into one",
    icon: <ArrowsIn />,
    category: "Edit",
    commandId: "editor.joinLines",
    action: () => {
      onClose();
      joinActiveEditorLines();
    },
  },
  {
    id: "edit-trim-trailing-whitespace",
    label: "Edit: Trim Trailing Whitespace",
    description: "Remove trailing spaces and tabs from every line in the document",
    icon: <Broom />,
    category: "Edit",
    commandId: "editor.trimTrailingWhitespace",
    action: () => {
      onClose();
      trimActiveEditorTrailingWhitespace();
    },
  },
];
