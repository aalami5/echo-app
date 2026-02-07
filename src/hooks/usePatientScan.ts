/**
 * Patient Scan Hook
 * 
 * Handles camera/library image capture and OCR extraction
 * of patient details (name, MRN, DOB, room, chief complaint).
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useSettingsStore } from '../stores/settingsStore';
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
  
  const { gatewayUrl, gatewayToken, openaiApiKey } = useSettingsStore();
  
  // Process image with vision API
  const processImage = useCallback(async (uri: string): Promise<ScannedPatientData | null> => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Read image as base64 (use passed base64 if available, otherwise read from file)
      let base64: string;
      if ((uri as any)._base64) {
        base64 = (uri as any)._base64;
      } else {
        base64 = await readAsStringAsync(uri, {
          encoding: 'base64',
        });
      }
      
      // Determine MIME type from URI
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpeg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
      
      // Log image size for debugging
      console.log('[PatientScan] Image base64 length:', base64.length, 'chars (~', Math.round(base64.length * 0.75 / 1024), 'KB)');
      
      // Create the vision API request - use OpenAI GPT-4 Vision directly
      const prompt = `Extract patient information from this medical image (wristband, face sheet, or sticker). Look for:
- Patient name (usually "LAST, FIRST" format)
- MRN (Medical Record Number - typically 6-7 digits)
- DOB/Date of Birth (MM/DD/YYYY format)
- Room/bed location (e.g., "CSU 2516-1", "Room 302")
- Hospital name if visible
- Chief complaint/diagnosis if visible

Return ONLY valid JSON with these exact fields (use null if not found):
{"name":"LAST, FIRST","mrn":"1234567","dob":"MM/DD/YYYY","room":"Room/Bed","hospital":"Hospital name","chiefComplaint":"Diagnosis"}`;

      // Check for API key
      if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured. Please set it in Settings.');
      }
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { 
                  type: 'image_url', 
                  image_url: { 
                    url: `data:${mimeType};base64,${base64}`,
                    detail: 'high'
                  } 
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
          max_tokens: 500,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PatientScan] API error:', response.status, errorText);
        if (response.status === 401) {
          throw new Error('API key invalid. Please check configuration.');
        }
        if (response.status === 429) {
          throw new Error('Rate limited. Please wait and try again.');
        }
        throw new Error(`Vision processing failed: ${response.status}`);
      }
      
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';
      
      console.log('[PatientScan] Raw response:', content);
      
      // Parse the JSON response
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Try to find a JSON object in the response
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonStr = objMatch[0];
        }
      }
      
      try {
        const parsed = JSON.parse(jsonStr);
        
        // Map hospital name to code if detected
        let hospital: Hospital | undefined;
        if (parsed.hospital) {
          hospital = detectHospital(parsed.hospital);
        }
        
        const data: ScannedPatientData = {
          name: parsed.name || undefined,
          mrn: parsed.mrn || undefined,
          dob: parsed.dob || undefined,
          room: parsed.room || undefined,
          hospital,
          chiefComplaint: parsed.chiefComplaint || undefined,
        };
        
        setScannedData(data);
        return data;
      } catch (parseError) {
        console.error('[PatientScan] JSON parse error:', parseError);
        console.error('[PatientScan] Attempted to parse:', jsonStr);
        setError('Could not parse patient data from image');
        return null;
      }
    } catch (err: any) {
      console.error('[PatientScan] Processing error:', err);
      setError(err.message || 'Failed to process image');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [gatewayUrl, gatewayToken, openaiApiKey]);
  
  // Scan from camera
  const scanFromCamera = useCallback(async (): Promise<ScannedPatientData | null> => {
    setIsScanning(true);
    setError(null);
    
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission required');
        return null;
      }
      
      // Launch camera - use lower quality to reduce payload size
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.3,
        allowsEditing: true,
        aspect: [4, 3],
        base64: true,
      });
      
      if (result.canceled || !result.assets?.[0]) {
        setIsScanning(false);
        return null;
      }
      
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setIsScanning(false);
      
      // Process the image
      return await processImage(uri);
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
        return null;
      }
      
      // Launch image picker - use lower quality to reduce payload size
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.3,
        allowsEditing: true,
        aspect: [4, 3],
        base64: true,
      });
      
      if (result.canceled || !result.assets?.[0]) {
        setIsScanning(false);
        return null;
      }
      
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setIsScanning(false);
      
      // Process the image
      return await processImage(uri);
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
