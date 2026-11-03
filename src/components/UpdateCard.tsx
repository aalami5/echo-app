import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/theme';
import type { UpdateCard as Card } from '../services/chatUpdates';

export function UpdateCard({ card, unread, onRead, onDiscuss, renderBody }: {
  card: Card; unread: boolean; onRead: () => void; onDiscuss: () => void; renderBody: (body: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = card.summary.trim() || card.title;
  return <View style={{backgroundColor: colors.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: unread ? colors.primary : colors.border, padding: 14, marginVertical: 6}}>
    <Text style={{color: colors.textPrimary, fontSize: 15, lineHeight: 22}}>{description}</Text>
    {expanded && <View style={{marginTop: 12}}>{renderBody(card.body)}</View>}
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse update' : 'Read full update'} accessibilityState={{expanded}} onPress={() => { setExpanded(!expanded); if (!expanded) onRead(); }} style={{minHeight:44, justifyContent:'center'}}><Text style={{color: colors.primary}}>{expanded ? 'Close' : 'Read'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Discuss this update" onPress={() => {onRead(); onDiscuss();}} style={{minHeight:44, justifyContent:'center'}}><Text style={{color: colors.primary}}>Discuss</Text></TouchableOpacity>
    </View>
  </View>;
}
