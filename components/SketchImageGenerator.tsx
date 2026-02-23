'use client'

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react'

type SquareSize = 512 | 768 | 1024
type InputMode = 'draw' | 'tooth-select'
type TemplateId =
  | 'closed-mouth'
  | 'partly-open'
  | 'slightly-open'
  | 'semi-open'
  | 'wide-open'
  | 'very-open'
  | 'ultra-open'
  | 'upper-focus'
  | 'lower-focus'
  | 'anterior-focus'
  | 'molar-focus'
  | 'full-open'
  | 'upper-only'
  | 'lower-only'

interface SizeOption {
  value: SquareSize
  label: string
}

type TemplateGroupId = 'all' | 'opening' | 'focus' | 'arch'

interface TemplateControlDefaults {
  controlScale: number
  guidanceScale: number
  numSteps: number
  sketchContrast: number
  backgroundThreshold: number
  noiseSuppression: number
}

interface TemplateGroup {
  id: TemplateGroupId
  label: string
  templateIds: TemplateId[]
}

interface ToothZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  arch: 'upper' | 'lower'
}

interface HoveredToothHint {
  id: string
  x: number
  y: number
  zoneX: number
  zoneY: number
  zoneWidth: number
  zoneHeight: number
}

interface DentalTemplate {
  id: TemplateId
  label: string
  description: string
  marginX: number
  upperY: number
  lowerY: number
  archHeight: number
  gap: number
  upperWidthScale: number
  lowerWidthScale: number
  upperHeightScale: number
  lowerHeightScale: number
  upperTaper: number
  lowerTaper: number
  upperHeightTaper: number
  lowerHeightTaper: number
  upperArchCurve: number
  lowerArchCurve: number
  showMidline: boolean
}

const SIZE_OPTIONS: SizeOption[] = [
  { value: 512, label: '512 x 512' },
  { value: 768, label: '768 x 768' },
  { value: 1024, label: '1024 x 1024' },
]

const BRUSH_PRESETS = ['#111111', '#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b']
const UPPER_TOOTH_IDS = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const LOWER_TOOTH_IDS = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
const UPPER_TOOTH_WIDTH_WEIGHTS = [0.86, 0.95, 1.07, 0.99, 0.93, 0.86, 0.76, 0.84, 0.84, 0.76, 0.86, 0.93, 0.99, 1.07, 0.95, 0.86]
const LOWER_TOOTH_WIDTH_WEIGHTS = [0.9, 0.97, 1.03, 0.97, 0.9, 0.82, 0.74, 0.78, 0.78, 0.74, 0.82, 0.9, 0.97, 1.03, 0.97, 0.9]
const UPPER_TOOTH_HEIGHT_WEIGHTS = [0.84, 0.88, 0.93, 0.95, 0.98, 1.08, 1.02, 1.06, 1.06, 1.02, 1.08, 0.98, 0.95, 0.93, 0.88, 0.84]
const LOWER_TOOTH_HEIGHT_WEIGHTS = [0.88, 0.9, 0.93, 0.94, 0.96, 1.0, 0.95, 0.94, 0.94, 0.95, 1.0, 0.96, 0.94, 0.93, 0.9, 0.88]
const QUADRANT_LABEL: Record<string, string> = {
  '1': 'maxillary right',
  '2': 'maxillary left',
  '3': 'mandibular left',
  '4': 'mandibular right',
}
const TOOTH_TYPE_LABEL: Record<string, string> = {
  '1': 'central incisor',
  '2': 'lateral incisor',
  '3': 'canine',
  '4': 'first premolar',
  '5': 'second premolar',
  '6': 'first molar',
  '7': 'second molar',
  '8': 'third molar',
}
const ARCH_CENTERLINE_PROFILES: Record<
  TemplateId,
  {
    upper: readonly number[]
    lower: readonly number[]
  }
