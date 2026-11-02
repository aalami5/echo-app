import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/theme';
import type { UpdateCard as Card } from '../services/chatUpdates';

export function UpdateCard({ card, timestamp, unread, onRead, onDiscuss, renderBody }: {
  card: Card; timestamp?: string; unread: boolean; onRead: () => void; onDiscuss: () => void; renderBody: (body: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const date = timestamp ? new Date(timestamp) : null;
  return <View style={{backgroundColor: colors.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: unread ? colors.primary : colors.border, padding: 14, marginVertical: 6}}>
    <Text style={{color: colors.textSecondary, fontSize: 12}}>{unread ? 'NEW · ' : ''}{card.kind === 'attention' ? 'NEEDS ATTENTION' : card.kind.toUpperCase()}{card.priority === 'urgent' ? ' · URGENT' : ''}{date && !Number.isNaN(date.valueOf()) ? ` · ${date.toLocaleString()}` : ''}</Text>
    <Text style={{color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginVertical: 8}}>{card.title}</Text>
    {!!card.summary && <Text style={{color: colors.textSecondary, fontSize: 15, lineHeight: 22}}>{card.summary}</Text>}
    {expanded && <View style={{marginTop: 12}}>{renderBody(card.body)}</View>}
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse update' : 'Read full update'} onPress={() => { setExpanded(!expanded); if (!expanded) onRead(); }} style={{minHeight:44, justifyContent:'center'}}><Text style={{color: colors.primary}}>{expanded ? 'Show less' : 'Read full update'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Discuss this update" onPress={() => {onRead(); onDiscuss();}} style={{minHeight:44, justifyContent:'center'}}><Text style={{color: colors.primary}}>Discuss with Echo</Text></TouchableOpacity>
    </View>
  </View>;
}
