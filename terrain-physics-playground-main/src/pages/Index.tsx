import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terrain, type TerrainType } from "@/three/components/Terrain";
import { Ball } from "@/three/components/Ball";
import type { Face } from "@/three/physics/math";
import { useSEO } from "@/hooks/useSEO";
import * as THREE from "three";

const Index = () => {
  useSEO({
    title: "3D Ball Collision Simulation | Vector Reflection",
    description: "Interactive Three.js demo: shoot a ball at uneven terrain, see normals, projections, and reflections visualized in 3D.",
    canonical: typeof window !== 'undefined' ? window.location.href : undefined,
  });

  const [launched, setLaunched] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [faces, setFaces] = useState<Face[]>([]);
  const [highlightedFaceId, setHighlightedFaceId] = useState<number | null>(null);
  const [terrainType, setTerrainType] = useState<TerrainType>("rough");
  const [vectors, setVectors] = useState<{
    velocity: THREE.Vector3;
    normal: THREE.Vector3;
    projection: THREE.Vector3;
    reflection: THREE.Vector3;
  }>({
    velocity: new THREE.Vector3(0, 0, 0),
    normal: new THREE.Vector3(0, 0, 0),
    projection: new THREE.Vector3(0, 0, 0),
    reflection: new THREE.Vector3(0, 0, 0),
  });

  const launchVector: [number, number, number] = [0, 0, 0];



  const handleReset = () => {
    setLaunched(false);
    setResetCount((c) => c + 1);
    setHighlightedFaceId(null);
  };

  const onHighlightFace = (id: number | null) => {
    setHighlightedFaceId(id);
    // Don't auto-clear highlighting - let it persist or clear when null
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container py-6">
        <h1 className="text-3xl font-semibold">3D Ball-Terrain Collision Simulation</h1>
        <p className="text-sm text-muted-foreground mt-1">Adjust velocity, shoot the ball, and observe vector math at impact.</p>
      </header>

      <main className="container grid lg:grid-cols-[1fr_320px] gap-6 pb-10">
        <section className="rounded-lg border bg-card">
          <Canvas shadows camera={{ position: [8, 8, 8], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight 
              castShadow 
              position={[10, 12, 8]} 
              intensity={1.0}
              shadow-mapSize={[2048, 2048]}
              shadow-camera-near={0.5}
              shadow-camera-far={50}
              shadow-camera-left={-10}
              shadow-camera-right={10}
              shadow-camera-top={10}
              shadow-camera-bottom={-10}
            />
            <pointLight position={[-5, 8, 5]} intensity={0.3} color="#ffffff" />

            <group position={[0, 0, 0]}>
              <Terrain onFacesReady={setFaces} highlightedFaceId={highlightedFaceId} terrainType={terrainType} />
              <Ball
                faces={faces}
                radius={0.3}
                initialPosition={[0, 0, 0]}
                launched={launched}
                launchVector={launchVector}
                onHighlightFace={onHighlightFace}
                onVectorUpdate={setVectors}
                resetCount={resetCount}
                keyboardControl
              />

              {/* Soft ground plane for shadow catch */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
                <planeGeometry args={[50, 50]} />
                <shadowMaterial opacity={0.2} />
              </mesh>
            </group>

            <OrbitControls enableDamping makeDefault />
          </Canvas>
        </section>

        <aside className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-medium mb-4">Controls</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Terrain Type</label>
              <Select value={terrainType} onValueChange={setTerrainType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select terrain type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rough">Default (Rough)</SelectItem>
                  <SelectItem value="smooth">Smooth</SelectItem>
                  <SelectItem value="hills">Hills</SelectItem>
                  <SelectItem value="valleys">Valleys</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={handleReset} className="flex-1">Reset</Button>
            </div>

            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Vector Values</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-red-500 font-medium">Velocity:</span>
                  <span className="font-mono">
                    ({vectors.velocity.x.toFixed(2)}, {vectors.velocity.y.toFixed(2)}, {vectors.velocity.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-500 font-medium">Normal:</span>
                  <span className="font-mono">
                    ({vectors.normal.x.toFixed(2)}, {vectors.normal.y.toFixed(2)}, {vectors.normal.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-500 font-medium">Projection:</span>
                  <span className="font-mono">
                    ({vectors.projection.x.toFixed(2)}, {vectors.projection.y.toFixed(2)}, {vectors.projection.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-500 font-medium">Reflection:</span>
                  <span className="font-mono">
                    ({vectors.reflection.x.toFixed(2)}, {vectors.reflection.y.toFixed(2)}, {vectors.reflection.z.toFixed(2)})
                  </span>
                </div>
              </CardContent>
            </Card>
            
            <div className="text-xs text-muted-foreground pt-2">
              Tips: Use WASD keys to control the ball. Vector values update when ball touches ground.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Index;