> = {
  'closed-mouth': {
    upper: [0.14, 0.2, 0.3, 0.44, 0.6, 0.78, 0.92, 1, 1, 0.92, 0.78, 0.6, 0.44, 0.3, 0.2, 0.14, 0.12],
    lower: [0.1, 0.17, 0.28, 0.44, 0.6, 0.77, 0.89, 1, 1, 0.89, 0.77, 0.6, 0.44, 0.28, 0.17, 0.1, 0.08],
  },
  'partly-open': {
    upper: [
      0.15,
      0.22,
      0.34,
      0.48,
      0.64,
      0.82,
      0.96,
      1.03,
      1.03,
      0.96,
      0.82,
      0.64,
      0.48,
      0.34,
      0.22,
      0.15,
      0.12,
    ],
    lower: [
      0.11,
      0.18,
      0.3,
      0.46,
      0.63,
      0.79,
      0.93,
      1,
      1,
      0.93,
      0.79,
      0.63,
      0.46,
      0.3,
      0.18,
      0.11,
      0.09,
    ],
  },
  'slightly-open': {
    upper: [
      0.14,
      0.2,
      0.31,
      0.46,
      0.62,
      0.79,
      0.93,
      1.0,
      1.0,
      0.93,
      0.79,
      0.62,
      0.46,
      0.31,
      0.2,
      0.14,
      0.12,
    ],
    lower: [
      0.1,
      0.16,
      0.27,
      0.43,
      0.6,
      0.76,
      0.9,
      1,
      1,
      0.9,
      0.76,
      0.6,
      0.43,
      0.27,
      0.16,
      0.1,
      0.08,
    ],
  },
  'semi-open': {
    upper: [
      0.14,
      0.21,
      0.33,
      0.48,
      0.64,
      0.82,
      0.96,
      1.03,
      1.03,
      0.96,
      0.82,
      0.64,
      0.48,
      0.33,
      0.21,
      0.14,
      0.12,
    ],
    lower: [
      0.1,
      0.17,
      0.29,
      0.45,
      0.62,
      0.79,
      0.93,
      1,
      1,
      0.93,
      0.79,
      0.62,
      0.45,
      0.29,
      0.17,
      0.1,
      0.08,
    ],
  },
  'wide-open': {
    upper: [0.12, 0.18, 0.28, 0.44, 0.6, 0.76, 0.9, 1, 1, 0.9, 0.76, 0.6, 0.44, 0.28, 0.18, 0.12, 0.09],
    lower: [0.08, 0.14, 0.25, 0.4, 0.56, 0.72, 0.86, 1, 1, 0.86, 0.72, 0.56, 0.4, 0.25, 0.14, 0.08, 0.06],
  },
  'ultra-open': {
    upper: [
      0.1,
      0.15,
      0.24,
      0.38,
      0.54,
      0.71,
      0.88,
      0.99,
      0.99,
      0.88,
      0.71,
      0.54,
      0.38,
      0.24,
      0.15,
      0.1,
      0.07,
    ],
    lower: [
      0.06,
      0.11,
      0.2,
      0.33,
      0.5,
      0.67,
      0.82,
      1,
      1,
      0.82,
      0.67,
      0.5,
      0.33,
      0.2,
      0.11,
      0.06,
      0.04,
    ],
  },
  'very-open': {
    upper: [
      0.09,
      0.14,
      0.22,
      0.36,
      0.52,
      0.69,
      0.87,
      0.99,
      0.99,
      0.87,
      0.69,
      0.52,
      0.36,
      0.22,
      0.14,
      0.09,
    ],
    lower: [
      0.05,
      0.1,
      0.18,
      0.31,
      0.49,
      0.66,
      0.82,
      1,
      1,
      0.82,
      0.66,
      0.49,
      0.31,
      0.18,
      0.1,
      0.05,
    ],
  },
  'upper-focus': {
    upper: [0.13, 0.2, 0.33, 0.5, 0.7, 0.9, 1.02, 1.1, 1.1, 1.02, 0.9, 0.7, 0.5, 0.33, 0.2, 0.13, 0.1],
    lower: [0.1, 0.16, 0.28, 0.45, 0.62, 0.79, 0.9, 1, 1, 0.9, 0.79, 0.62, 0.45, 0.28, 0.16, 0.1, 0.08],
  },
  'lower-focus': {
    upper: [0.1, 0.16, 0.26, 0.42, 0.58, 0.76, 0.9, 1, 1, 0.9, 0.76, 0.58, 0.42, 0.26, 0.16, 0.1, 0.08],
    lower: [0.14, 0.22, 0.35, 0.52, 0.73, 0.9, 1.04, 1.13, 1.13, 1.04, 0.9, 0.73, 0.52, 0.35, 0.22, 0.14, 0.11],
  },
  'anterior-focus': {
    upper: [
      0.16,
      0.24,
      0.36,
      0.54,
      0.72,
      0.92,
      1.02,
      1.08,
      1.08,
      1.02,
      0.92,
      0.72,
      0.54,
      0.36,
      0.24,
      0.16,
    ],
    lower: [
      0.12,
      0.2,
      0.32,
      0.48,
      0.64,
      0.8,
      0.9,
      1,
      1,
      0.9,
      0.8,
      0.64,
      0.48,
      0.32,
      0.2,
      0.12,
    ],
  },
  'molar-focus': {
    upper: [
      0.09,
      0.14,
      0.22,
      0.36,
      0.56,
      0.78,
      0.95,
      1.04,
      1.04,
      0.95,
      0.78,
      0.56,
      0.36,
      0.22,
      0.14,
      0.09,
    ],
    lower: [
      0.09,
      0.13,
      0.2,
      0.34,
      0.52,
      0.73,
      0.92,
      1.03,
      1.03,
      0.92,
      0.73,
      0.52,
      0.34,
      0.2,
      0.13,
      0.09,
    ],
  },
  'full-open': {
    upper: [
      0.16,
      0.22,
      0.34,
      0.5,
      0.68,
      0.85,
      1.02,
      1.12,
      1.12,
      1.02,
      0.85,
      0.68,
      0.5,
      0.34,
      0.22,
      0.16,
    ],
    lower: [
      0.13,
      0.19,
      0.32,
      0.5,
      0.68,
      0.84,
      0.98,
      1.1,
      1.1,
      0.98,
      0.84,
      0.68,
      0.5,
      0.32,
      0.19,
      0.13,
    ],
  },
  'upper-only': {
    upper: [0.13, 0.2, 0.34, 0.51, 0.72, 0.92, 1.02, 1.08, 1.08, 1.02, 0.92, 0.72, 0.51, 0.34, 0.2, 0.13],
    lower: [0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.17, 0.18, 0.18, 0.17, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06],
  },
  'lower-only': {
    upper: [0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.18, 0.19, 0.19, 0.18, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08],
    lower: [0.13, 0.2, 0.35, 0.51, 0.72, 0.9, 1.04, 1.12, 1.12, 1.04, 0.9, 0.72, 0.51, 0.35, 0.2, 0.13],
  },
}
const DENTAL_TEMPLATES: DentalTemplate[] = [
  {
    id: 'closed-mouth',
    label: 'Closed-mouth',
    description: 'Closed-mouth with natural occlusion and no visible tongue space.',
    marginX: 0.1,
    upperY: 0.24,
    lowerY: 0.56,
    archHeight: 0.17,
    gap: 0.006,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 1,
    lowerHeightScale: 1,
    upperTaper: 0.18,
    lowerTaper: 0.18,
    upperHeightTaper: 0.12,
    lowerHeightTaper: 0.12,
    upperArchCurve: 0.03,
    lowerArchCurve: 0.028,
    showMidline: true,
  },
  {
    id: 'partly-open',
    label: 'Partly Open',
    description: 'Mild vertical opening, front gap visible for focused annotation.',
    marginX: 0.095,
    upperY: 0.2,
    lowerY: 0.6,
    archHeight: 0.155,
    gap: 0.006,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 1,
    lowerHeightScale: 1,
    upperTaper: 0.16,
    lowerTaper: 0.16,
    upperHeightTaper: 0.1,
    lowerHeightTaper: 0.1,
    upperArchCurve: 0.032,
    lowerArchCurve: 0.03,
    showMidline: true,
  },
  {
    id: 'slightly-open',
    label: 'Slightly Open',
    description: 'Conservative mouth opening with a narrow oral gap for focused anterior work.',
    marginX: 0.095,
    upperY: 0.205,
    lowerY: 0.58,
    archHeight: 0.156,
    gap: 0.006,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 1,
    lowerHeightScale: 1,
    upperTaper: 0.158,
    lowerTaper: 0.158,
    upperHeightTaper: 0.096,
    lowerHeightTaper: 0.096,
    upperArchCurve: 0.031,
    lowerArchCurve: 0.029,
    showMidline: true,
  },
  {
    id: 'semi-open',
    label: 'Semi Open',
    description: 'Balanced partial opening for medium-gap frontal treatment references.',
    marginX: 0.095,
    upperY: 0.21,
    lowerY: 0.59,
    archHeight: 0.158,
    gap: 0.0058,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 1,
    lowerHeightScale: 1,
    upperTaper: 0.158,
    lowerTaper: 0.158,
    upperHeightTaper: 0.098,
    lowerHeightTaper: 0.098,
    upperArchCurve: 0.031,
    lowerArchCurve: 0.029,
    showMidline: true,
  },
  {
    id: 'wide-open',
    label: 'Wide Open',
    description: 'Wide oral opening with larger gap for molars and posterior details.',
    marginX: 0.09,
    upperY: 0.15,
    lowerY: 0.65,
    archHeight: 0.145,
    gap: 0.006,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 0.98,
    lowerHeightScale: 0.98,
    upperTaper: 0.14,
    lowerTaper: 0.14,
    upperHeightTaper: 0.08,
    lowerHeightTaper: 0.08,
    upperArchCurve: 0.026,
    lowerArchCurve: 0.024,
    showMidline: false,
  },
  {
    id: 'very-open',
    label: 'Very Open',
    description: 'Expanded opening for molar and posterior area coverage.',
    marginX: 0.082,
    upperY: 0.13,
    lowerY: 0.67,
    archHeight: 0.14,
    gap: 0.0068,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 0.97,
    lowerHeightScale: 0.97,
    upperTaper: 0.12,
    lowerTaper: 0.12,
    upperHeightTaper: 0.065,
    lowerHeightTaper: 0.065,
    upperArchCurve: 0.02,
    lowerArchCurve: 0.018,
    showMidline: false,
  },
  {
    id: 'ultra-open',
    label: 'Ultra Open',
    description: 'Very wide opening template for maximum posterior and tongue-space visibility.',
    marginX: 0.085,
    upperY: 0.14,
    lowerY: 0.67,
    archHeight: 0.14,
    gap: 0.0068,
    upperWidthScale: 1,
    lowerWidthScale: 1,
    upperHeightScale: 0.97,
    lowerHeightScale: 0.97,
    upperTaper: 0.13,
    lowerTaper: 0.13,
    upperHeightTaper: 0.07,
    lowerHeightTaper: 0.07,
    upperArchCurve: 0.024,
    lowerArchCurve: 0.022,
    showMidline: false,
  },
  {
    id: 'upper-focus',
    label: 'Upper Focus',
    description: 'Upper arch focus template with stronger upper emphasis and moderate lower context.',
    marginX: 0.11,
    upperY: 0.23,
    lowerY: 0.58,
    archHeight: 0.166,
    gap: 0.0055,
    upperWidthScale: 1.14,
    lowerWidthScale: 0.94,
    upperHeightScale: 1.05,
    lowerHeightScale: 0.92,
    upperTaper: 0.16,
    lowerTaper: 0.18,
    upperHeightTaper: 0.1,
    lowerHeightTaper: 0.13,
    upperArchCurve: 0.034,
    lowerArchCurve: 0.022,
    showMidline: true,
  },
  {
    id: 'lower-focus',
    label: 'Lower Focus',
    description: 'Lower arch focus template with clearer lower visibility and reduced upper emphasis.',
    marginX: 0.11,
    upperY: 0.2,
    lowerY: 0.62,
    archHeight: 0.166,
    gap: 0.0055,
    upperWidthScale: 0.94,
    lowerWidthScale: 1.14,
    upperHeightScale: 0.92,
    lowerHeightScale: 1.07,
    upperTaper: 0.18,
    lowerTaper: 0.16,
    upperHeightTaper: 0.13,
    lowerHeightTaper: 0.1,
    upperArchCurve: 0.022,
    lowerArchCurve: 0.034,
    showMidline: true,
  },
  {
    id: 'anterior-focus',
    label: 'Anterior Focus',
    description: 'Front-tooth focused view ideal for incisors and canine edits.',
    marginX: 0.1,
    upperY: 0.22,
    lowerY: 0.56,
    archHeight: 0.172,
    gap: 0.0048,
    upperWidthScale: 1.09,
    lowerWidthScale: 1.02,
    upperHeightScale: 1.04,
    lowerHeightScale: 0.98,
    upperTaper: 0.18,
    lowerTaper: 0.19,
    upperHeightTaper: 0.14,
    lowerHeightTaper: 0.1,
    upperArchCurve: 0.036,
    lowerArchCurve: 0.03,
    showMidline: true,
  },
  {
    id: 'molar-focus',
    label: 'Molar Focus',
    description: 'Posterior molar-focused layout for chewing area treatment simulation.',
    marginX: 0.1,
    upperY: 0.24,
    lowerY: 0.56,
    archHeight: 0.17,
    gap: 0.0055,
    upperWidthScale: 1.05,
    lowerWidthScale: 1.03,
    upperHeightScale: 1.02,
    lowerHeightScale: 0.98,
    upperTaper: 0.13,
    lowerTaper: 0.15,
    upperHeightTaper: 0.09,
    lowerHeightTaper: 0.08,
    upperArchCurve: 0.03,
    lowerArchCurve: 0.029,
    showMidline: true,
  },
  {
    id: 'full-open',
    label: 'Full Open',
    description: 'Fully open profile with consistent visibility and expanded posterior gap.',
    marginX: 0.09,
    upperY: 0.16,
    lowerY: 0.64,
    archHeight: 0.152,
    gap: 0.006,
    upperWidthScale: 1.02,
    lowerWidthScale: 1.02,
    upperHeightScale: 0.97,
    lowerHeightScale: 0.97,
    upperTaper: 0.15,
    lowerTaper: 0.15,
    upperHeightTaper: 0.09,
    lowerHeightTaper: 0.09,
    upperArchCurve: 0.025,
    lowerArchCurve: 0.025,
    showMidline: false,
  },
  {
    id: 'upper-only',
    label: 'Upper Only',
    description: 'Only upper jaw context with minimal lower jaw structure in the frame.',
    marginX: 0.11,
    upperY: 0.23,
    lowerY: 0.9,
    archHeight: 0.15,
    gap: 0.005,
    upperWidthScale: 1.1,
    lowerWidthScale: 0.22,
    upperHeightScale: 1.07,
    lowerHeightScale: 0.2,
    upperTaper: 0.2,
    lowerTaper: 0.06,
    upperHeightTaper: 0.16,
    lowerHeightTaper: 0.02,
    upperArchCurve: 0.032,
    lowerArchCurve: 0.004,
    showMidline: true,
  },
  {
    id: 'lower-only',
    label: 'Lower Only',
    description: 'Only lower jaw context with minimal upper jaw structure in the frame.',
    marginX: 0.11,
    upperY: 0.88,
    lowerY: 0.58,
    archHeight: 0.15,
    gap: 0.005,
    upperWidthScale: 0.22,
    lowerWidthScale: 1.1,
    upperHeightScale: 0.2,
    lowerHeightScale: 1.07,
    upperTaper: 0.06,
    lowerTaper: 0.2,
    upperHeightTaper: 0.02,
    lowerHeightTaper: 0.16,
    upperArchCurve: 0.004,
    lowerArchCurve: 0.032,
    showMidline: true,
  },
]

