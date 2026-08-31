import { createContext, ReactNode, useContext, useState } from 'react';

type SetPortalContent = (node: ReactNode | null) => void;

const ZoomPortalContext = createContext<SetPortalContent | null>(null);

/**
 * Mounted once near the app root. Lets a pinch gesture anywhere deep in the
 * tree (a feed photo, a Plato video) "teleport" its zoomed content up here so
 * it paints full-screen, above the tab bar and everything else — without ever
 * touching a native Modal, which would cut the gesture handler's in-flight
 * touch off mid-pinch. The touch stays owned by the originating view the
 * whole time; this just renders a mirror of it elsewhere.
 */
export function ZoomPortalProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null);
  return (
    <ZoomPortalContext.Provider value={setNode}>
      {children}
      {node}
    </ZoomPortalContext.Provider>
  );
}

export function useZoomPortal() {
  const setNode = useContext(ZoomPortalContext);
  if (!setNode) throw new Error('useZoomPortal must be used within ZoomPortalProvider');
  return setNode;
}
