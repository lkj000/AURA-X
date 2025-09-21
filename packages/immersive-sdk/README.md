# Aura Immersive SDK v1.0

This SDK extends the AuraPlugins SDK to allow creators to build and monetize AR experiences ("Immersive Style Packs") on the AURA-X Style Exchange.

## Installation
`npm install @aura/immersive-sdk`

## Example: Creating a Lo-fi Pack

```tsx
import React from 'react';
import { ImmersiveStylePack, ARMapping, AudioEffect, VisualAsset } from '@aura/immersive-sdk';

export default function LofiImmersivePack() {
  return (
    <ImmersiveStylePack
      name="Vintage Lofi Rain"
      experienceType="immersive_pack"
      styleData={{ basePrompt: "lofi, rain, vintage vinyl" }}
    >
      <ARMapping objectId="window">
        <AudioEffect type="rain_ambience" mix={0.8} />
        <VisualAsset type="gltf" src="./assets/rain.glb" />
      </ARMapping>
      
      <ARMapping objectId="cup">
        <AudioEffect type="vinyl_crackle" mix={0.3} />
        <VisualAsset type="gltf" src="./assets/mug.glb" scale={0.5} />
      </ARMapping>
    </ImmersiveStylePack>
  );
}