const TEMPLATE_CONTROL_PRESETS: Record<TemplateId, TemplateControlDefaults> = {
  'closed-mouth': {
    controlScale: 0.7,
    guidanceScale: 6.8,
    numSteps: 26,
    sketchContrast: 2.2,
    backgroundThreshold: 240,
    noiseSuppression: 2,
  },
  'partly-open': {
    controlScale: 0.74,
    guidanceScale: 7.0,
    numSteps: 28,
    sketchContrast: 2.2,
    backgroundThreshold: 240,
    noiseSuppression: 2,
  },
  'slightly-open': {
    controlScale: 0.76,
    guidanceScale: 7.2,
    numSteps: 29,
    sketchContrast: 2.25,
    backgroundThreshold: 241,
    noiseSuppression: 2,
  },
  'semi-open': {
    controlScale: 0.78,
    guidanceScale: 7.4,
    numSteps: 30,
    sketchContrast: 2.3,
    backgroundThreshold: 238,
    noiseSuppression: 2,
  },
  'wide-open': {
    controlScale: 0.84,
    guidanceScale: 7.6,
    numSteps: 32,
    sketchContrast: 2.2,
    backgroundThreshold: 238,
    noiseSuppression: 2,
  },
  'very-open': {
    controlScale: 0.9,
    guidanceScale: 8.0,
    numSteps: 34,
    sketchContrast: 2.25,
    backgroundThreshold: 236,
    noiseSuppression: 3,
  },
  'ultra-open': {
    controlScale: 0.88,
    guidanceScale: 7.8,
    numSteps: 33,
    sketchContrast: 2.2,
    backgroundThreshold: 236,
    noiseSuppression: 2,
  },
  'upper-focus': {
    controlScale: 0.68,
    guidanceScale: 6.8,
    numSteps: 28,
    sketchContrast: 2.2,
    backgroundThreshold: 241,
    noiseSuppression: 1,
  },
  'lower-focus': {
    controlScale: 0.68,
    guidanceScale: 6.8,
    numSteps: 28,
    sketchContrast: 2.2,
    backgroundThreshold: 241,
    noiseSuppression: 1,
  },
  'anterior-focus': {
    controlScale: 0.72,
    guidanceScale: 7.1,
    numSteps: 29,
    sketchContrast: 2.2,
    backgroundThreshold: 240,
    noiseSuppression: 2,
  },
  'molar-focus': {
    controlScale: 0.74,
    guidanceScale: 7.2,
    numSteps: 30,
    sketchContrast: 2.25,
    backgroundThreshold: 239,
    noiseSuppression: 2,
  },
  'full-open': {
    controlScale: 0.9,
    guidanceScale: 8.2,
    numSteps: 34,
    sketchContrast: 2.25,
    backgroundThreshold: 237,
    noiseSuppression: 3,
  },
  'upper-only': {
    controlScale: 0.66,
    guidanceScale: 6.2,
    numSteps: 24,
    sketchContrast: 2.1,
    backgroundThreshold: 241,
    noiseSuppression: 1,
  },
  'lower-only': {
    controlScale: 0.66,
    guidanceScale: 6.2,
    numSteps: 24,
    sketchContrast: 2.1,
    backgroundThreshold: 241,
    noiseSuppression: 1,
  },
}

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    id: 'all',
    label: 'All Templates',
    templateIds: [
      'closed-mouth',
      'partly-open',
      'slightly-open',
      'semi-open',
      'wide-open',
      'very-open',
      'ultra-open',
      'full-open',
      'upper-focus',
      'lower-focus',
      'anterior-focus',
      'molar-focus',
      'upper-only',
      'lower-only',
    ],
  },
  {
    id: 'opening',
    label: 'Opening',
    templateIds: ['closed-mouth', 'partly-open', 'slightly-open', 'semi-open', 'wide-open', 'very-open', 'ultra-open', 'full-open'],
  },
  {
    id: 'focus',
    label: 'Focus',
    templateIds: ['upper-focus', 'lower-focus', 'anterior-focus', 'molar-focus'],
  },
  {
    id: 'arch',
    label: 'Arch',
    templateIds: ['upper-only', 'lower-only'],
  },
]

