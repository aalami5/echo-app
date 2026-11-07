import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, CameraCapturedPicture, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/theme';

// Mounted only while foreground + focused: leaving the tab/background immediately releases camera.
export function AssistantCamera({ busy, onCapture, onClose }: { busy: boolean; onCapture: (photo: CameraCapturedPicture) => Promise<void>; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false), [taking, setTaking] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), captureLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => { mounted.current = false; onClose(); };
  const capture = async () => {
    if (!ready || captureLock.current || busy) return;
    captureLock.current = true; setTaking(true); setError(null);
    try { const p = await camera.current?.takePictureAsync({ quality: 0.85 }); if (mounted.current && p) setPhoto(p); }
    catch { if (mounted.current) setError('Could not capture that image. Please try again.'); }
    finally { captureLock.current = false; if (mounted.current) setTaking(false); }
  };
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={[s.button, disabled && {opacity:0.4}]}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
  return <View style={s.root} testID="assistant-live-camera">
    <View style={s.row}><Text style={s.title}>{photo ? 'Review photo' : 'Live Camera'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close camera and return to conversation" onPress={close} hitSlop={8} style={s.close}>
      <Ionicons name="close" size={26} color={colors.textPrimary}/><Text style={s.buttonText}>Close</Text>
    </TouchableOpacity></View>
    <Text style={s.hint}>{photo ? 'Add this photo, then tap Send to share it with Echo.' : 'Live preview · only captured photos are sent when you tap Send.'}</Text>
    {!permission ? <ActivityIndicator color={colors.primary}/> : !permission.granted ? <View style={s.permission}><Text style={s.hint}>Allow camera access to capture a photo. Your microphone connection is separate.</Text>{button(permission.canAskAgain ? 'Allow camera' : 'Open camera settings', () => { void (permission.canAskAgain ? requestPermission() : Platform.OS === 'web' ? Promise.reject(new Error('Allow camera access in your browser site settings.')) : Linking.openSettings()).catch((e: Error) => setError(e.message)); })}</View> : photo ? <Image accessibilityLabel="Captured photo preview" source={{uri:photo.uri}} resizeMode="contain" style={s.preview}/> : <CameraView ref={camera} style={s.preview} facing={facing} mode="picture" mute onCameraReady={() => setReady(true)} onMountError={e => {setReady(false);setError(e.message);}} />}
    {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {photo ? <View style={s.row}>
      {button('Retake', () => {setPhoto(null);setReady(false);}, busy)}
      {button(busy ? 'Adding…' : 'Add photo', () => {void onCapture(photo).catch((e: Error) => {if (mounted.current) setError(e.message);});}, busy)}
    </View> : <View style={s.captureControls}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Flip camera" disabled={!permission?.granted || taking || busy}
        onPress={() => {setReady(false);setFacing(f => f === 'back' ? 'front' : 'back');}}
        style={[s.sideControl, (!permission?.granted || taking || busy) && s.disabled]}>
        <Ionicons name="camera-reverse-outline" size={28} color={colors.textPrimary}/>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Take photo" accessibilityState={{disabled: !ready || taking || busy, busy: taking}}
        disabled={!ready || taking || busy} onPress={() => {void capture();}}
        style={[s.shutter, (!ready || taking || busy) && s.disabled]}>
        {taking ? <ActivityIndicator color={colors.textInverse}/> : <View style={s.shutterCenter}/>}
      </TouchableOpacity>
      <View style={s.sideControl}/>
    </View>}

  </View>;
}
const s = StyleSheet.create({
  close:{minHeight:44,minWidth:80,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,backgroundColor:colors.surfaceElevated,borderRadius:22,paddingHorizontal:12},
  captureControls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:8,paddingHorizontal:12},
  sideControl:{width:48,height:48,alignItems:'center',justifyContent:'center'},
  shutter:{width:72,height:72,borderRadius:36,borderWidth:3,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
  shutterCenter:{width:58,height:58,borderRadius:29,backgroundColor:'#fff'},
  disabled:{opacity:0.4},root:{flex:1,minHeight:0,padding:12,gap:8},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6},title:{fontSize:19,fontWeight:'600',color:colors.textPrimary},hint:{color:colors.textSecondary,fontSize:13,lineHeight:18},preview:{flex:1,minHeight:100,backgroundColor:'#000',borderRadius:16,overflow:'hidden'},permission:{flex:1,justifyContent:'center',gap:16},button:{backgroundColor:colors.surfaceElevated,padding:12,borderRadius:16,minHeight:44,justifyContent:'center'},buttonText:{color:colors.primary,fontSize:14,fontWeight:'600'},error:{color:colors.warning,fontSize:13}});
