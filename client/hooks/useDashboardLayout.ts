import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DashboardSectionId = 
  | 'description'
  | 'weather'
  | 'conditions'
  | 'speed'
  | 'batteryPower'
  | 'throttleMode'
  | 'motorTelemetry'
  | 'bmsMotor'
  | 'deviceInfo'
  | 'exportReport';

export const DEFAULT_SECTION_ORDER: DashboardSectionId[] = [
  'description',
  'weather',
  'conditions',
  'speed',
  'batteryPower',
  'throttleMode',
  'motorTelemetry',
  'bmsMotor',
  'deviceInfo',
  'exportReport',
];

const STORAGE_KEY = 'dashboard_section_order';

function validateSectionOrder(saved: any): saved is DashboardSectionId[] {
  if (!Array.isArray(saved)) {
    return false;
  }
  
  const defaultSet = new Set(DEFAULT_SECTION_ORDER);
  
  // Check if all items in saved exist in default
  for (const item of saved) {
    if (!defaultSet.has(item)) {
      return false;
    }
  }
  
  // Check if lengths match (no missing or extra items)
  return saved.length === DEFAULT_SECTION_ORDER.length;
}

export function useDashboardLayout() {
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionId[]>(DEFAULT_SECTION_ORDER);
  const [isEditMode, setIsEditMode] = useState(false);

  // Load saved order from AsyncStorage on mount
  useEffect(() => {
    const loadSavedOrder = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (validateSectionOrder(parsed)) {
            setSectionOrder(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard layout:', error);
      }
    };

    loadSavedOrder();
  }, []);

  // Save order to AsyncStorage
  const saveOrder = useCallback(async (order: DashboardSectionId[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch (error) {
      console.error('Failed to save dashboard layout:', error);
    }
  }, []);

  // Move a section up or down
  const moveSection = useCallback((id: DashboardSectionId, direction: 'up' | 'down') => {
    setSectionOrder((prevOrder) => {
      const currentIndex = prevOrder.indexOf(id);
      
      if (currentIndex === -1) return prevOrder;
      
      if (direction === 'up' && currentIndex === 0) return prevOrder;
      if (direction === 'down' && currentIndex === prevOrder.length - 1) return prevOrder;

      const newOrder = [...prevOrder];
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      // Swap elements
      [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];
      
      // Save the new order
      saveOrder(newOrder);
      
      return newOrder;
    });
  }, [saveOrder]);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  // Reset layout to default
  const resetLayout = useCallback(async () => {
    setSectionOrder(DEFAULT_SECTION_ORDER);
    await saveOrder(DEFAULT_SECTION_ORDER);
  }, [saveOrder]);

  return {
    sectionOrder,
    isEditMode,
    moveSection,
    toggleEditMode,
    resetLayout,
  };
}
