# AuraPlugins SDK v1.0

The official SDK for building web-native plugins for the AURA-X ecosystem using React.

## Core Concept

You build your plugin's UI as a standard React component. The SDK provides a set of hooks that act as a bridge, seamlessly connecting your UI elements to the high-performance C++ audio engine running in the AURA-X DAW.

## Installation
`npm install -g aura-cli`

## Getting Started: Your First Gain Plugin

1.  **Create a new plugin:**
    `aura-cli create my-gain-plugin`

2.  **Edit the UI (`src/Plugin.tsx`):**

    ```tsx
    import React from 'react';
    import { useParameter, useAudioBuffer } from '@aura/react-sdk';
    
    export default function GainPlugin() {
      // Connect a UI slider to a C++ audio parameter named 'gain'.
      // The SDK handles the two-way communication.
      const [gain, setGain] = useParameter('gain', {
        defaultValue: 0.8, min: 0, max: 1.0, name: 'Gain'
      });
      
      // Access the real-time audio buffer for visualization (optional).
      // const audioBuffer = useAudioBuffer();
    
      return (
        <div className="p-4 bg-gray-800 text-white">
          <label htmlFor="gain-slider" className="font-bold">Gain</label>
          <input 
            id="gain-slider"
            type="range" 
            min={0} max={1} step={0.01}
            value={gain} 
            onChange={e => setGain(parseFloat(e.target.value))}
            className="w-full mt-2"
          />
          <p className="text-center mt-1">{Math.round(gain * 100)}%</p>
        </div>
      );
    }
    ```

3.  **Run your plugin:**
    Load the plugin from the AURA-X DAW's developer menu to see it run in real-time.