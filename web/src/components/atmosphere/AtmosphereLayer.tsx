'use client';

import { Component, ReactNode } from 'react';
import CloudField from './CloudField';
import FlowerAnchor from './FlowerAnchor';
import { useAtmosphere } from './AtmosphereContext';

class SublayerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.warn('[atmosphere] sublayer failed:', err);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LayerBody() {
  const { phase } = useAtmosphere();
  return (
    <div
      className="atmo-layer"
      data-reveal-pulse={phase === 'reveal' ? '1' : undefined}
      aria-hidden="true"
    >
      <SublayerBoundary>
        <CloudField />
      </SublayerBoundary>
      <SublayerBoundary>
        <FlowerAnchor />
      </SublayerBoundary>
    </div>
  );
}

/** Fixed-слой атмосферы между фоном (.app-bg) и контентом. */
export default function AtmosphereLayer() {
  return <LayerBody />;
}
