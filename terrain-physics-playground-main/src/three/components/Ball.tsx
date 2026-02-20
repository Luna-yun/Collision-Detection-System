import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Arrow } from './Arrow';
import { Face, pointInTriangle, projectOnto, reflect } from '../physics/math';

function getGroundInfo(x: number, z: number, faces: Face[]) {
  let best: null | { y: number; normal: THREE.Vector3; id: number } = null;
  const tmp = new THREE.Vector3();
  for (const f of faces) {
    const n = f.normal; // assumed unit
    // Skip near-vertical faces
    if (Math.abs(n.y) < 1e-4) continue;
    const dx = x - f.a.x;
    const dz = z - f.a.z;
    const y = f.a.y - (n.x * dx + n.z * dz) / n.y; // ray-plane intersection independent of ray origin
    tmp.set(x, y, z);
    if (!pointInTriangle(tmp, f.a, f.b, f.c)) continue;
    if (!best || y > best.y) best = { y, normal: n, id: f.id };
  }
  return best;
}

export function Ball({
  faces,
  radius = 0.25,
  initialPosition = [0, 2, 0],
  launched,
  launchVector,
  onHighlightFace,
  onVectorUpdate,
  resetCount,
  keyboardControl = true,
}: {
  faces: Face[];
  radius?: number;
  initialPosition?: [number, number, number];
  launched: boolean;
  launchVector: [number, number, number];
  onHighlightFace?: (id: number | null) => void;
  onVectorUpdate?: (vectors: {
    velocity: THREE.Vector3;
    normal: THREE.Vector3;
    projection: THREE.Vector3;
    reflection: THREE.Vector3;
  }) => void;
  resetCount: number;
  keyboardControl?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const velocityRef = useRef(new THREE.Vector3());

  // Dynamic vector refs for live arrows at contact point
  const contactRef = useRef(new THREE.Vector3());
  const incomingRef = useRef(new THREE.Vector3());
  const normalRef = useRef(new THREE.Vector3(0, 1, 0));
  const projectionRef = useRef(new THREE.Vector3());
  const reflectionRef = useRef(new THREE.Vector3());

  const [impact, setImpact] = useState<null | {
    point: THREE.Vector3;
    incoming: THREE.Vector3;
    normal: THREE.Vector3;
    projection: THREE.Vector3;
    reflection: THREE.Vector3;
    until: number;
  }>(null);

  const [currentFaceId, setCurrentFaceId] = useState<number | null>(null);
  const lastVectorUpdate = useRef(0);

  const startPos = useMemo(() => new THREE.Vector3(...initialPosition), [initialPosition]);

  // Keyboard input
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!keyboardControl) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) {
        keys.current[k] = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) {
        keys.current[k] = false;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [keyboardControl]);

  // Initialize ball position on mount, reset, or terrain change
  useEffect(() => {
    if (!meshRef.current || faces.length === 0) return;
    // Place on ground if available
    const g = getGroundInfo(startPos.x, startPos.z, faces);
    const y = g ? g.y + radius : startPos.y;
    meshRef.current.position.set(startPos.x, y, startPos.z);
    velocityRef.current.set(0, 0, 0);
    contactRef.current.set(startPos.x, y - radius, startPos.z);
    normalRef.current.copy(g?.normal ?? new THREE.Vector3(0, 1, 0));
    projectionRef.current.set(0, 0, 0);
    reflectionRef.current.set(0, 0, 0);
    setImpact(null);
    setCurrentFaceId(null);
    
    // Highlight initial face
    if (g) {
      setCurrentFaceId(g.id);
      onHighlightFace?.(g.id);
    }
  }, [resetCount, faces]); // Reset on explicit resetCount change or when terrain faces change

  // Take snapshot of launch velocity when launched becomes true (legacy launch mode)
  const prevLaunched = useRef(false);
  useEffect(() => {
    if (!keyboardControl) {
      if (launched && !prevLaunched.current) {
        velocityRef.current.set(launchVector[0], launchVector[1], launchVector[2]);
      }
      prevLaunched.current = launched;
    }
  }, [launched, launchVector, keyboardControl]);

  useFrame((_, dt) => {
    const delta = Math.min(dt, 1 / 60);

    // No boundary checks - let ball move freely

    if (keyboardControl) {
      const speed = 5; // units/sec
      const gravity = -9.81; // m/s²
      
      const input = new THREE.Vector3(
        (keys.current['d'] ? 1 : 0) - (keys.current['a'] ? 1 : 0),
        0,
        (keys.current['w'] ? 1 : 0) - (keys.current['s'] ? 1 : 0)
      );

      // Apply WASD input to horizontal velocity
      if (input.lengthSq() > 0) {
        input.normalize().multiplyScalar(speed);
        velocityRef.current.x = input.x;
        velocityRef.current.z = input.z;
      } else {
        // Damping when no input
        velocityRef.current.x *= 0.9;
        velocityRef.current.z *= 0.9;
      }

      // Always apply gravity
      velocityRef.current.y += gravity * delta;

      // Update position based on velocity
      meshRef.current.position.addScaledVector(velocityRef.current, delta);

      // Auto-reset if ball falls out of terrain bounds
      const terrainSize = 10; // Match terrain size from Terrain component
      const resetThreshold = -5; // Reset if ball falls 5 units below terrain
      const pos = meshRef.current.position;
      
      if (pos.y < resetThreshold || 
          Math.abs(pos.x) > terrainSize * 0.6 || 
          Math.abs(pos.z) > terrainSize * 0.6) {
        // Reset ball to starting position
        const g = getGroundInfo(startPos.x, startPos.z, faces);
        const resetY = g ? g.y + radius : startPos.y;
        meshRef.current.position.set(startPos.x, resetY, startPos.z);
        velocityRef.current.set(0, 0, 0);
        
        // Clear vectors and highlighting
        onVectorUpdate?.({
          velocity: new THREE.Vector3(0, 0, 0),
          normal: new THREE.Vector3(0, 0, 0),
          projection: new THREE.Vector3(0, 0, 0),
          reflection: new THREE.Vector3(0, 0, 0),
        });
        setCurrentFaceId(null);
        onHighlightFace?.(null);
        
        return; // Skip collision detection this frame
      }

      // Check for ground collision
      const g = getGroundInfo(meshRef.current.position.x, meshRef.current.position.z, faces);
      if (g && meshRef.current.position.y <= g.y + radius) {
        // Collision with ground
        meshRef.current.position.y = g.y + radius;
        velocityRef.current.y = Math.max(0, velocityRef.current.y); // Stop downward movement
        
        // Update contact point and vectors for visualization
        contactRef.current.set(meshRef.current.position.x, g.y, meshRef.current.position.z);
        normalRef.current.copy(g.normal);
        
        const horizontalVel = new THREE.Vector3(velocityRef.current.x, 0, velocityRef.current.z);
        incomingRef.current.copy(horizontalVel);
        projectionRef.current.copy(projectOnto(horizontalVel, g.normal));
        reflectionRef.current.copy(reflect(horizontalVel, g.normal));
        
        // Throttle vector updates to improve performance (update every 50ms)
        const now = performance.now();
        if (now - lastVectorUpdate.current > 50) {
          onVectorUpdate?.({
            velocity: incomingRef.current.clone(),
            normal: normalRef.current.clone(),
            projection: projectionRef.current.clone(),
            reflection: reflectionRef.current.clone(),
          });
          lastVectorUpdate.current = now;
        }
        
        // Update face highlighting
        if (g.id !== currentFaceId) {
          setCurrentFaceId(g.id);
          onHighlightFace?.(g.id);
        }
      } else {
        // No ground collision - clear face highlighting
        if (currentFaceId !== null) {
          setCurrentFaceId(null);
          onHighlightFace?.(null);
        }
        // Clear vector display when not on ground (throttled)
        const now = performance.now();
        if (now - lastVectorUpdate.current > 100) {
          onVectorUpdate?.({
            velocity: new THREE.Vector3(0, 0, 0),
            normal: new THREE.Vector3(0, 0, 0),
            projection: new THREE.Vector3(0, 0, 0),
            reflection: new THREE.Vector3(0, 0, 0),
          });
          lastVectorUpdate.current = now;
        }
      }

      return; // skip legacy physics below
    }

    // Legacy launch mode (kept for compatibility)
    if (!launched) return;

    // Apply gravity
    velocityRef.current.y -= 9.8 * delta;

    // Integrate
    meshRef.current.position.addScaledVector(velocityRef.current, delta);

    // Check collisions with spatial optimization
    const p = meshRef.current.position;
    const v = velocityRef.current;
    
    // Only check collision if ball is moving fast enough
    if (v.lengthSq() < 0.01) return;
    
    // Spatial culling: only check faces within reasonable distance
    const maxCheckDistance = radius + 2.0;
    let nearbyFaces = faces;
    
    // If we have many faces, do spatial culling
    if (faces.length > 100) {
      nearbyFaces = faces.filter(f => {
        const distSq = f.centroid.distanceToSquared(p);
        return distSq < maxCheckDistance * maxCheckDistance;
      });
    }

    for (const f of nearbyFaces) {
      // Check if moving towards the plane
      const n = f.normal;
      const approaching = v.dot(n) < 0;
      if (!approaching) continue;

      // Signed distance to plane
      const dist = n.dot(p.clone().sub(f.a));
      if (dist > radius) continue; // too far from plane

      // collision point projected onto plane
      const projPoint = p.clone().sub(n.clone().multiplyScalar(dist));
      if (!pointInTriangle(projPoint, f.a, f.b, f.c)) continue;

      // Collision!
      onHighlightFace?.(f.id);

      // Move ball out of penetration
      const penetration = radius - dist;
      if (penetration > 0) {
        p.add(n.clone().multiplyScalar(penetration + 1e-3));
      }

      // Vectors for visuals
      const incoming = v.clone();
      const projection = projectOnto(incoming, n);
      const reflection = reflect(incoming, n);

      // Update velocity
      velocityRef.current.copy(reflection);

      // Show vectors briefly
      setImpact({
        point: projPoint.clone(),
        incoming,
        normal: n.clone(),
        projection,
        reflection,
        until: performance.now() + 1500,
      });
      break; // handle one face per frame
    }

    // Clear expired visuals
    if (impact && performance.now() > impact.until) {
      setImpact(null);
    }
  });

  // Pre-shot launch arrow (legacy)
  const showLaunchArrow = !keyboardControl && !launched && (launchVector[0] !== 0 || launchVector[1] !== 0 || launchVector[2] !== 0);
  const launchDir = useMemo(() => new THREE.Vector3(...launchVector), [launchVector]);

  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshLambertMaterial color={'#ef4444'} />
      </mesh>

      {showLaunchArrow && (
        <Arrow origin={meshRef.current ? meshRef.current.position : startPos} dir={launchDir} color="#ef4444" />
      )}

      {/* Live ground-contact vectors in keyboard mode */}
      {keyboardControl && (
        <group>
          <Arrow origin={contactRef.current} dir={incomingRef.current} color="#ef4444" />
          <Arrow origin={contactRef.current} dir={normalRef.current} length={1} color="#22c55e" />
          <Arrow origin={contactRef.current} dir={projectionRef.current} color="#3b82f6" />
          <Arrow origin={contactRef.current} dir={reflectionRef.current} color="#eab308" />
        </group>
      )}

      {/* Impact vectors (legacy launch mode) */}
      {!keyboardControl && impact && (
        <group>
          <Arrow origin={impact.point} dir={impact.incoming} color="#ef4444" />
          <Arrow origin={impact.point} dir={impact.normal} length={1} color="#22c55e" />
          <Arrow origin={impact.point} dir={impact.projection} color="#3b82f6" />
          <Arrow origin={impact.point} dir={impact.reflection} color="#eab308" />
        </group>
      )}
    </group>
  );
}
