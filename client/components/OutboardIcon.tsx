import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';

interface OutboardIconProps {
  size?: number;
  color?: string;
  focused?: boolean;
}

export function OutboardIcon({ size = 24, color = '#FFFFFF', focused = false }: OutboardIconProps) {
  const strokeWidth = focused ? 2 : 1.8;
  
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        {/* Motor body */}
        <Path
          d="M12 3C10.5 3 9.5 4 9.5 5.5V8H14.5V5.5C14.5 4 13.5 3 12 3Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Motor shaft */}
        <Path
          d="M11 8V14"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Path
          d="M13 8V14"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Propeller hub */}
        <Circle
          cx="12"
          cy="17"
          r="2"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Propeller blade 1 - top right */}
        <Path
          d="M13.5 15.5C15 14.5 17 14.5 18 15.5C18.5 16 18 17 17 17.5C16 18 14.5 17.5 13.5 16.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={focused ? color : "none"}
          fillOpacity={focused ? 0.2 : 0}
        />
        {/* Propeller blade 2 - bottom left */}
        <Path
          d="M10.5 18.5C9 19.5 7 19.5 6 18.5C5.5 18 6 17 7 16.5C8 16 9.5 16.5 10.5 17.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={focused ? color : "none"}
          fillOpacity={focused ? 0.2 : 0}
        />
        {/* Propeller blade 3 - bottom right */}
        <Path
          d="M13.5 18.5C15 19.5 17 19.5 18 18.5C18.5 18 18 17 17 16.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={focused ? color : "none"}
          fillOpacity={focused ? 0.2 : 0}
        />
      </G>
    </Svg>
  );
}
