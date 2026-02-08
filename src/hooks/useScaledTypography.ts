/**
 * useScaledTypography Hook
 * 
 * Provides scaled typography values based on user's text size preference.
 * Uses a multiplier approach to maintain visual hierarchy across all sizes.
 * 
 * Scale factors:
 * - normal: 1.0x (default, current sizes)
 * - large: 1.2x 
 * - xlarge: 1.4x
 */

import { useMemo } from 'react';
import { useSettingsStore, TextScale } from '../stores/settingsStore';
import { typography } from '../constants/theme';

// Scale multipliers for each size option
const SCALE_FACTORS: Record<TextScale, number> = {
  normal: 1.0,
  large: 1.2,
  xlarge: 1.4,
};

// Line height ratio (1.4x font size is optimal for readability)
const LINE_HEIGHT_RATIO = 1.4;

export interface ScaledTypography {
  // Font sizes (scaled)
  xs: number;
  sm: number;
  base: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
  '4xl': number;
  
  // Line heights (proportional to font size)
  lineHeight: {
    xs: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
    '4xl': number;
  };
  
  // Font weights (unchanged)
  regular: '400';
  medium: '500';
  semibold: '600';
  bold: '700';
  
  // Current scale info
  scale: TextScale;
  scaleFactor: number;
}

export function useScaledTypography(): ScaledTypography {
  const textScale = useSettingsStore((state) => state.textScale);
  const factor = SCALE_FACTORS[textScale];
  
  return useMemo(() => {
    const scale = (size: number) => Math.round(size * factor);
    const lineHeight = (size: number) => Math.round(size * factor * LINE_HEIGHT_RATIO);
    
    return {
      // Scaled font sizes
      xs: scale(typography.xs),
      sm: scale(typography.sm),
      base: scale(typography.base),
      lg: scale(typography.lg),
      xl: scale(typography.xl),
      '2xl': scale(typography['2xl']),
      '3xl': scale(typography['3xl']),
      '4xl': scale(typography['4xl']),
      
      // Proportional line heights
      lineHeight: {
        xs: lineHeight(typography.xs),
        sm: lineHeight(typography.sm),
        base: lineHeight(typography.base),
        lg: lineHeight(typography.lg),
        xl: lineHeight(typography.xl),
        '2xl': lineHeight(typography['2xl']),
        '3xl': lineHeight(typography['3xl']),
        '4xl': lineHeight(typography['4xl']),
      },
      
      // Font weights (not scaled)
      regular: typography.regular,
      medium: typography.medium,
      semibold: typography.semibold,
      bold: typography.bold,
      
      // Scale info
      scale: textScale,
      scaleFactor: factor,
    };
  }, [textScale, factor]);
}

/**
 * Helper to get scaled font size for a given base size
 * Useful for one-off calculations
 */
export function getScaledSize(baseSize: number, scale: TextScale): number {
  return Math.round(baseSize * SCALE_FACTORS[scale]);
}

/**
 * Scale labels for UI display
 */
export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  normal: 'Default',
  large: 'Large',
  xlarge: 'Extra Large',
};
