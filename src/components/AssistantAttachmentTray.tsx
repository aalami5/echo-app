import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AssistantAttachment } from '../services/assistantMedia';
import { colors } from '../constants/theme';
export function AssistantAttachmentTray({ files, disabled, onRemove }: { files: AssistantAttachment[]; disabled: boolean; onRemove: (id: string) => void }) {
  if (!files.length) return null;
  return <View><Text style={s.hint}>Ready to send · {files.length}/5</Text><ScrollView horizontal style={{ maxHeight: 90 }} contentContainerStyle={{ gap: 8, paddingVertical: 6 }} keyboardShouldPersistTaps="handled">{files.map(f => <View key={f.id} style={s.item}>
    {f.image ? <Image source={{ uri: f.uri }} accessibilityLabel={f.fileName} style={s.image}/> : <Ionicons name="document-outline" color={colors.textSecondary} size={28}/>}
    <Text numberOfLines={2} style={s.name}>{f.fileName}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${f.fileName}`} disabled={disabled} onPress={() => onRemove(f.id)} style={s.remove}><Ionicons name="close" size={20} color={colors.textPrimary}/></TouchableOpacity>
  </View>)}</ScrollView></View>;
}
const s=StyleSheet.create({hint:{color:colors.textSecondary,fontSize:12},item:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:colors.surface,borderRadius:12,padding:6},image:{width:52,height:52,borderRadius:8},name:{maxWidth:100,color:colors.textSecondary,fontSize:12},remove:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}});