interface GenerateResponse {
  success: boolean
  imageUrl?: string
  error?: string | Record<string, unknown>
  errorCode?: string
  providersTried?: string[]
  providerTrace?: { provider: string; status: string; error?: string; latencyMs?: number }[]
}

interface SketchImageGeneratorProps {
  onGenerated?: (imageUrl: string) => void
}

interface SketchEnhanceConfig {
  enabled: boolean
  lineContrast: number
  backgroundThreshold: number
  noiseSuppression: number
}

function pointerToCanvas(event: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function to0To1(value: number): number {
  return clamp(value, 0, 1)
}

function getArchProfile(templateId: TemplateId, arch: 'upper' | 'lower', index: number): number {
  const profile = ARCH_CENTERLINE_PROFILES[templateId][arch]
  if (!profile.length) return 0.72
  if (index <= 0) return profile[0]
  if (index >= profile.length - 1) return profile[profile.length - 1]
  return profile[index] ?? 0.72
}

function estimateBackgroundLuma(imageData: ImageData, width: number, height: number): number {
  const { data } = imageData
  let sum = 0
  let count = 0
  const sampleStep = Math.max(8, Math.floor(Math.max(width, height) / 32))
  const addSample = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += luma
    count += 1
  }

  for (let x = 0; x < width; x += sampleStep) {
    addSample(x, 0)
    addSample(x, height - 1)
  }
  for (let y = sampleStep; y < height - 1; y += sampleStep) {
    addSample(0, y)
    addSample(width - 1, y)
  }

  if (count === 0) return 255
  return sum / count
}

function buildSketchImage(canvas: HTMLCanvasElement, config: SketchEnhanceConfig) {
  const work = document.createElement('canvas')
  work.width = canvas.width
  work.height = canvas.height
  const ctx = work.getContext('2d')
  if (!ctx) {
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      inkSamples: 0,
    }
  }

  ctx.drawImage(canvas, 0, 0, work.width, work.height)

  if (!config.enabled) {
    const data = ctx.getImageData(0, 0, work.width, work.height)
    let inkSamples = 0
    const { data: raw } = data
    for (let i = 0; i < raw.length; i += 20) {
      const r = raw[i]
      const g = raw[i + 1]
      const b = raw[i + 2]
      if (r < 240 || g < 240 || b < 240) inkSamples += 1
    }
    return {
      dataUrl: work.toDataURL('image/jpeg', 0.92),
      inkSamples,
    }
  }

  const source = ctx.getImageData(0, 0, work.width, work.height)
  const sourceData = source.data
  const target = ctx.createImageData(work.width, work.height)
  const targetData = target.data
  const total = work.width * work.height
  const darkMask = new Uint8Array(total)
  const bgLuma = estimateBackgroundLuma(source, work.width, work.height)

  const lineContrast = clamp(config.lineContrast, 1.1, 3.5)
  const backgroundThreshold = clamp(config.backgroundThreshold, 220, 255)
  const noiseSuppression = Math.round(clamp(config.noiseSuppression, 0, 8))
  const epsilon = 1e-6

  for (let y = 0; y < work.height; y += 1) {
    for (let x = 0; x < work.width; x += 1) {
      const i = (y * work.width + x) * 4
      const idx = y * work.width + x
      const r = sourceData[i]
      const g = sourceData[i + 1]
      const b = sourceData[i + 2]

      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      let v = 255

      if (luma < backgroundThreshold) {
        const normalizedDiff = to0To1((bgLuma - luma) / (bgLuma + epsilon))
        const darkStrength = Math.pow(normalizedDiff, 1 / lineContrast)
        v = Math.round(255 * (1 - darkStrength))
        v = clamp(v, 0, 255)
      }

      targetData[i] = v
      targetData[i + 1] = v
      targetData[i + 2] = v
      targetData[i + 3] = 255
      darkMask[idx] = v < 220 ? 1 : 0
    }
  }

  if (noiseSuppression > 0) {
    const cleaned = targetData.slice()
    for (let y = 0; y < work.height; y += 1) {
      for (let x = 0; x < work.width; x += 1) {
        const idx = y * work.width + x
        if (!darkMask[idx]) continue

        let neighbors = 0
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue
            const nx = x + ox
            const ny = y + oy
            if (nx < 0 || ny < 0 || nx >= work.width || ny >= work.height) continue
            const ni = ny * work.width + nx
            if (darkMask[ni]) neighbors += 1
          }
        }

        if (neighbors < noiseSuppression - 1) {
          const di = idx * 4
          cleaned[di] = 255
          cleaned[di + 1] = 255
          cleaned[di + 2] = 255
          darkMask[idx] = 0
        }
      }
    }
    for (let i = 0; i < targetData.length; i += 1) {
      targetData[i] = cleaned[i]
    }
  }

  let inkSamples = 0
  for (let i = 0; i < targetData.length; i += 20) {
    if (targetData[i] < 220) inkSamples += 1
  }

  ctx.putImageData(target, 0, 0)
  return {
    dataUrl: work.toDataURL('image/png'),
    inkSamples,
  }
}

function buildToothZones(size: number, template: DentalTemplate): ToothZone[] {
  const zones: ToothZone[] = []
  const marginX = size * template.marginX
  const totalWidth = size - marginX * 2
  const gap = size * template.gap
  const upperY = size * template.upperY
  const lowerY = size * template.lowerY
  const upperBaseHeight = size * template.archHeight * template.upperHeightScale
  const lowerBaseHeight = size * template.archHeight * template.lowerHeightScale

  const pushArch = (
    ids: string[],
    y: number,
    arch: 'upper' | 'lower',
    widthScale: number,
    widthWeights: number[],
    heightWeights: number[],
  ) => {
    const isUpper = arch === 'upper'
    const archWidth = totalWidth * widthScale
    const startX = marginX + (totalWidth - archWidth) / 2
    const usableWidth = archWidth - gap * (ids.length - 1)
    const widthTaper = isUpper ? template.upperTaper : template.lowerTaper
    const heightTaper = isUpper ? template.upperHeightTaper : template.lowerHeightTaper
    const heightBase = isUpper ? upperBaseHeight : lowerBaseHeight
    const archCurve = (isUpper ? template.upperArchCurve : template.lowerArchCurve) * size
    const profile = ids.map((_, index) => getArchProfile(template.id, arch, index))
    const maxIndex = Math.max(1, ids.length - 1)
    const rawWidthWeights = ids.map((_, index) => {
      const sideBias = Math.abs((maxIndex / 2 - index)) / (maxIndex / 2)
      const shape = profile[index]
      const widthWeight = widthWeights[index] * (0.84 + shape * 0.28) * (1 - sideBias * widthTaper)
      return widthWeight
    })
    const rawHeightWeights = ids.map((_, index) => {
      const sideBias = Math.abs((maxIndex / 2 - index)) / (maxIndex / 2)
      const shape = profile[index]
      const heightWeight = heightWeights[index] * (0.72 + shape * 0.36) * (1 - sideBias * heightTaper)
      return heightWeight
    })
    const sumWidthWeight = rawWidthWeights.reduce((acc, value) => acc + value, 0) || 1
    const heightMax = Math.max(0.001, ...rawHeightWeights)
    let cursorX = startX

    for (let i = 0; i < ids.length; i += 1) {
      const ratio = maxIndex > 0 ? i / maxIndex : 0.5
      const sideBias = Math.abs(0.5 - ratio) * 2
      const profileValue = clamp(profile[i], 0.05, 1)
      const jawCurve = isUpper ? archCurve : -archCurve
      const yOffset = jawCurve * (0.55 + profileValue * 0.45)
      const width = (usableWidth * rawWidthWeights[i]) / sumWidthWeight
      const normalizedHeight = to0To1(rawHeightWeights[i] / heightMax)
      const height = Math.max(1, heightBase * (0.78 + normalizedHeight * 0.48) - sideBias * template.archHeight * size * 0.01)
      const xDrift = (0.5 - ratio) * (size * 0.0018) * (isUpper ? 1 : -1) * (0.9 + (1 - profileValue))

      zones.push({
        id: ids[i],
        x: cursorX + xDrift,
        width,
        y: y + yOffset - height * 0.05,
        height,
        arch,
      })
      cursorX += width + gap
    }
  }

  const shouldRenderUpperArch = template.upperWidthScale > 0.3 || template.upperHeightScale > 0.3
  const shouldRenderLowerArch = template.lowerWidthScale > 0.3 || template.lowerHeightScale > 0.3

  if (shouldRenderUpperArch) {
    pushArch(
      UPPER_TOOTH_IDS,
      upperY,
      'upper',
      template.upperWidthScale,
      UPPER_TOOTH_WIDTH_WEIGHTS,
      UPPER_TOOTH_HEIGHT_WEIGHTS,
    )
  }
  if (shouldRenderLowerArch) {
    pushArch(
      LOWER_TOOTH_IDS,
      lowerY,
      'lower',
      template.lowerWidthScale,
      LOWER_TOOTH_WIDTH_WEIGHTS,
      LOWER_TOOTH_HEIGHT_WEIGHTS,
    )
  }

  return zones
}

