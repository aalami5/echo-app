import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';
import { RECOVERY_PAUSED_MESSAGE } from '../services/startupRecovery';
export function RecoveryPaused() {
  return <View style={s.page}><Text style={s.title}>Saved records are preserved</Text><Text accessibilityRole="alert" style={s.body}>{RECOVERY_PAUSED_MESSAGE}</Text><Text style={s.body}>Chat, Live Voice, Settings and approvals remain available.</Text></View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.background,padding:24,paddingTop:90},title:{fontSize:24,color:colors.textPrimary,marginBottom:20},body:{fontSize:17,color:colors.textPrimary,marginBottom:20,lineHeight:25}});
