/**
 * Patient Scan Hook
 * 
 * Handles camera/library image capture and OCR extraction
 * of patient details (name, MRN, DOB, room, chief complaint).
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { deleteAsync } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { clinicalMediaRequest } from '../services/clinicalMedia';
import { Hospital } from '../stores/patientsStore';

export interface ScannedPatientData {
  name?: string;
  mrn?: string;
  dob?: string;
  room?: string;
  hospital?: Hospital;
  chiefComplaint?: string;
}

interface UsePatientScanResult {
  isScanning: boolean;
  isProcessing: boolean;
  error: string | null;
  scannedData: ScannedPatientData | null;
  imageUri: string | null;
  scanFromCamera: () => Promise<ScannedPatientData | null>;
  scanFromLibrary: () => Promise<ScannedPatientData | null>;
  clearScan: () => void;
}

// Hospital name to code mapping
const HOSPITAL_KEYWORDS: Record<string, Hospital> = {
  'sequoia': 'SEQ',
  'seq': 'SEQ',
  'el camino': 'ECH',
  'elcamino': 'ECH',
  'ech': 'ECH',
  'san mateo': 'SMCMC',
  'smcmc': 'SMCMC',
  'county': 'SMCMC',
  'mills': 'Mills',
  'peninsula': 'Mills',
  'burlingame': 'Mills',
};

function detectHospital(text: string): Hospital | undefined {
  const lowerText = text.toLowerCase();
  for (const [keyword, code] of Object.entries(HOSPITAL_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      return code;
    }
  }
  return undefined;
}

export function usePatientScan(): UsePatientScanResult {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedPatientData | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  
  // Convert HEIC/PNG/camera captures to a bounded JPEG; avoid forced cropping
  // and heavy compression that make small MRN/DOB characters unreadable.
  const processImage = useCallback(async (uri: string, width?: number): Promise<ScannedPatientData | null> => {
    setIsProcessing(true);
    setError(null);
    let convertedUri: string | undefined;
    try {
      const image = await manipulateAsync(uri, !width || width > 2200 ? [{resize:{width:2200}}] : [], {compress:0.85,format:SaveFormat.JPEG,base64:true});
      convertedUri = image.uri;
      if (!image.base64) throw new Error('The photo could not be read. Please try another image.');
      const parsed = await clinicalMediaRequest('/scan', () => JSON.stringify({imageBase64:image.base64,mimeType:'image/jpeg'}), true);
      const field = (key: string): string | undefined => typeof parsed[key] === 'string' && parsed[key].trim() ? parsed[key].trim() : undefined;
      const data: ScannedPatientData = {name:field('name'),mrn:field('mrn'),dob:field('dob'),room:field('room'),hospital:field('hospital') ? detectHospital(field('hospital')!) : undefined,chiefComplaint:field('chiefComplaint')};
      if (!Object.values(data).some(Boolean)) throw new Error('No readable patient details found. Please use a closer photo of one patient label.');
      setScannedData(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to process image');
      return null;
    } finally {
      setIsProcessing(false);
      if (convertedUri && convertedUri !== uri) await deleteAsync(convertedUri,{idempotent:true}).catch(()=>{});
    }
  }, []);
  
  // Scan from camera
  const scanFromCamera = useCallback(async (): Promise<ScannedPatientData | null> => {
    setIsScanning(true);
    setError(null);
    
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission required');
        setIsScanning(false);
        return null;
      }
      
      // Preserve the full label; resize and normalize before upload.
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      
      if (result.canceled || !result.assets?.[0]) {
        setIsScanning(false);
        return null;
      }
      
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setIsScanning(false);
      
      // Process the image
      return await processImage(uri, result.assets[0].width);
    } catch (err: any) {
      console.error('[PatientScan] Camera error:', err);
      setError(err.message || 'Failed to capture image');
      setIsScanning(false);
      return null;
    }
  }, [processImage]);
  
  // Scan from library
  const scanFromLibrary = useCallback(async (): Promise<ScannedPatientData | null> => {
    setIsScanning(true);
    setError(null);
    
    try {
      // Request library permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission required');
        setIsScanning(false);
        return null;
      }
      
      // Preserve the full image; HEIC is converted before upload.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      
      if (result.canceled || !result.assets?.[0]) {
        setIsScanning(false);
        return null;
      }
      
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setIsScanning(false);
      
      // Process the image
      return await processImage(uri, result.assets[0].width);
    } catch (err: any) {
      console.error('[PatientScan] Library error:', err);
      setError(err.message || 'Failed to select image');
      setIsScanning(false);
      return null;
    }
  }, [processImage]);
  
  // Clear scan data
  const clearScan = useCallback(() => {
    setScannedData(null);
    setImageUri(null);
    setError(null);
  }, []);
  
  return {
    isScanning,
    isProcessing,
    error,
    scannedData,
    imageUri,
    scanFromCamera,
    scanFromLibrary,
    clearScan,
  };
}