function describeTooth(toothId: string): string {
  const quadrant = QUADRANT_LABEL[toothId[0]] || 'unknown quadrant'
  const toothType = TOOTH_TYPE_LABEL[toothId[1]] || 'tooth'
  return `${quadrant} ${toothType}`
}

function getSelectionSensitivity(templateId: TemplateId): number {
  switch (templateId) {
    case 'upper-only':
    case 'lower-only':
      return 0.022
    case 'wide-open':
    case 'semi-open':
    case 'ultra-open':
    case 'full-open':
      return 0.024
    case 'molar-focus':
    case 'anterior-focus':
      return 0.02
    case 'partly-open':
      return 0.023
    case 'upper-focus':
    case 'lower-focus':
      return 0.021
    default:
      return 0.025
  }
}

function buildSelectionLocationHint(selectedToothIds: string[], zones: ToothZone[], size: number): string {
  if (selectedToothIds.length === 0) return ''
  const selectedMap = new Map<string, ToothZone>()
  for (const toothId of selectedToothIds) {
    const zone = zones.find((candidate) => candidate.id === toothId)
    if (zone) selectedMap.set(zone.id, zone)
  }

  const ordered = Array.from(selectedMap.values()).sort((a, b) => {
    if (a.arch === b.arch) return a.x - b.x
    return a.arch === 'upper' ? -1 : 1
  })
  if (ordered.length === 0) return ''
  const targets = ordered.map((zone, index) => {
    const x = clamp(zone.x / size, 0, 1)
    const y = clamp(zone.y / size, 0, 1)
    const w = clamp(zone.width / size, 0, 1)
    const h = clamp(zone.height / size, 0, 1)
    const cx = clamp((zone.x + zone.width * 0.5) / size, 0, 1)
    const cy = clamp((zone.y + zone.height * 0.52) / size, 0, 1)
    return {
      id: index + 1,
      tooth: zone.id,
      arch: zone.arch === 'upper' ? 'maxillary' : 'mandibular',
      anatomy: describeTooth(zone.id),
      box: {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        w: Number(w.toFixed(4)),
        h: Number(h.toFixed(4)),
      },
      center: {
        x: Number(cx.toFixed(4)),
        y: Number(cy.toFixed(4)),
      },
    }
  })

  return JSON.stringify({
    mode: 'strict-target-box',
    targetCount: targets.length,
    targets,
  })
}

function buildStrictLocationHint(template: DentalTemplate, selectedTeeth: string[], toothZones: ToothZone[], size: number): string {
  const templateHint = JSON.stringify({
    templateId: template.id,
    templateLabel: template.label,
    templateDescription: template.description,
  })
  const selectedToothHint = buildSelectionLocationHint(selectedTeeth, toothZones, size)

  if (!selectedToothHint) {
    return `${templateHint} | TargetMode=global | Constraint=Keep dental anatomy clinically plausible. Preserve non-target teeth/gingiva unchanged.`
  }

  return `${templateHint} | TargetMode=strict-box | Targets=${selectedToothHint} | Constraint=Edit only inside target boxes, preserve neighboring teeth and surrounding soft tissue unchanged, do not move existing anatomy.`
}

function normalizeErrorMessage(error: unknown, fallback = 'AI 생성 중 오류가 발생했습니다.'): string {
  if (error instanceof Error) {
    return error.message || fallback
  }

  if (typeof error === 'string') {
    return error || fallback
  }

  if (!error || typeof error !== 'object') {
    return fallback
  }

  const record = error as Record<string, unknown>
  const candidates = [record.message, record.error, record.detail, record.reason, record.statusText, record.code]
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed) return trimmed
    }
  }

  if (typeof record.type === 'string') {
    const trimmed = record.type.trim()
    if (trimmed) return `event (${trimmed})`
  }

  const nested = record.error ?? record.cause
  if (nested) {
    return normalizeErrorMessage(nested, fallback)
  }

  return fallback
}

function drawArchGuide(
  context: CanvasRenderingContext2D,
  zones: ToothZone[],
  arch: 'upper' | 'lower',
  getY: (zone: ToothZone) => number,
) {
  const archZones = zones
    .filter((zone) => zone.arch === arch)
    .sort((a, b) => a.x - b.x)
  if (archZones.length < 2) return

  const points = archZones.map((zone) => ({
    x: zone.x + zone.width * 0.5,
    y: getY(zone),
  }))

  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const current = points[i]
    const midX = (prev.x + current.x) / 2
    const midY = (prev.y + current.y) / 2
    context.quadraticCurveTo(prev.x, prev.y, midX, midY)
    if (i === points.length - 1) {
      context.lineTo(current.x, current.y)
    }
  }
  context.stroke()
}

