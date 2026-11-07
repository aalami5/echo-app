import React, { createContext, useContext } from 'react';
import { useIsFocused } from '@react-navigation/native';

// Only the selected tab renders the shared view. The controller stays mounted
// in the tab layout, preserving unsent drafts, receipts, history and voice.
export const AssistantWorkspaceContext = createContext<React.ReactNode>(null);
export default function AssistantWorkspace() {
  const content = useContext(AssistantWorkspaceContext);
  const focused = useIsFocused();
  return focused ? <>{content}</> : null;
}