function drawSelectionMarkers(
  context: CanvasRenderingContext2D,
  zones: ToothZone[],
  selectedToothIds: string[],
  canvasSize: number,
  targetSize: number,
) {
  const scale = targetSize / canvasSize
  const targetRadius = Math.max(4, targetSize * 0.007)
  const ringRadius = targetRadius * 1.9
  const strokeWidth = Math.max(1.5, targetSize * 0.0025)

  context.save()
  context.strokeStyle = '#111111'
  context.fillStyle = '#111111'
  context.lineWidth = strokeWidth
  for (const toothId of selectedToothIds) {
    const zone = zones.find((item) => item.id === toothId)
    if (!zone) continue
    const centerX = (zone.x + zone.width * 0.5) * scale
    const centerY = (zone.y + zone.height * 0.52) * scale

    context.beginPath()
    context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2)
    context.stroke()

    context.beginPath()
    context.arc(centerX, centerY, targetRadius, 0, Math.PI * 2)
    context.fill()

    const cross = targetRadius * 1.6
    context.beginPath()
    context.moveTo(centerX - cross, centerY)
    context.lineTo(centerX + cross, centerY)
    context.moveTo(centerX, centerY - cross)
    context.lineTo(centerX, centerY + cross)
    context.stroke()
  }
  context.restore()
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function drawDentalTemplate(
  context: CanvasRenderingContext2D,
  size: number,
  zones: ToothZone[],
  selectedToothIds: Set<string>,
  template: DentalTemplate,
) {
  context.clearRect(0, 0, size, size)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)

  const mouthTop = Math.max(size * 0.05, size * template.upperY - size * 0.14)
  const mouthBottom = Math.min(size * 0.95, size * (template.lowerY + template.archHeight + 0.14))
  const mouthLeft = size * 0.06
  const mouthRight = size * 0.94
  const mouthMidY = (mouthTop + mouthBottom) * 0.5
  const lipCurve = size * (0.06 + Math.max(0, (template.lowerY - template.upperY) - 0.28) * 0.12)

  context.fillStyle = '#f1f5f9'
  context.beginPath()
  context.moveTo(mouthLeft, mouthMidY)
  context.bezierCurveTo(mouthLeft + size * 0.16, mouthTop + lipCurve, mouthRight - size * 0.16, mouthTop + lipCurve, mouthRight, mouthMidY)
  context.bezierCurveTo(
    mouthRight - size * 0.16,
    mouthBottom - lipCurve,
    mouthLeft + size * 0.16,
    mouthBottom - lipCurve,
    mouthLeft,
    mouthMidY,
  )
  context.closePath()
  context.fill()

  context.fillStyle = '#f8fafc'
  const showUpperArch = template.upperHeightScale > 0.35 || template.upperWidthScale > 0.4
  const showLowerArch = template.lowerHeightScale > 0.35 || template.lowerWidthScale > 0.4
  const upperBaseY = Math.max(size * 0.05, size * template.upperY - size * 0.1)
  const lowerBaseY = Math.min(size * 0.95, size * template.lowerY - size * 0.08)
  const upperHeight = size * template.archHeight * 1.34
  const lowerHeight = size * template.archHeight * 1.34

  if (showUpperArch) {
    context.fillRect(size * 0.07, upperBaseY, size * 0.86, upperHeight)
  }
  if (showLowerArch) {
    context.fillRect(size * 0.07, lowerBaseY, size * 0.86, lowerHeight)
  }

  context.strokeStyle = '#e5e7eb'
  context.lineWidth = Math.max(1, size * 0.002)
  if (template.showMidline && showUpperArch && showLowerArch) {
    context.beginPath()
    context.moveTo(size * 0.5, size * 0.2)
    context.lineTo(size * 0.5, size * 0.8)
    context.stroke()
  }

  const templateGap = (template.lowerY - template.upperY) * size
  if (templateGap > size * 0.31) {
    const guideY = size * template.upperY + size * 0.06
    context.setLineDash([size * 0.004, size * 0.006])
    context.beginPath()
    context.moveTo(size * 0.16, guideY)
    context.lineTo(size * 0.84, guideY)
    context.stroke()
    context.setLineDash([])
  }

  context.strokeStyle = '#cbd5e1'
  context.lineWidth = Math.max(1, size * 0.0018)
  if (showUpperArch) {
    drawArchGuide(context, zones, 'upper', (zone) => zone.y + zone.height * 0.12)
  }
  if (showLowerArch) {
    drawArchGuide(context, zones, 'lower', (zone) => zone.y + zone.height * 0.88)
  }

  for (const zone of zones) {
    const isSelected = selectedToothIds.has(zone.id)
    const radius = Math.max(6, zone.width * 0.18)
    roundedRectPath(context, zone.x, zone.y, zone.width, zone.height, radius)
    context.fillStyle = isSelected ? 'rgba(239, 68, 68, 0.28)' : 'rgba(255,255,255,0.94)'
    context.fill()
    context.strokeStyle = isSelected ? '#dc2626' : '#9ca3af'
    context.lineWidth = isSelected ? Math.max(1.6, size * 0.0036) : Math.max(1, size * 0.0024)
    context.stroke()

    if (isSelected) {
      context.fillStyle = '#b91c1c'
      context.font = `${Math.max(10, size * 0.018)}px ui-sans-serif, system-ui, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(zone.id, zone.x + zone.width * 0.5, zone.y + zone.height * 0.5)
    }
  }
}

export default function SketchImageGenerator({ onGenerated }: SketchImageGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(8)
  const [brushColor, setBrushColor] = useState('#111111')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('cartoon, illustration, blurry, text, watermark')
  const [size, setSize] = useState<SquareSize>(768)
  const [controlScale, setControlScale] = useState(0.8)
  const [guidanceScale, setGuidanceScale] = useState(7.5)
  const [numSteps, setNumSteps] = useState(30)
  const [seed, setSeed] = useState('')
  const [enableSafetyChecker, setEnableSafetyChecker] = useState(true)
  const [generatedImage, setGeneratedImage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [hasDrawing, setHasDrawing] = useState(false)
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [enableSketchEnhance, setEnableSketchEnhance] = useState(true)
  const [sketchContrast, setSketchContrast] = useState(2.2)
  const [backgroundThreshold, setBackgroundThreshold] = useState(240)
  const [noiseSuppression, setNoiseSuppression] = useState(2)
  const [inputMode, setInputMode] = useState<InputMode>('draw')
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([])
  const [templateId, setTemplateId] = useState<TemplateId>('closed-mouth')
  const [templateGroupId, setTemplateGroupId] = useState<TemplateGroupId>('all')
  const previousTemplateIdRef = useRef<TemplateId>('closed-mouth')
  const [hoveredToothHint, setHoveredToothHint] = useState<HoveredToothHint | null>(null)
  const selectedTemplate = useMemo(() => DENTAL_TEMPLATES.find((item) => item.id === templateId)!, [templateId])
  const templateGroupTemplates = useMemo(
    () => TEMPLATE_GROUPS.find((group) => group.id === templateGroupId) ?? TEMPLATE_GROUPS[0],
    [templateGroupId],
  )
  const visibleTemplates = useMemo(() => {
    if (templateGroupTemplates.id === 'all') return DENTAL_TEMPLATES
    const templateSet = new Set(templateGroupTemplates.templateIds)
    return DENTAL_TEMPLATES.filter((template) => templateSet.has(template.id))
  }, [templateGroupTemplates])

  const toothZones = useMemo(() => buildToothZones(size, selectedTemplate), [size, selectedTemplate.id])
  const hasUserMarking = hasDrawing || selectedTeeth.length > 0
  const applyTemplateDefaults = (nextTemplateId: TemplateId) => {
    const defaults = TEMPLATE_CONTROL_PRESETS[nextTemplateId]
    setControlScale(defaults.controlScale)
    setGuidanceScale(defaults.guidanceScale)
    setNumSteps(defaults.numSteps)
    setSketchContrast(defaults.sketchContrast)
    setBackgroundThreshold(defaults.backgroundThreshold)
    setNoiseSuppression(defaults.noiseSuppression)
  }

  const setTemplate = (nextTemplateId: TemplateId) => {
    setTemplateId(nextTemplateId)
    applyTemplateDefaults(nextTemplateId)
  }

  const initializeCanvas = (targetSize: SquareSize, preserveDrawing = false) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const snapshot = preserveDrawing && hasDrawing ? canvas.toDataURL('image/png') : ''

    canvas.width = targetSize
    canvas.height = targetSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = brushColor
    context.lineWidth = brushSize

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    drawDentalTemplate(context, targetSize, buildToothZones(targetSize, selectedTemplate), new Set(selectedTeeth), selectedTemplate)
    contextRef.current = context

    if (!snapshot) {
      setHasDrawing(false)
      setUndoStack([])
      return
    }

    const image = new Image()
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setHasDrawing(true)
    }
    image.src = snapshot
  }

  useEffect(() => {
    const templateChanged = previousTemplateIdRef.current !== templateId
    const preserveDrawing = !templateChanged
    initializeCanvas(size, preserveDrawing)
    previousTemplateIdRef.current = templateId
  }, [size, templateId])

  useEffect(() => {
    if (templateGroupTemplates.id === 'all') return
    if (!templateGroupTemplates.templateIds.includes(templateId)) {
      const nextTemplateId = templateGroupTemplates.templateIds[0]
      if (nextTemplateId) {
        setTemplateId(nextTemplateId)
      }
    }
  }, [templateGroupId, templateId, templateGroupTemplates])

  useEffect(() => {
    applyTemplateDefaults(templateId)
  }, [templateId])

  useEffect(() => {
    const availableToothIds = new Set(toothZones.map((zone) => zone.id))
    setSelectedTeeth((prev) => prev.filter((toothId) => availableToothIds.has(toothId)))
  }, [toothZones])

  useEffect(() => {
    clearHoveredToothHint()
  }, [inputMode, templateId])

  useEffect(() => {
    const context = contextRef.current
    if (!context) return
    context.strokeStyle = brushColor
    context.lineWidth = brushSize
  }, [brushColor, brushSize])

  const findToothAtPoint = (x: number, y: number): ToothZone | null => {
    if (toothZones.length === 0) return null

    const baseTolerance = getSelectionSensitivity(selectedTemplate.id)
    const candidates = toothZones.map((item) => {
      const cx = item.x + item.width * 0.5
      const cy = item.y + item.height * 0.52
      const axisX = Math.max(size * 0.018, item.width * 0.55)
      const axisY = Math.max(size * 0.022, item.height * 0.62)
      const nx = (x - cx) / axisX
      const ny = (y - cy) / axisY
      const normalizedDistanceSq = nx * nx + ny * ny
      const euclideanDistance = Math.hypot(x - cx, y - cy)
      const softRadius = Math.min(size * 0.08, Math.max(size * baseTolerance, Math.min(item.width, item.height) * 1.55))
      return { item, normalizedDistanceSq, euclideanDistance, softRadius }
    })

    const insideHits = candidates.filter((candidate) => candidate.normalizedDistanceSq <= 1)
    if (insideHits.length > 0) {
      insideHits.sort((a, b) => a.normalizedDistanceSq - b.normalizedDistanceSq)
      return insideHits[0].item
    }

    const nearHits = candidates.filter((candidate) => candidate.euclideanDistance <= candidate.softRadius)
    if (nearHits.length > 0) {
      nearHits.sort((a, b) => a.euclideanDistance - b.euclideanDistance)
      return nearHits[0].item
    }

    return null
  }

  const markSelectedTooth = (toothId: string) => {
    const context = contextRef.current
    const zone = toothZones.find((item) => item.id === toothId)
    if (!context || !zone) return

    const centerX = zone.x + zone.width * 0.5
    const centerY = zone.y + zone.height * 0.52
    const radius = Math.max(4, size * 0.008)
    const ringRadius = radius * 1.9

    context.beginPath()
    context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2)
    context.strokeStyle = '#111111'
    context.lineWidth = Math.max(1.5, size * 0.0025)
    context.stroke()

    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    context.fillStyle = '#111111'
    context.fill()

    const cross = radius * 1.6
    context.beginPath()
    context.moveTo(centerX - cross, centerY)
    context.lineTo(centerX + cross, centerY)
    context.moveTo(centerX, centerY - cross)
    context.lineTo(centerX, centerY + cross)
    context.strokeStyle = '#111111'
    context.lineWidth = Math.max(1.3, size * 0.0022)
    context.stroke()

    context.fillStyle = '#334155'
    context.font = `${Math.max(9, size * 0.014)}px Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(toothId, centerX, centerY - ringRadius - Math.max(6, size * 0.012))
  }

  const updateHoveredToothHint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || inputMode !== 'tooth-select') {
      setHoveredToothHint(null)
      return
    }

    const point = pointerToCanvas(event, canvas)
    const zone = findToothAtPoint(point.x, point.y)
    if (!zone) {
      setHoveredToothHint(null)
      return
    }

    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width / canvas.width
    const scaleY = rect.height / canvas.height
    const localX = clamp(event.clientX - rect.left, 0, rect.width)
    const localY = clamp(event.clientY - rect.top, 0, rect.height)
    setHoveredToothHint({
      id: zone.id,
      zoneX: zone.x * scaleX,
      zoneY: zone.y * scaleY,
      zoneWidth: zone.width * scaleX,
      zoneHeight: zone.height * scaleY,
      x: localX,
      y: localY,
    })
  }

  const clearHoveredToothHint = () => {
    setHoveredToothHint(null)
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    const snapshot = canvas.toDataURL('image/png')
    setUndoStack((prev) => [...prev, snapshot].slice(-10))

    const point = pointerToCanvas(event, canvas)
    if (inputMode === 'tooth-select') {
      updateHoveredToothHint(event)
      const zone = findToothAtPoint(point.x, point.y)
      if (!zone) return
      const toothId = zone.id
      markSelectedTooth(toothId)
      setSelectedTeeth((prev) => {
        if (prev.includes(toothId)) return prev
        return [...prev, toothId]
      })
      setHasDrawing(true)
      setError('')
      return
    }

    context.beginPath()
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
    canvas.setPointerCapture(event.pointerId)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (inputMode === 'tooth-select') {
      updateHoveredToothHint(event)
      return
    }

    if (!isDrawing) return

    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    const point = pointerToCanvas(event, canvas)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const endDrawing = () => {
    const context = contextRef.current
    if (!context) return

    context.closePath()
    setIsDrawing(false)
    setHasDrawing(true)
  }

  const undo = () => {
    const canvas = canvasRef.current
    const context = contextRef.current
    const previous = undoStack.at(-1)
    if (!canvas || !context || !previous) return

    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      setHasDrawing(true)
      setSelectedTeeth([])
    }
    image.src = previous
    setUndoStack((prev) => prev.slice(0, -1))
    if (undoStack.length <= 1) {
      setHasDrawing(false)
      setSelectedTeeth([])
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    drawDentalTemplate(context, size, toothZones, new Set(), selectedTemplate)
    setUndoStack([])
    setHasDrawing(false)
    setSelectedTeeth([])
    setGeneratedImage('')
    setError('')
    clearHoveredToothHint()
  }

  const generateImage = async (event: FormEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      setError('프롬프트를 입력해 주세요.')
      return
    }

    if (!hasUserMarking) {
      setError('치아 템플릿에서 위치를 선택하거나 스케치를 먼저 그려 주세요.')
      return
    }

    const normalizedCanvas = document.createElement('canvas')
    normalizedCanvas.width = Math.max(512, canvas.width)
    normalizedCanvas.height = Math.max(512, canvas.height)
    const normalizedCtx = normalizedCanvas.getContext('2d')
    if (!normalizedCtx) {
      setError('캔버스 컨텍스트를 초기화하지 못했습니다.')
      return
    }

    normalizedCtx.fillStyle = '#ffffff'
    normalizedCtx.fillRect(0, 0, normalizedCanvas.width, normalizedCanvas.height)
    normalizedCtx.drawImage(canvas, 0, 0, normalizedCanvas.width, normalizedCanvas.height)
    if (selectedTeeth.length > 0) {
      drawSelectionMarkers(normalizedCtx, toothZones, selectedTeeth, size, normalizedCanvas.width)
    }

    const prepared = buildSketchImage(normalizedCanvas, {
      enabled: enableSketchEnhance,
      lineContrast: sketchContrast,
      backgroundThreshold,
      noiseSuppression,
    })

    if (prepared.inkSamples < 30 && selectedTeeth.length === 0) {
      setError('스케치 정보가 너무 적거나 흐립니다. 선을 더 굵고 진하게 다시 그려 주세요.')
      return
    }

    const sketchDataUrl = prepared.dataUrl
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed)
    const locationHint = buildStrictLocationHint(selectedTemplate, selectedTeeth, toothZones, size)

    setError('')
    setIsGenerating(true)
    setGeneratedImage('')

    try {
      const response = await fetch('/api/image-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sketchDataUrl,
          width: size,
          height: size,
          negativePrompt,
          controlScale,
          guidanceScale,
          numSteps,
          locationHint,
          ...(typeof parsedSeed === 'number' && Number.isFinite(parsedSeed) ? { seed: Math.round(parsedSeed) } : {}),
          enableSafetyChecker,
        }),
      })

      const responseText = await response.text()
      let result: GenerateResponse | null = null
      try {
        result = responseText ? (JSON.parse(responseText) as GenerateResponse) : null
      } catch {
        throw new Error(
          `서버 응답 형식이 올바르지 않습니다 (status=${response.status}). 응답 전문: ${responseText.slice(0, 180)}`
        )
      }
      if (!response.ok || !result?.success || !result.imageUrl) {
        throw new Error(normalizeErrorMessage(result?.error, `요청이 실패했습니다 (status=${response.status}).`))
      }

      setGeneratedImage(result.imageUrl)
    } catch (genError) {
      setError(normalizeErrorMessage(genError))
    } finally {
      setIsGenerating(false)
    }
  }

  const download = () => {
    if (!generatedImage) return

    const link = document.createElement('a')
    link.href = generatedImage
    link.download = `ai-image-${Date.now()}.png`
    link.click()
  }

  const sendToEditor = () => {
    if (!generatedImage) return
    onGenerated?.(generatedImage)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">
          템플릿을 고른 뒤 치아를 클릭하거나 스케치로 범위를 표시하면, 선택한 위치를 중심으로 임상 이미지를 생성합니다.
        </p>
        <div className="mt-4 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            1. 템플릿/치아 선택
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            2. 프롬프트 입력
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            3. 생성 후 에디터 전송
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700">도구 설정</h3>
              <div className="inline-flex gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  전체 지우기
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">치아 템플릿</p>
              <div className="mt-2">
                <div className="mb-2 flex flex-wrap gap-2">
                  {TEMPLATE_GROUPS.map((group) => (
                    <button
                      type="button"
                      key={group.id}
                      onClick={() => setTemplateGroupId(group.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                        templateGroupId === group.id
                          ? 'border-sky-600 bg-sky-50 text-sky-700'
                          : 'border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">템플릿 선택</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {visibleTemplates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => setTemplate(template.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                        templateId === template.id
                          ? 'border-sky-600 bg-sky-50 text-sky-700'
                          : 'border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">{selectedTemplate.description}</p>
              </div>
              <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-gray-300">
                <button
                  type="button"
                  onClick={() => setInputMode('draw')}
                  className={`px-3 py-1.5 text-sm ${inputMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                >
                  자유 스케치
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('tooth-select')}
                  className={`border-l border-gray-300 px-3 py-1.5 text-sm ${inputMode === 'tooth-select' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                >
                  치아 선택
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTeeth([])}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600"
                >
                  선택 치아 초기화
                </button>
                <span className="text-xs text-gray-500">
                  Mode: {inputMode === 'tooth-select' ? 'Tooth select mode' : 'Drawing mode'}
                </span>
              </div>
              {selectedTeeth.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedTeeth.map((id) => (
                    <span
                      key={id}
                      className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                    >
                      치아 {id}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">선택된 치아 없음</p>
              )}
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">브러시 굵기: {brushSize}px</span>
                <input
                  type="range"
                  min={2}
                  max={24}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="w-full"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">색상</span>
                <input
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                  className="h-10 w-12 rounded border border-gray-300 p-0"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">캔버스 크기</span>
                <select
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value) as SquareSize)}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2"
                >
                  {SIZE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-4">
              <span className="mb-2 block text-sm text-gray-700">빠른 색상 선택</span>
              <div className="grid grid-cols-6 gap-2">
                {BRUSH_PRESETS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`색상 ${color}`}
                    className={`h-8 rounded-md border ${brushColor === color ? 'border-2 border-blue-600 ring-2 ring-blue-200' : 'border-gray-300'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setBrushColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3">
              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700">스케치 자동 보정</span>
                <input
                  type="checkbox"
                  checked={enableSketchEnhance}
                  onChange={(event) => setEnableSketchEnhance(event.target.checked)}
                />
              </label>

              {enableSketchEnhance ? (
                <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">선명도: {sketchContrast.toFixed(1)}</span>
                    <input
                      type="range"
                      min={1.1}
                      max={3.5}
                      step={0.1}
                      value={sketchContrast}
                      onChange={(event) => setSketchContrast(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">배경 제거 임계값: {backgroundThreshold}</span>
                    <input
                      type="range"
                      min={220}
                      max={255}
                      step={1}
                      value={backgroundThreshold}
                      onChange={(event) => setBackgroundThreshold(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">노이즈 제거: {noiseSuppression}</span>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={1}
                      value={noiseSuppression}
                      onChange={(event) => setNoiseSuppression(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="relative overflow-hidden rounded-xl border border-gray-200">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerEnter={updateHoveredToothHint}
                onPointerUp={endDrawing}
                onPointerLeave={() => {
                  endDrawing()
                  clearHoveredToothHint()
                }}
                onPointerCancel={() => {
                  endDrawing()
                  clearHoveredToothHint()
                }}
                className={`block h-full w-full touch-none bg-white ${inputMode === 'tooth-select' ? 'cursor-crosshair' : 'cursor-crosshair'}`}
                style={{ aspectRatio: '1 / 1' }}
              />
              {hoveredToothHint && inputMode === 'tooth-select' ? (
                <div
                  style={{
                    left: `${hoveredToothHint.x}px`,
                    top: `${hoveredToothHint.y - 28}px`,
                  }}
                  className="pointer-events-none absolute z-20 inline-flex -translate-x-1/2 transform rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow"
                >
                  치아 {hoveredToothHint.id} ({describeTooth(hoveredToothHint.id)}) 클릭 선택
                </div>
              ) : null}
              {hoveredToothHint && inputMode === 'tooth-select' ? (
                <div
                  style={{
                    left: `${hoveredToothHint.zoneX}px`,
                    top: `${hoveredToothHint.zoneY}px`,
                    width: `${hoveredToothHint.zoneWidth}px`,
                    height: `${hoveredToothHint.zoneHeight}px`,
                  }}
                  className="pointer-events-none absolute z-10 rounded-md border-2 border-cyan-500/90 bg-cyan-100/20"
                />
              ) : null}
            </div>

            {!hasUserMarking ? (
              <p className="mt-2 text-xs text-gray-400">
                치아를 클릭하거나 스케치로 병변 위치를 표시해 주세요.
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                선택 치아 {selectedTeeth.length}개
              </p>
            )}
          </div>

          <form
            onSubmit={generateImage}
            className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <label className="block text-sm text-gray-700">
              프롬프트
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="임상 설명, 앵글, 조명, 질감, 병변 위치를 구체적으로 입력해 주세요."
                rows={4}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm text-gray-700">
              네거티브 프롬프트 (선택)
              <input
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Control Scale</span>
                <input
                  type="range"
                  min={0.2}
                  max={1.8}
                  step={0.05}
                  value={controlScale}
                  onChange={(event) => setControlScale(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{controlScale.toFixed(2)}</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Guidance</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={guidanceScale}
                  onChange={(event) => setGuidanceScale(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{guidanceScale.toFixed(1)}</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Steps</span>
                <input
                  type="range"
                  min={8}
                  max={60}
                  value={numSteps}
                  onChange={(event) => setNumSteps(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{numSteps} steps</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Seed (선택)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="예: 42"
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableSafetyChecker}
                onChange={(event) => setEnableSafetyChecker(event.target.checked)}
              />
              안전 필터 사용
            </label>

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim() || !hasUserMarking}
              className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {isGenerating ? 'AI 이미지 생성 중...' : 'AI 이미지 생성'}
            </button>
          </form>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">생성 결과</h3>
              {generatedImage && (
                <div className="inline-flex gap-2">
                  <button
                    type="button"
                    onClick={download}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={sendToEditor}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700"
                  >
                    에디터로 전송
                  </button>
                </div>
              )}
            </div>

            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              {generatedImage ? (
                <img src={generatedImage} alt="AI 생성 결과" className="h-auto w-full rounded-xl" />
              ) : (
                <p className="px-4 text-center text-sm text-gray-400">
                  이미지가 생성되면 여기에 미리보기가 표시됩니다. 프롬프트 입력 후 생성 버튼을 눌러 주세요.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            참고: 템플릿과 치아 선택 정보가 프롬프트에 함께 반영되어 위치 정확도를 높입니다.
          </div>
        </div>
      </div>
    </div>
  )
}
